$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$roots = @(
  (Join-Path $repo 'companion\apps'),
  (Join-Path $repo 'companion\packages\core\src'),
  (Join-Path $repo 'docs'),
  (Join-Path $repo 'spikes')
)
$extensions = @('.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.ps1')
$patterns = @(
  'sk-[A-Za-z0-9]{20,}',
  'AIza[0-9A-Za-z_-]{20,}',
  'ghp_[A-Za-z0-9]{20,}',
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY-----'
)
$findings = @()
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  $files = Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object {
    $extensions -contains $_.Extension.ToLowerInvariant() -and $_.FullName -notmatch '\\(node_modules|dist|release)\\' -and $_.Name -ne 'secret-canary-scan.ps1'
  }
  foreach ($file in $files) {
    foreach ($pattern in $patterns) {
      $found = Select-String -LiteralPath $file.FullName -Pattern $pattern -AllMatches
      if ($found) { $findings += $found }
    }
  }
}
if ($findings.Count -gt 0) {
  $findings | Select-Object Path,LineNumber,Line | Format-Table -AutoSize
  throw "secret_canary_matches=$($findings.Count)"
}
[pscustomobject]@{ scannedRoots = $roots.Count; scannedExtensions = $extensions.Count; matches = $findings.Count } | ConvertTo-Json -Compress
