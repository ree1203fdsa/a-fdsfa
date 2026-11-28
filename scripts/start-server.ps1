# Starts the ColorWars game server in the background at Windows logon.
# Registered under HKCU\Software\Microsoft\Windows\CurrentVersion\Run as "ColorWarsServer".
# Tailscale Funnel (port 8443 -> 127.0.0.1:3001) is already persistent in Tailscale itself.

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root 'server'
$logDir = Join-Path $server 'data\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

# Skip if something is already listening on 3001 (e.g. the dev server from the Claude app).
$busy = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($busy) { exit 0 }

# Give the network and Tailscale a moment after logon.
Start-Sleep -Seconds 15

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Process -WindowStyle Hidden -WorkingDirectory $server -FilePath 'npm.cmd' -ArgumentList 'run', 'start' `
  -RedirectStandardOutput (Join-Path $logDir "server-$stamp.log") `
  -RedirectStandardError (Join-Path $logDir "server-$stamp.err.log")
