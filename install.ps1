# install.ps1 — Claude Bridge for Premiere Pro (Windows installer)
# ----------------------------------------------------------------
# Run from the repo root:
#     powershell -ExecutionPolicy Bypass -File install.ps1
# Idempotent — safe to re-run.

$ErrorActionPreference = 'Stop'

function Step($msg)  { Write-Host "==>"  -ForegroundColor Cyan -NoNewline; Write-Host " $msg" }
function Ok($msg)    { Write-Host " OK"   -ForegroundColor Green -NoNewline; Write-Host " $msg" }
function Warn($msg)  { Write-Host " !!"   -ForegroundColor Yellow -NoNewline; Write-Host " $msg" }
function Fail($msg)  { Write-Host " XX"   -ForegroundColor Red -NoNewline; Write-Host " $msg"; exit 1 }

# ---------- 0. Sanity check: are we in the repo root? ----------
if (-not (Test-Path "extension\com.claudebridge.panel\index.html") -or -not (Test-Path "bridge\bridge.js")) {
    Fail "Run this from the repo root (where extension\ and bridge\ live)."
}

# ---------- 1. Node check ----------
Step "Checking Node.js"
try {
    $nodeVer = (& node --version) 2>$null
    if (-not $nodeVer) { throw }
    Ok "node $nodeVer"
} catch {
    Fail "Node.js not found. Install from https://nodejs.org (LTS), then re-run this script."
}

# ---------- 2. claude CLI check ----------
Step "Checking claude CLI"
try {
    $claudeVer = (& claude --version) 2>$null
    if (-not $claudeVer) { throw }
    Ok "$claudeVer"
} catch {
    Warn "claude CLI not found in PATH."
    Write-Host "    Install: https://docs.claude.com/en/docs/claude-code"
    Write-Host "    Continuing — the extension will install but won't work until claude is set up."
}

# ---------- 3. Enable unsigned CEP extensions (HKCU, no admin needed) ----------
Step "Enabling PlayerDebugMode for CEP"
$cepVersions = @('12','11','10','9','8')
foreach ($v in $cepVersions) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -PropertyType String -Force | Out-Null
}
Ok "set on CSXS 8-12"

# ---------- 4. Copy panel into Adobe's CEP extensions folder ----------
Step "Installing panel"
$cepDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
New-Item -ItemType Directory -Force -Path $cepDir | Out-Null
$panelDest = Join-Path $cepDir 'com.claudebridge.panel'
if (Test-Path $panelDest) { Remove-Item -Recurse -Force $panelDest }
Copy-Item -Recurse -Force "extension\com.claudebridge.panel" $cepDir
if (-not (Test-Path (Join-Path $panelDest 'index.html'))) {
    Fail "Panel copy failed — $panelDest missing index.html"
}
Ok "$panelDest"

# ---------- 5. Copy bridge to %USERPROFILE%\PremiereClaude ----------
Step "Installing bridge"
$bridgeDir = Join-Path $env:USERPROFILE 'PremiereClaude'
New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bridgeDir 'output') | Out-Null
Copy-Item -Force "bridge\bridge.js" $bridgeDir
if (-not (Test-Path (Join-Path $bridgeDir 'bridge.js'))) {
    Fail "Bridge copy failed — $bridgeDir\bridge.js missing"
}
Ok "$bridgeDir\bridge.js"

# ---------- 6. Place launcher on Desktop ----------
Step "Placing launcher on Desktop"
$desktop = [Environment]::GetFolderPath('Desktop')
$launcherSrc = "bridge\start.bat"
$launcherDst = Join-Path $desktop 'Claude Bridge.bat'
Copy-Item -Force $launcherSrc $launcherDst
Ok "$launcherDst"

# ---------- 7. Done ----------
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host " Claude Bridge installed."                 -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host " Next steps:"
Write-Host "  1. Double-click " -NoNewline; Write-Host "Claude Bridge.bat" -ForegroundColor Cyan -NoNewline; Write-Host " on your Desktop."
Write-Host "  2. Open Premiere Pro -> Window -> Extensions -> Claude."
Write-Host "  3. Status pill turns green; you're ready."
Write-Host ""
Write-Host " To stop the bridge: close its terminal window."
Write-Host ""
