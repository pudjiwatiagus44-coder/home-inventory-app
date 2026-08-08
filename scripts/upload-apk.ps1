# Uploads the Android internal-test APK to the server and writes version.json.
# Run after every Android change so the invitation landing page always points to
# the latest APK. Uses scp/ssh with the server key (never commit the key).
#
# Usage:
#   .\scripts\upload-apk.ps1 [-SkipBuild]
param(
    [switch]$SkipBuild,
    [string]$ServerKey = "$env:USERPROFILE\Downloads\serverkey.pem",
    [string]$ServerUser = "root",
    [string]$ServerHost = "120.24.93.226",
    [string]$RemoteDir = "/opt/home-inventory-app/public/apk",
    [string]$BaseUrl = "https://homestorag.xyz",
    [string]$ApkOutput = "android\app\build\outputs\apk\debug\app-debug.apk"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $SkipBuild) {
    Push-Location "$repoRoot\android"
    try {
        & .\gradlew.bat :app:assembleDebug --no-daemon
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle assembleDebug failed"
        }
    }
    finally {
        Pop-Location
    }
}

$sourceApk = Join-Path $repoRoot $ApkOutput
if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "APK not found: $sourceApk"
}

if ($SkipBuild) {
    $apkTime = (Get-Item -LiteralPath $sourceApk).LastWriteTime
    $gradleTime = (Get-Item -LiteralPath (Join-Path $repoRoot "android\app\build.gradle.kts")).LastWriteTime
    if ($apkTime -lt $gradleTime) {
        throw "APK ($sourceApk) is older than build.gradle.kts; rebuild with assembleDebug or omit -SkipBuild"
    }
}

$buildFile = Get-Content -LiteralPath (Join-Path $repoRoot "android\app\build.gradle.kts") -Raw
$versionCode = [regex]::Match($buildFile, "versionCode\s*=\s*(\d+)").Groups[1].Value
$versionName = [regex]::Match($buildFile, 'versionName\s*=\s*"([^"]+)"').Groups[1].Value

$tempDir = Join-Path $env:TEMP "home-inventory-apk"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$latestApk = Join-Path $tempDir "home-inventory-internal-latest.apk"
Copy-Item -LiteralPath $sourceApk -Destination $latestApk -Force

$size = (Get-Item -LiteralPath $latestApk).Length
$versionJson = Join-Path $tempDir "version.json"
$versionObject = @{
    versionName = $versionName
    versionCode = [int]$versionCode
    url         = "$BaseUrl/apk/home-inventory-internal-latest.apk"
    size        = $size
    updatedAt   = (Get-Date).ToUniversalTime().ToString("o")
}
$json = $versionObject | ConvertTo-Json
# UTF-8 without BOM: PowerShell 5.1 Set-Content -Encoding UTF8 writes a BOM,
# which breaks JSON parsing (Gson on Android, Invoke-RestMethod).
[System.IO.File]::WriteAllText($versionJson, $json, [System.Text.UTF8Encoding]::new($false))

ssh -o BatchMode=yes -i $ServerKey "$ServerUser@$ServerHost" "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) {
    throw "ssh mkdir failed"
}
scp -o BatchMode=yes -i $ServerKey $latestApk "$ServerUser@$ServerHost`:$RemoteDir/"
if ($LASTEXITCODE -ne 0) {
    throw "scp apk failed"
}
scp -o BatchMode=yes -i $ServerKey $versionJson "$ServerUser@$ServerHost`:$RemoteDir/"
if ($LASTEXITCODE -ne 0) {
    throw "scp version.json failed"
}

Write-Host "Uploaded $BaseUrl/apk/home-inventory-internal-latest.apk (v$versionName, code $versionCode, $size bytes)"
