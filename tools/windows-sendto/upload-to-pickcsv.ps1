param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Files,
  [string]$BaseUrl,
  [string]$Token,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Read-SendToConfig {
  $configPath = Join-Path $env:APPDATA "PickCSV\sendto-config.json"
  if (-not (Test-Path -LiteralPath $configPath)) {
    return @{}
  }

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  return @{
    BaseUrl = $config.BaseUrl
    Token = $config.Token
    ClientId = $config.ClientId
    ConfigPath = $configPath
  }
}

function Join-ApiUrl {
  param([string]$Root)
  return ($Root.TrimEnd("/") + "/api/import/auto")
}

function Wait-BeforeClose {
  param([int]$Seconds = 10)

  Write-Host ""
  Write-Host "La finestra si chiudera automaticamente tra $Seconds secondi. Premi Invio per chiudere subito."

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true)
      if ($key.Key -eq [ConsoleKey]::Enter) {
        return
      }
    }
    Start-Sleep -Milliseconds 150
  }
}

function Show-WindowsNotification {
  param(
    [string]$Title,
    [string]$Message
  )

  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $notify = [System.Windows.Forms.NotifyIcon]::new()
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.BalloonTipTitle = $Title
    $notify.BalloonTipText = $Message
    $notify.Visible = $true
    $notify.ShowBalloonTip(6000)
    Start-Sleep -Milliseconds 700
    $notify.Dispose()
  } catch {
    $null = 0
  }
}

function Send-PickCsvFile {
  param(
    [string]$Path,
    [string]$ApiUrl,
    [string]$ApiToken,
    [string]$ClientId
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Host "[ERRORE] File non trovato: $Path" -ForegroundColor Red
    return $false
  }

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($extension -ne ".csv" -and $extension -ne ".xlsx") {
    Write-Host "[ERRORE] Formato non supportato: $Path" -ForegroundColor Red
    return $false
  }

  $client = [System.Net.Http.HttpClient]::new()
  $content = [System.Net.Http.MultipartFormDataContent]::new()
  $stream = $null
  $fileContent = $null

  try {
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $ApiToken)
    $client.DefaultRequestHeaders.Add("X-PickCSV-Computer-Name", $env:COMPUTERNAME)
    $client.DefaultRequestHeaders.Add("X-PickCSV-User-Name", $env:USERNAME)
    if ($ClientId) {
      $client.DefaultRequestHeaders.Add("X-PickCSV-Client-Id", $ClientId)
    }
    $stream = [System.IO.File]::OpenRead($Path)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
    $content.Add($fileContent, "file", [System.IO.Path]::GetFileName($Path))

    $response = $client.PostAsync($ApiUrl, $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
      $message = $body
      $contentType = ""
      if ($response.Content.Headers.ContentType) {
        $contentType = $response.Content.Headers.ContentType.MediaType
      }

      if ($response.StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
        $message = "Endpoint non trovato: $ApiUrl. Verifica che la web app online sia aggiornata con /api/import/auto oppure reinstalla il collegamento con -BaseUrl http://localhost:3000."
      } elseif ($contentType -like "text/html*" -or $body.TrimStart().StartsWith("<!DOCTYPE html")) {
        $message = "Il server ha risposto con una pagina HTML invece che JSON. Verifica URL, deploy e endpoint: $ApiUrl"
      } else {
        try {
          $json = $body | ConvertFrom-Json
          if ($json.error) {
            $message = $json.error
          }
        } catch {
          $message = $body
        }
      }
      Write-Host "[ERRORE] $([System.IO.Path]::GetFileName($Path)): $message" -ForegroundColor Red
      return $false
    }

    $result = $body | ConvertFrom-Json
    Write-Host "[OK] $($result.sourceFile)" -ForegroundColor Green
    Write-Host "     Batch creato: $($result.batchId)"
    Write-Host "     Ordini importati: $($result.summary.importedOrders)"
    Write-Host "     Righe totali: $($result.summary.totalRows)"
    Write-Host "     Righe scartate: $($result.summary.skippedRows)"
    Write-Host "     Duplicati: $($result.summary.duplicateRows)"
    Write-Host "     PC sorgente: $env:COMPUTERNAME\$env:USERNAME"
    return @{
      Success = $true
      OpenDashboard = [bool]$result.openDashboard
      SourceFile = $result.sourceFile
      ImportedOrders = $result.summary.importedOrders
      SkippedRows = $result.summary.skippedRows
      DuplicateRows = $result.summary.duplicateRows
    }
  } catch {
    Write-Host "[ERRORE] $([System.IO.Path]::GetFileName($Path)): $($_.Exception.Message)" -ForegroundColor Red
    return @{ Success = $false }
  } finally {
    if ($fileContent) { $fileContent.Dispose() }
    if ($stream) { $stream.Dispose() }
    $content.Dispose()
    $client.Dispose()
  }
}

$config = Read-SendToConfig
if (-not $BaseUrl) {
  $BaseUrl = $config.BaseUrl
}
if (-not $Token) {
  $Token = $config.Token
}
$clientId = $config.ClientId
if (-not $clientId) {
  $clientId = [guid]::NewGuid().ToString()
  if ($config.ConfigPath) {
    try {
      $persistedConfig = [ordered]@{
        BaseUrl = $BaseUrl
        Token = $Token
        ClientId = $clientId
      }
      $persistedConfig | ConvertTo-Json | Set-Content -LiteralPath $config.ConfigPath -Encoding UTF8
    } catch {
      $null = 0
    }
  }
}

if (-not $BaseUrl) {
  $BaseUrl = "https://pick.iosonofra.click"
}

if (-not $Token) {
  Write-Host "Token API mancante. Reinstalla il collegamento con install-sendto.ps1 -Token <token>." -ForegroundColor Red
  if (-not $NoPause) { Wait-BeforeClose }
  exit 1
}

if (-not $Files -or $Files.Count -eq 0) {
  Write-Host "Nessun file ricevuto. Usa tasto destro su un file .csv/.xlsx > Invia a > Carica su PickCSV." -ForegroundColor Yellow
  if (-not $NoPause) { Wait-BeforeClose }
  exit 1
}

$apiUrl = Join-ApiUrl -Root $BaseUrl
Write-Host "Upload verso $apiUrl"

$success = 0
$failed = 0
$openDashboard = $false
foreach ($file in $Files) {
  $uploadResult = Send-PickCsvFile -Path $file -ApiUrl $apiUrl -ApiToken $Token -ClientId $clientId
  if ($uploadResult.Success) {
    $success += 1
    if ($uploadResult.OpenDashboard) {
      $openDashboard = $true
    }
    Show-WindowsNotification -Title "PickCSV upload completato" -Message "$($uploadResult.SourceFile): $($uploadResult.ImportedOrders) ordini importati"
  } else {
    $failed += 1
    Show-WindowsNotification -Title "PickCSV upload non riuscito" -Message ([System.IO.Path]::GetFileName($file))
  }
}

Write-Host ""
Write-Host "Completato. Riusciti: $success | Falliti: $failed"

if ($openDashboard -and $success -gt 0) {
  Start-Process $BaseUrl
}

if (-not $NoPause) {
  Wait-BeforeClose
}

if ($failed -gt 0) {
  exit 1
}
