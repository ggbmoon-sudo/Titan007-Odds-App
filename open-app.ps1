$ErrorActionPreference = "SilentlyContinue"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$serverScript = Join-Path $appRoot "server.js"
$appUrl = "http://127.0.0.1:3000/"

function Test-AppServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 2
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-AppServer)) {
  if (Test-Path $nodePath) {
    Start-Process -FilePath $nodePath -ArgumentList "server.js" -WorkingDirectory $appRoot -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
}

Start-Process $appUrl
