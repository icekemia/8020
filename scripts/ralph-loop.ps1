param([int]$MaxAttempts = 3)
$ErrorActionPreference = 'Stop'
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Write-Host "[ralph] attempt $attempt/$MaxAttempts"
  npm run complete:prototype
  if ($LASTEXITCODE -eq 0 -and (Test-Path 'output/prototype_validation.json')) {
    $result = Get-Content 'output/prototype_validation.json' -Raw | ConvertFrom-Json
    if ($result.status -eq 'PASS') { Write-Host '[ralph] validated PASS'; exit 0 }
  }
  Write-Host '[ralph] validation did not pass; stopping for a code-level repair.'
  exit 1
}
exit 1
