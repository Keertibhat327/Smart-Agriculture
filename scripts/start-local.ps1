$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://127.0.0.1:5173/"

Set-Location $Root

Write-Host ""
Write-Host "Smart Agricultural Climate Risk Visualization" -ForegroundColor Green
Write-Host "Project folder: $Root"
Write-Host ""
Write-Host "Backend note: this version does not need a local Python backend." -ForegroundColor Yellow
Write-Host "It uses static files from public/data and public climate/soil APIs in the browser."
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed or not available in PATH." -ForegroundColor Red
  Write-Host "Install Node.js LTS from https://nodejs.org/ and run this file again."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm is not available in PATH." -ForegroundColor Red
  Write-Host "Install Node.js LTS from https://nodejs.org/ and run this file again."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies. This may take a minute..." -ForegroundColor Cyan
  npm install
}

$ExistingServer = $false
try {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
  if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
    $ExistingServer = $true
  }
} catch {
  $ExistingServer = $false
}

if (-not $ExistingServer) {
  Write-Host "Starting frontend server on $Url" -ForegroundColor Cyan
  $command = "Set-Location -LiteralPath '$Root'; npm run dev -- --host 127.0.0.1 --port 5173"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $command -WindowStyle Normal

  Write-Host "Waiting for the website to become ready..."
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
      $ready = $false
    }
  }

  if (-not $ready) {
    Write-Host "The server was started, but the readiness check timed out." -ForegroundColor Yellow
    Write-Host "Keep the server window open and visit $Url manually."
  }
} else {
  Write-Host "A local server is already running at $Url" -ForegroundColor Green
}

Write-Host "Opening website..." -ForegroundColor Green
Start-Process $Url
