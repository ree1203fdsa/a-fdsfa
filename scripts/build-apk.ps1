# Builds the Android app (apk\ColorWars.apk).
# Gradle refuses non-ASCII project paths, so the project is mapped to a temporary drive letter for the build.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$drive = 'X:'
Set-Location $root
npx cap sync android
subst $drive $root
try {
  $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  Push-Location "$drive\android"
  .\gradlew.bat assembleDebug --no-daemon -q
  Pop-Location
  New-Item -ItemType Directory -Force (Join-Path $root 'apk') | Out-Null
  Copy-Item "$drive\android\app\build\outputs\apk\debug\app-debug.apk" (Join-Path $root 'apk\ColorWars.apk') -Force
  Write-Host 'apk\ColorWars.apk ready'
} finally {
  subst $drive /D
}
