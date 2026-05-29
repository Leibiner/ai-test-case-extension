$ErrorActionPreference = "Stop"

$extensionPath = $PSScriptRoot
$profile = Join-Path $env:TEMP "ai-test-case-extension-dev-profile"

Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$debugPort = $listener.LocalEndpoint.Port
$listener.Stop()

$chromeForTestingRoot = Join-Path $env:LocalAppData "Codex\ChromeForTesting\chrome"
$chromeForTesting = @()
if (Test-Path -LiteralPath $chromeForTestingRoot) {
  $chromeForTesting = Get-ChildItem -LiteralPath $chromeForTestingRoot -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*chrome-win64*" } |
    Sort-Object FullName -Descending |
    Select-Object -ExpandProperty FullName
}

$chromeCandidates = @(
  $chromeForTesting,
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ }

$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Chrome executable not found."
}

New-Item -ItemType Directory -Force -Path $profile | Out-Null

$args = @(
  "--user-data-dir=$profile",
  "--remote-debugging-port=$debugPort",
  "--load-extension=$extensionPath",
  "--disable-extensions-except=$extensionPath",
  "--no-first-run",
  "--start-maximized",
  "--new-window",
  "about:blank"
)

Start-Process -FilePath $chrome -ArgumentList $args -WindowStyle Normal

$targetsUrl = "http://127.0.0.1:$debugPort/json/list"
$extensionId = $null

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $targets = Invoke-RestMethod -Uri $targetsUrl
    $worker = $targets | Where-Object { $_.url -match '^chrome-extension://([^/]+)/background\.js$' } | Select-Object -First 1
    if ($worker -and $worker.url -match '^chrome-extension://([^/]+)/background\.js$') {
      $extensionId = $Matches[1]
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if ($extensionId) {
  $sidePanelUrl = "chrome-extension://$extensionId/sidepanel.html"
  $encodedSidePanelUrl = [System.Uri]::EscapeDataString($sidePanelUrl)
  Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$debugPort/json/new?$encodedSidePanelUrl" | Out-Null
  Write-Host "已启动 AI 测试用例设计助手："
  Write-Host $sidePanelUrl
} else {
  $extensionsUrl = [System.Uri]::EscapeDataString("chrome://extensions/")
  Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$debugPort/json/new?$extensionsUrl" | Out-Null
  Write-Host "Chrome 已启动，但未自动识别插件 ID。"
  Write-Host "请打开 chrome://extensions，点击「加载已解压的扩展程序」，然后选择："
  Write-Host $extensionPath
}
