param(
  [int]$Port = 8420,
  [switch]$NoBrowser
)

# Kleiner lokaler Webserver fuer Kassensturz (nur localhost, keine Installation noetig)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app'))
# Gespeicherte Auszuege liegen ausserhalb von app/ und werden nur ueber /api/daten gelesen
$dataDir = Join-Path $PSScriptRoot 'daten'
$dataFile = Join-Path $dataDir 'kassensturz.json'
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Port $Port ist belegt. Starte mit anderem Port:  .\server.ps1 -Port 8421" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  Kassensturz laeuft auf $prefix" -ForegroundColor Green
Write-Host "  Fenster offen lassen. Beenden mit Strg+C."
Write-Host ""
if (-not $NoBrowser) { Start-Process $prefix }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.pdf'  = 'application/pdf'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
}

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(300)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path -eq '/') { $path = '/index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if ($path -eq '/api/daten') {
        # Gespeicherte Auszuege lesen (GET) oder schreiben (PUT)
        $res.ContentType = 'application/json; charset=utf-8'
        if ($ctx.Request.HttpMethod -eq 'PUT') {
          $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
          $body = $reader.ReadToEnd()
          $reader.Close()
          if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
          $tmp = "$dataFile.tmp"
          [IO.File]::WriteAllText($tmp, $body, (New-Object Text.UTF8Encoding($false)))
          if (Test-Path $dataFile) { Copy-Item $dataFile "$dataFile.bak" -Force }
          Move-Item $tmp $dataFile -Force
          $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
        } elseif (Test-Path $dataFile) {
          $bytes = [IO.File]::ReadAllBytes($dataFile)
        } else {
          $bytes = [Text.Encoding]::UTF8.GetBytes('{}')
        }
      } elseif (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Nicht gefunden')
        $res.ContentType = 'text/plain; charset=utf-8'
      } else {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $type = $mime[$ext]
        if (-not $type) { $type = 'application/octet-stream' }
        $res.ContentType = $type
      }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      Write-Host "Fehler: $_" -ForegroundColor Yellow
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
