# install.ps1 — Claude Extension Premiere Pro 2026 (Windows installer)
# ---------------------------------------------------------------------
# Run from the repo root:
#     powershell -ExecutionPolicy Bypass -File install.ps1
# Idempotent — safe to re-run.
#
# This installer auto-installs missing dependencies via winget + npm:
#   - Node.js LTS  (OpenJS.NodeJS.LTS)
#   - Claude Code CLI  (npm i -g @anthropic-ai/claude-code)
#   - ffmpeg  (Gyan.FFmpeg) — required by Remotion for video encoding

$ErrorActionPreference = 'Stop'

function Step($msg)  { Write-Host "==>"  -ForegroundColor Cyan -NoNewline; Write-Host " $msg" }
function Ok($msg)    { Write-Host " OK"   -ForegroundColor Green -NoNewline; Write-Host " $msg" }
function Warn($msg)  { Write-Host " !!"   -ForegroundColor Yellow -NoNewline; Write-Host " $msg" }
function Fail($msg)  { Write-Host " XX"   -ForegroundColor Red -NoNewline; Write-Host " $msg"; exit 1 }
function Info($msg)  { Write-Host "    $msg" -ForegroundColor Gray }

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# Refresh PATH inside this session so a freshly-installed exe is callable
function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') +
                ';' +
                [System.Environment]::GetEnvironmentVariable('Path','User')
}

# ---------- 0. Sanity check: are we in the repo root? ----------
if (-not (Test-Path "extension\com.claudebridge.panel\index.html") -or -not (Test-Path "bridge\bridge.js")) {
    Fail "Run this from the repo root (where extension\ and bridge\ live)."
}

# ---------- 1. winget availability ----------
Step "Checking winget (App Installer)"
if (Test-Cmd 'winget') {
    Ok "winget present"
} else {
    Warn "winget not found. Install 'App Installer' from the Microsoft Store, then re-run."
    Info "https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1"
    Info "Continuing — will fall back to manual instructions for missing deps."
}

# ---------- 2. Node.js ----------
Step "Checking Node.js"
if (Test-Cmd 'node') {
    Ok "node $((& node --version))"
} else {
    if (Test-Cmd 'winget') {
        Info "Installing Node.js LTS via winget…"
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent | Out-Null
        Refresh-Path
        if (Test-Cmd 'node') {
            Ok "node $((& node --version))"
        } else {
            Fail "Node install completed but 'node' still not on PATH. Open a new PowerShell window and re-run this script."
        }
    } else {
        Fail "Node.js not installed and winget unavailable. Install from https://nodejs.org (LTS), open a new shell, and re-run."
    }
}

# ---------- 3. Claude Code CLI ----------
Step "Checking Claude Code CLI"
if (Test-Cmd 'claude') {
    Ok "$((& claude --version))"
} else {
    Info "Installing Claude Code CLI via npm…"
    & npm install -g "@anthropic-ai/claude-code" 2>&1 | Out-Null
    Refresh-Path
    if (Test-Cmd 'claude') {
        Ok "$((& claude --version))"
    } else {
        Warn "Claude CLI install ran but 'claude' isn't on PATH yet."
        Info "Open a NEW PowerShell window and run:  claude /login"
        Info "Then re-run this installer."
    }
}

# ---------- 4. ffmpeg (Remotion needs it) ----------
Step "Checking ffmpeg"
if (Test-Cmd 'ffmpeg') {
    Ok "ffmpeg present"
} else {
    if (Test-Cmd 'winget') {
        Info "Installing ffmpeg via winget…"
        winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent | Out-Null
        Refresh-Path
        if (Test-Cmd 'ffmpeg') { Ok "ffmpeg installed" }
        else { Warn "ffmpeg install completed but not on PATH yet — open a new shell after this script." }
    } else {
        Warn "ffmpeg not installed. Remotion needs it for rendering."
        Info "Install via Chocolatey:  choco install ffmpeg"
        Info "Or download from https://www.gyan.dev/ffmpeg/builds/ and add to PATH."
    }
}

# ---------- 5. Authentication check (claude login) ----------
Step "Checking Claude authentication"
$authedOK = $false
try {
    # `claude /doctor` prints account state; grep for an OK line
    $doctor = (& claude /doctor 2>&1) -join "`n"
    if ($doctor -match 'logged in|authenticated|account:') { $authedOK = $true }
} catch { }
if ($authedOK) {
    Ok "Claude CLI is logged in"
} else {
    Warn "Claude CLI may not be logged in yet."
    Info "After this script finishes, run in a NEW PowerShell window:  claude /login"
}

# ---------- 6. Enable unsigned CEP extensions (HKCU, no admin) ----------
Step "Enabling PlayerDebugMode for CEP"
$cepVersions = @('12','11','10','9','8')
foreach ($v in $cepVersions) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -PropertyType String -Force | Out-Null
}
Ok "set on CSXS 8-12"

# ---------- 7. Copy panel into Adobe's CEP extensions folder ----------
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

# ---------- 8. Copy bridge to %USERPROFILE%\PremiereClaude ----------
Step "Installing bridge"
$bridgeDir = Join-Path $env:USERPROFILE 'PremiereClaude'
New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bridgeDir 'output') | Out-Null
Copy-Item -Force "bridge\bridge.js" $bridgeDir
if (-not (Test-Path (Join-Path $bridgeDir 'bridge.js'))) {
    Fail "Bridge copy failed — $bridgeDir\bridge.js missing"
}
Ok "$bridgeDir\bridge.js"

# ---------- 8b. Pre-scaffold Remotion project ----------
Step "Setting up Remotion project (first install: 2-4 min for npm install)"
$remotionDir = Join-Path $bridgeDir 'remotion-intro'
if (Test-Path (Join-Path $remotionDir 'node_modules')) {
    Ok "Remotion already installed at $remotionDir — skipping npm install"
} else {
    New-Item -ItemType Directory -Force -Path $remotionDir | Out-Null
    if (-not (Test-Path (Join-Path $remotionDir 'package.json'))) {
        Copy-Item -Recurse -Force "bridge\remotion-template\*" $remotionDir
        # PowerShell's wildcard skips dotfiles — copy .gitignore explicitly
        if (Test-Path "bridge\remotion-template\.gitignore") {
            Copy-Item -Force "bridge\remotion-template\.gitignore" $remotionDir
        }
    }
    if (Test-Cmd 'npm') {
        Info "Running npm install in $remotionDir (this is the slow part — be patient)…"
        Push-Location $remotionDir
        try {
            & npm install --silent --no-audit --no-fund 2>&1 | Out-Null
        } catch {
            Warn "npm install hit issues — first render may need to retry"
        }
        Pop-Location
        if (Test-Path (Join-Path $remotionDir 'node_modules\remotion')) {
            Ok "Remotion installed"
        } else {
            Warn "Remotion node_modules missing — first render will install it"
        }
    } else {
        Warn "npm not on PATH — Remotion will install itself on the first render (slower)"
    }
}

# ---------- 9. Place launcher on Desktop (fallback — the panel auto-starts
#               the bridge on its own; this is only for manual restarts) ----------
Step "Placing launcher on Desktop (fallback)"
$desktop = [Environment]::GetFolderPath('Desktop')
$launcherSrc = "bridge\start.bat"
$launcherDst = Join-Path $desktop 'Claude Bridge.bat'
Copy-Item -Force $launcherSrc $launcherDst
Ok "$launcherDst"

# ---------- 9b. Make sure the npm global bin is on the user PATH ----------
# claude.cmd lives in %APPDATA%\npm. npm usually adds it, but if a shell was
# already open before Node was installed it can be missing — ensure it so the
# bridge (and `claude /login`) can always find the CLI.
Step "Ensuring npm global bin is on PATH"
$npmBin = Join-Path $env:APPDATA 'npm'
if (Test-Path $npmBin) {
    $userPath = [Environment]::GetEnvironmentVariable('Path','User')
    if (($userPath -split ';') -notcontains $npmBin) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $npmBin), 'User')
        Ok "added $npmBin to your PATH (restart shells to pick it up)"
    } else {
        Ok "$npmBin already on PATH"
    }
} else {
    Warn "npm global bin ($npmBin) not found yet — it appears after the Claude CLI installs"
}

# ---------- 10. Premiere Pro detection (informational) ----------
Step "Detecting Adobe Premiere Pro"
$ppPaths = @(
    "$env:ProgramFiles\Adobe\Adobe Premiere Pro 2026",
    "$env:ProgramFiles\Adobe\Adobe Premiere Pro 2025",
    "$env:ProgramFiles\Adobe\Adobe Premiere Pro 2024"
)
$ppFound = $ppPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($ppFound) { Ok "Found at $ppFound" }
else { Warn "Premiere Pro not detected in default locations — install it before using the panel." }

# ---------- 11. Done ----------
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host " Claude Extension Premiere Pro 2026 installed."  -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host " Next steps:"
Write-Host "  1. If Claude isn't logged in yet, open a NEW PowerShell window and run:" -NoNewline
Write-Host "  claude /login" -ForegroundColor Cyan
Write-Host "  2. Open Premiere Pro -> Window -> Extensions -> Claude."
Write-Host "     The panel starts the bridge for you automatically (no terminal needed)."
Write-Host "  3. Status pill turns green; type a prompt and hit Enter. You're ready."
Write-Host ""
Write-Host " If the pill ever stays red, double-click " -NoNewline
Write-Host "Claude Bridge.bat" -ForegroundColor Cyan -NoNewline
Write-Host " on your Desktop to start it manually."
Write-Host " To stop a manually-started bridge: close its terminal window."
Write-Host ""
