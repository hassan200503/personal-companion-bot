$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$process = Start-Process notepad -PassThru
try {
  Start-Sleep -Milliseconds 1000
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $process.Id)
  $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  if (-not $window) {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($candidate in $windows) {
      if ($candidate.Current.Name -match 'Notepad') { $window = $candidate; break }
    }
  }
  if (-not $window) { throw 'notepad_window_not_found' }
  $children = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)
  $items = @()
  foreach ($child in $children) {
    $pattern = $null
    $hasInvoke = $child.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)
    $pattern = $null
    $hasValue = $child.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)
    $items += [pscustomobject]@{
      name = $child.Current.Name
      controlType = $child.Current.ControlType.ProgrammaticName
      automationId = $child.Current.AutomationId
      hasInvoke = $hasInvoke
      hasValue = $hasValue
    }
  }
  [pscustomobject]@{
    processId = $process.Id
    windowTitle = $window.Current.Name
    descendantCount = $children.Count
    controls = $items | Select-Object -First 30
  } | ConvertTo-Json -Depth 6 -Compress
}
finally {
  if (-not $process.HasExited) { [void]$process.CloseMainWindow(); $process.WaitForExit(2000) }
  if (-not $process.HasExited) { $process.Kill() }
}
