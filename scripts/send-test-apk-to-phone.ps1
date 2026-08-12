param(
    [string]$ApkPath,
    [string]$Url = "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
    [string]$OutputDir,
    [switch]$NoOpen,
    [switch]$SkipClipboard
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $ApkPath) {
    $ApkPath = Join-Path $repoRoot "android-test-build\home-inventory-internal-0.5.32-test.apk"
} elseif (-not [System.IO.Path]::IsPathRooted($ApkPath)) {
    $ApkPath = Join-Path $repoRoot $ApkPath
}

if (-not (Test-Path -LiteralPath $ApkPath)) {
    throw "APK not found: $ApkPath"
}

if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot "_tmp\qq-transfer"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not $SkipClipboard) {
    Set-Clipboard -Value $Url
}

$qrPng = Join-Path $OutputDir "home-inventory-latest-qr.png"
$qrGenerated = $false
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $env:HI_QR_URL = $Url
    try {
        & $python.Source -c "import os, qrcode; qrcode.make(os.environ['HI_QR_URL']).save(r'$qrPng')"
        if (Test-Path -LiteralPath $qrPng) {
            $qrGenerated = $true
        }
    } catch {
        $qrGenerated = $false
    }
}

if (-not $qrGenerated) {
    $encoded = [Uri]::EscapeDataString($Url)
    Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=$encoded" -OutFile $qrPng
}

Write-Host "APK: $ApkPath"
Write-Host "Link ready: $Url"
Write-Host "QR code: $qrPng"
Write-Host "Scan with your phone to install, or share the link via QQ/WeChat."

if (-not $NoOpen) {
    Invoke-Item $qrPng
}
