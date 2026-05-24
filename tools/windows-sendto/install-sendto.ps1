param(
  [string]$BaseUrl = "https://pick.iosonofra.click",
  [string]$Token,
  [string]$ShortcutName = "Carica su PickCSV"
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
  $Token = Read-Host "Inserisci AUTO_IMPORT_API_TOKEN"
}

if (-not $Token) {
  throw "Token API mancante."
}

$scriptPath = Join-Path $PSScriptRoot "upload-to-pickcsv.ps1"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "Script upload non trovato: $scriptPath"
}

$configDir = Join-Path $env:APPDATA "PickCSV"
$configPath = Join-Path $configDir "sendto-config.json"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$existingConfig = $null
if (Test-Path -LiteralPath $configPath) {
  try {
    $existingConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  } catch {
    $existingConfig = $null
  }
}
$clientId = $existingConfig.ClientId
if (-not $clientId) {
  $clientId = [guid]::NewGuid().ToString()
}

$config = [ordered]@{
  BaseUrl = $BaseUrl.TrimEnd("/")
  Token = $Token
  ClientId = $clientId
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

$sendToDir = [Environment]::GetFolderPath("SendTo")
$shortcutPath = Join-Path $sendToDir ($ShortcutName + ".lnk")

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Carica file CSV/XLSX su PickCSV"
$shortcut.Save()

Write-Host "Configurazione salvata in: $configPath" -ForegroundColor Green
Write-Host "Collegamento creato in: $shortcutPath" -ForegroundColor Green
Write-Host "Uso: tasto destro su .csv/.xlsx > Invia a > $ShortcutName"
