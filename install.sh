#!/bin/bash
# install.sh — Claude Extension Premiere Pro 2026 (macOS installer)
# -----------------------------------------------------------------
# Run from the repo root:
#     bash install.sh
# Idempotent — safe to re-run.
#
# Auto-installs missing dependencies via Homebrew + npm:
#   - Node.js LTS  (brew install node)
#   - Claude Code CLI  (npm i -g @anthropic-ai/claude-code)
#   - ffmpeg  (brew install ffmpeg) — required by Remotion

set -e

step() { printf "\033[36m==>\033[0m %s\n" "$1"; }
ok()   { printf "\033[32m OK\033[0m %s\n" "$1"; }
warn() { printf "\033[33m !!\033[0m %s\n" "$1"; }
fail() { printf "\033[31m XX\033[0m %s\n" "$1"; exit 1; }
info() { printf "    %s\n" "$1"; }

have() { command -v "$1" >/dev/null 2>&1; }

# ---------- 0. Sanity check ----------
if [ ! -f "extension/com.claudebridge.panel/index.html" ] || [ ! -f "bridge/bridge.js" ]; then
    fail "Run this from the repo root (where extension/ and bridge/ live)."
fi

# ---------- 1. Homebrew availability ----------
step "Checking Homebrew"
if have brew; then
    ok "brew present"
else
    warn "Homebrew not installed."
    info "Install at https://brew.sh — paste this into Terminal:"
    info '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    info "Continuing — will fall back to manual instructions for missing deps."
fi

# ---------- 2. Node.js ----------
step "Checking Node.js"
if have node; then
    ok "node $(node --version)"
else
    if have brew; then
        info "Installing Node.js LTS via Homebrew…"
        brew install node >/dev/null
        if have node; then ok "node $(node --version)"
        else fail "Node install ran but 'node' isn't on PATH. Open a new shell and re-run."
        fi
    else
        fail "Node.js not installed and Homebrew unavailable. Install from https://nodejs.org (LTS), open a new shell, and re-run."
    fi
fi

# ---------- 3. Claude Code CLI ----------
step "Checking Claude Code CLI"
if have claude; then
    ok "$(claude --version)"
else
    info "Installing Claude Code CLI via npm…"
    npm install -g "@anthropic-ai/claude-code" >/dev/null 2>&1 || true
    if have claude; then
        ok "$(claude --version)"
    else
        warn "Claude CLI install ran but 'claude' isn't on PATH yet."
        info "Open a NEW Terminal and run:  claude /login"
        info "Then re-run this installer."
    fi
fi

# ---------- 4. ffmpeg (Remotion needs it) ----------
step "Checking ffmpeg"
if have ffmpeg; then
    ok "ffmpeg present"
else
    if have brew; then
        info "Installing ffmpeg via Homebrew…"
        brew install ffmpeg >/dev/null
        if have ffmpeg; then ok "ffmpeg installed"
        else warn "ffmpeg install ran but not detected — open a new shell after this script."
        fi
    else
        warn "ffmpeg not installed. Remotion needs it for rendering."
        info "Install Homebrew (see step 1) then run:  brew install ffmpeg"
    fi
fi

# ---------- 5. Authentication check ----------
step "Checking Claude authentication"
authed=0
if have claude; then
    if claude /doctor 2>/dev/null | grep -Eqi 'logged in|authenticated|account:'; then authed=1; fi
fi
if [ $authed -eq 1 ]; then
    ok "Claude CLI is logged in"
else
    warn "Claude CLI may not be logged in yet."
    info "After this script finishes, run in a NEW Terminal:  claude /login"
fi

# ---------- 6. Enable unsigned CEP extensions ----------
step "Enabling PlayerDebugMode for CEP"
for v in 12 11 10 9 8; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 >/dev/null 2>&1 || true
done
ok "set on CSXS 8-12"

# ---------- 7. Copy panel ----------
step "Installing panel"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
PANEL_DST="$CEP_DIR/com.claudebridge.panel"
mkdir -p "$CEP_DIR"
rm -rf "$PANEL_DST"
cp -R "extension/com.claudebridge.panel" "$CEP_DIR/"
if [ ! -f "$PANEL_DST/index.html" ]; then
    fail "Panel copy failed — $PANEL_DST missing index.html"
fi
ok "$PANEL_DST"

# ---------- 8. Copy bridge ----------
step "Installing bridge"
BRIDGE_DIR="$HOME/PremiereClaude"
mkdir -p "$BRIDGE_DIR/output"
cp "bridge/bridge.js" "$BRIDGE_DIR/"
if [ ! -f "$BRIDGE_DIR/bridge.js" ]; then
    fail "Bridge copy failed — $BRIDGE_DIR/bridge.js missing"
fi
ok "$BRIDGE_DIR/bridge.js"

# ---------- 9. Desktop launcher ----------
step "Placing launcher on Desktop"
DESKTOP="$HOME/Desktop"
LAUNCHER="$DESKTOP/Claude Bridge.command"
cp "bridge/start.command" "$LAUNCHER"
chmod +x "$LAUNCHER"
ok "$LAUNCHER"

# ---------- 10. Premiere Pro detection ----------
step "Detecting Adobe Premiere Pro"
PP_FOUND=""
for path in "/Applications/Adobe Premiere Pro 2026" "/Applications/Adobe Premiere Pro 2025" "/Applications/Adobe Premiere Pro 2024"; do
    if [ -d "$path" ]; then PP_FOUND="$path"; break; fi
done
if [ -n "$PP_FOUND" ]; then ok "Found at $PP_FOUND"
else warn "Premiere Pro not detected — install it before using the panel."
fi

# ---------- 11. Done ----------
echo ""
printf "\033[32m----------------------------------------\033[0m\n"
printf "\033[32m Claude Extension Premiere Pro 2026 installed.\033[0m\n"
printf "\033[32m----------------------------------------\033[0m\n"
echo ""
echo " Next steps:"
echo "  1. If Claude isn't logged in yet, open a new Terminal and run:  claude /login"
echo "  2. Double-click \"Claude Bridge.command\" on your Desktop."
echo "  3. Open Premiere Pro -> Window -> Extensions -> Claude."
echo "  4. Status pill turns green; you're ready."
echo ""
echo " To stop the bridge: close its terminal window."
echo ""
