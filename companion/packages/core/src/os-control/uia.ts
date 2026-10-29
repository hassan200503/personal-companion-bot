import { execFile } from 'node:child_process';
import type { CapabilityReport } from './capability-store.js';

export interface UiAutomationProbe {
  processId: number;
  windowName: string;
  descendantCount: number;
  controls: readonly UiAutomationControl[];
}

export interface UiAutomationControl {
  name: string;
  automationId: string;
  controlType: string;
  hasInvoke: boolean;
  hasValue: boolean;
}

export interface UiAutomationSelector {
  automationId?: string;
  name?: string;
  controlType?: string;
}

export type UiAutomationAction =
  | { kind: 'invoke' }
  | { kind: 'setValue'; value: string }
  | { kind: 'readValue' };

export interface UiAutomationActionResult {
  ok: boolean;
  observed: boolean;
  value?: string;
  error?: string;
}

const powershell = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$inputJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__INPUT__'))
$request = $inputJson | ConvertFrom-Json
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$request.processId)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
if (-not $window -and -not [string]::IsNullOrWhiteSpace($request.windowName)) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($candidate in $windows) {
    if ([string]$candidate.Current.Name -like ('*' + [string]$request.windowName + '*')) { $window = $candidate; break }
  }
}
if (-not $window) { throw 'target_window_not_found' }
$children = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$match = $null
foreach ($child in $children) {
  $id = [string]$child.Current.AutomationId
  $name = [string]$child.Current.Name
  $type = [string]$child.Current.ControlType.ProgrammaticName
  $idMatch = ([string]::IsNullOrWhiteSpace($request.selector.automationId) -or $id -eq [string]$request.selector.automationId)
  $nameMatch = ([string]::IsNullOrWhiteSpace($request.selector.name) -or $name -eq [string]$request.selector.name)
  $typeMatch = ([string]::IsNullOrWhiteSpace($request.selector.controlType) -or $type -like ('*' + [string]$request.selector.controlType + '*'))
  if ($idMatch -and $nameMatch -and $typeMatch) { $match = $child; break }
}
if ($request.mode -eq 'probe') {
  $items = @()
  foreach ($child in ($children | Select-Object -First 200)) {
    $pattern = $null
    $hasInvoke = $child.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)
    $pattern = $null
    $hasValue = $child.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)
    $items += [pscustomobject]@{ name = [string]$child.Current.Name; automationId = [string]$child.Current.AutomationId; controlType = [string]$child.Current.ControlType.ProgrammaticName; hasInvoke = $hasInvoke; hasValue = $hasValue }
  }
  [pscustomobject]@{ processId = [int]$request.processId; windowName = [string]$window.Current.Name; descendantCount = $children.Count; controls = $items } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
if (-not $match) { throw 'element_not_found' }
if ($request.mode -eq 'invoke') {
  $pattern = $null
  if (-not $match.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { throw 'invoke_pattern_unavailable' }
  ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
  [pscustomobject]@{ ok = $true; observed = $true } | ConvertTo-Json -Compress
} elseif ($request.mode -eq 'setValue') {
  $pattern = $null
  if (-not $match.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { throw 'value_pattern_unavailable' }
  ([System.Windows.Automation.ValuePattern]$pattern).SetValue([string]$request.value)
  [pscustomobject]@{ ok = $true; observed = $true; value = [string]$request.value } | ConvertTo-Json -Compress
} elseif ($request.mode -eq 'readValue') {
  $pattern = $null
  if (-not $match.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { throw 'value_pattern_unavailable' }
  [pscustomobject]@{ ok = $true; observed = $true; value = ([System.Windows.Automation.ValuePattern]$pattern).Current.Value } | ConvertTo-Json -Compress
} else { throw 'unsupported_mode' }
`;

export async function probeUiAutomation(processId: number, timeoutMs = 8_000, windowName?: string): Promise<UiAutomationProbe> {
  if (!Number.isInteger(processId) || processId <= 0) throw new Error('invalid_process_id');
  const result = await invokePowerShell({ processId, windowName, selector: {}, mode: 'probe' }, timeoutMs);
  if (!result.ok) throw new Error(result.error ?? 'uia_probe_failed');
  const parsed = JSON.parse(result.stdout) as UiAutomationProbe;
  if (!Number.isInteger(parsed.processId) || !Array.isArray(parsed.controls)) throw new Error('invalid_uia_probe_result');
  return parsed;
}

export async function performUiAutomationAction(
  processId: number,
  selector: UiAutomationSelector,
  action: UiAutomationAction,
  timeoutMs = 8_000
): Promise<UiAutomationActionResult> {
  if (!Number.isInteger(processId) || processId <= 0) return { ok: false, observed: false, error: 'invalid_process_id' };
  if (!selector.automationId && !selector.name && !selector.controlType) return { ok: false, observed: false, error: 'selector_required' };
  const request = action.kind === 'setValue'
    ? { processId, selector, mode: action.kind, value: action.value }
    : { processId, selector, mode: action.kind };
  const result = await invokePowerShell(request, timeoutMs);
  if (!result.ok) return { ok: false, observed: false, error: result.error ?? 'uia_action_failed' };
  try {
    const parsed = JSON.parse(result.stdout) as UiAutomationActionResult;
    return { ok: parsed.ok === true, observed: parsed.observed === true, value: parsed.value };
  } catch {
    return { ok: false, observed: false, error: 'invalid_uia_action_result' };
  }
}

export async function probeCapability(
  appId: string,
  version: string,
  processId: number,
  now = new Date().toISOString()
): Promise<CapabilityReport> {
  const probe = await probeUiAutomation(processId);
  return {
    appId,
    version,
    integrity: 'unknown',
    accessibilityElements: probe.descendantCount,
    supportedLevels: probe.descendantCount > 0 ? ['L2'] : [],
    successRate: probe.descendantCount > 0 ? 1 : 0,
    observations: 1,
    verifiedAt: now,
  };
}

function invokePowerShell(request: Record<string, unknown>, timeoutMs: number): Promise<{ ok: boolean; stdout: string; error?: string }> {
  const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
  const script = powershell.replace('__INPUT__', encoded);
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], { windowsHide: true, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, stdout: '', error: stderr.trim() || error.message });
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}
