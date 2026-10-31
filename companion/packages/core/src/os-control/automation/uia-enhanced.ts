/**
 * Enhanced UI Automation Bridge
 *
 * Extends the basic UIA PowerShell bridge with:
 * - Action execution with verification
 * - Error handling and diagnostics
 * - Timeout management
 */

import { execFile } from 'node:child_process';
import type { UiAutomationSelector, UiAutomationAction, UiAutomationActionResult, UiAutomationControl } from '../uia.js';
import { probeUiAutomation as probe } from '../uia.js';

// Re-export for convenience
export { probe as probeUiAutomation };

interface UiAutomationCandidate {
  control: UiAutomationControl;
  similarity: number;
}

/**
 * Perform a UI automation action on an element
 */
export async function performUiAction(
  processId: number,
  windowName: string | undefined,
  selector: UiAutomationSelector,
  action: UiAutomationAction,
  timeoutMs = 8000
): Promise<UiAutomationActionResult> {
  try {
    // Build PowerShell script for action execution
    const script = buildActionScript(processId, windowName, selector, action);
    
    // Execute via PowerShell
    const result = await executePowerShellScript(script, timeoutMs);
    
    if (!result.ok) {
      return {
        ok: false,
        observed: false,
        error: result.error ?? 'action_failed'
      };
    }
    
    // Parse result
    try {
      const parsed = JSON.parse(result.stdout) as UiAutomationActionResult;
      return parsed;
    } catch (parseError) {
      return {
        ok: false,
        observed: false,
        error: `Failed to parse result: ${parseError}`
      };
    }
    
  } catch (error) {
    return {
      ok: false,
      observed: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Build PowerShell script for action execution
 */
function buildActionScript(
  processId: number,
  windowName: string | undefined,
  selector: UiAutomationSelector,
  action: UiAutomationAction
): string {
  const request = {
    processId,
    windowName: windowName ?? '',
    selector,
    mode: action.kind,
    value: action.kind === 'setValue' ? action.value : undefined
  };
  
  const inputJson = JSON.stringify(request);
  const inputBase64 = Buffer.from(inputJson, 'utf-8').toString('base64');
  
  // Use the existing PowerShell script template from uia.ts
  // but adapted for action execution
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$inputJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${inputBase64}'))
$request = $inputJson | ConvertFrom-Json

try {
  # Find target window
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, 
    [int]$request.processId
  )
  $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  
  if (-not $window -and -not [string]::IsNullOrWhiteSpace($request.windowName)) {
    $windows = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Children, 
      [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($candidate in $windows) {
      if ([string]$candidate.Current.Name -like ('*' + [string]$request.windowName + '*')) {
        $window = $candidate
        break
      }
    }
  }
  
  if (-not $window) {
    throw 'target_window_not_found'
  }
  
  # Find all descendant elements
  $children = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants, 
    [System.Windows.Automation.Condition]::TrueCondition
  )
  
  # Find matching element
  $match = $null
  foreach ($child in $children) {
    $id = [string]$child.Current.AutomationId
    $name = [string]$child.Current.Name
    $type = [string]$child.Current.ControlType.ProgrammaticName
    
    $idMatch = ([string]::IsNullOrWhiteSpace($request.selector.automationId) -or $id -eq [string]$request.selector.automationId)
    $nameMatch = ([string]::IsNullOrWhiteSpace($request.selector.name) -or $name -eq [string]$request.selector.name)
    $typeMatch = ([string]::IsNullOrWhiteSpace($request.selector.controlType) -or $type -like ('*' + [string]$request.selector.controlType + '*'))
    
    if ($idMatch -and $nameMatch -and $typeMatch) {
      $match = $child
      break
    }
  }
  
  if (-not $match) {
    throw 'element_not_found'
  }
  
  # Execute action based on mode
  if ($request.mode -eq 'invoke') {
    $pattern = $null
    if (-not $match.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
      throw 'invoke_pattern_unavailable'
    }
    ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
    [pscustomobject]@{ ok = $true; observed = $true } | ConvertTo-Json -Compress
    
  } elseif ($request.mode -eq 'setValue') {
    $pattern = $null
    if (-not $match.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      throw 'value_pattern_unavailable'
    }
    ([System.Windows.Automation.ValuePattern]$pattern).SetValue([string]$request.value)
    [pscustomobject]@{ ok = $true; observed = $true; value = [string]$request.value } | ConvertTo-Json -Compress
    
  } elseif ($request.mode -eq 'readValue') {
    $pattern = $null
    if (-not $match.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      throw 'value_pattern_unavailable'
    }
    $currentValue = ([System.Windows.Automation.ValuePattern]$pattern).Current.Value
    [pscustomobject]@{ ok = $true; observed = $true; value = $currentValue } | ConvertTo-Json -Compress
    
  } else {
    throw 'unsupported_mode'
  }
  
} catch {
  [pscustomobject]@{ ok = $false; observed = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();
}

/**
 * Execute PowerShell script with timeout
 */
function executePowerShellScript(
  script: string,
  timeoutMs: number
): Promise<{ ok: boolean; stdout: string; error?: string }> {
  return new Promise((resolve) => {
    let timedOut = false;
    
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // Ignore kill errors
      }
      resolve({
        ok: false,
        stdout: '',
        error: `timeout_after_${timeoutMs}ms`
      });
    }, timeoutMs);
    
    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-Command',
        script
      ],
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        
        if (timedOut) return;
        
        if (error) {
          resolve({
            ok: false,
            stdout: '',
            error: stderr || error.message
          });
        } else {
          resolve({
            ok: true,
            stdout: stdout.trim()
          });
        }
      }
    );
  });
}

/**
 * Verify element exists (used for postcondition checking)
 */
export async function verifyElementExists(
  processId: number,
  windowName: string | undefined,
  selector: UiAutomationSelector,
  timeoutMs = 5000
): Promise<boolean> {
  try {
    const probeResult = await probe(processId, timeoutMs, windowName);

    return probeResult.controls.some((c) =>
      (!selector.automationId || c.automationId === selector.automationId) &&
      (!selector.name || c.name === selector.name) &&
      (!selector.controlType || (c.controlType && c.controlType.includes(selector.controlType)))
    );
  } catch {
    return false;
  }
}

/**
 * Find element by fuzzy name match
 */
export async function findElementByFuzzyName(
  processId: number,
  windowName: string | undefined,
  nameQuery: string,
  minSimilarity = 0.7,
  timeoutMs = 5000
): Promise<{ found: boolean; control?: UiAutomationControl; similarity?: number }> {
  try {
    const probeResult = await probe(processId, timeoutMs, windowName);

    const candidates = probeResult.controls
      .map((c): UiAutomationCandidate => ({
        control: c,
        similarity: c.name ? calculateSimilarity(nameQuery, c.name) : 0
      }))
      .filter((x: UiAutomationCandidate) => x.similarity >= minSimilarity)
      .sort((a: UiAutomationCandidate, b: UiAutomationCandidate) => b.similarity - a.similarity);
    
    if (candidates.length > 0) {
      const best = candidates[0]!;
      return {
        found: true,
        control: best.control,
        similarity: best.similarity
      };
    }
    
    return { found: false };
    
  } catch {
    return { found: false };
  }
}

/**
 * Calculate string similarity (Levenshtein distance)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  
  // Levenshtein distance with proper initialization
  const matrix: number[][] = Array(s2.length + 1);
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = Array(s1.length + 1).fill(0);
    matrix[i]![0] = i;
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0]![j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }
  
  const distance = matrix[s2.length]![s1.length]!;
  const maxLength = Math.max(s1.length, s2.length);
  return 1.0 - distance / maxLength;
}
