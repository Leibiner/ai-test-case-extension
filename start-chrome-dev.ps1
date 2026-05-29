$ErrorActionPreference = "Stop"

$extensionPath = $PSScriptRoot
$chromeCandidates = @(
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Chrome executable not found."
}

$profile = Join-Path $env:TEMP "ai-test-case-extension-dev-profile"
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$args = @(
  "--user-data-dir=$profile",
  "--load-extension=$extensionPath",
  "--disable-extensions-except=$extensionPath",
  "--no-first-run",
  "--start-maximized",
  "--new-window",
  "chrome://extensions/"
)

Start-Process -FilePath $chrome -ArgumentList $args -WindowStyle Normal

Write-Host "Chrome started with extension:"
Write-Host $extensionPath
Write-Host ""
Write-Host "If the extension card is visible, click the toolbar extension icon and select AI Test Case Designer."
