#!/bin/bash
# install.sh — Claude Bridge for Premiere Pro (macOS installer)
# -------------------------------------------------------------
# Run from the repo root:
#     bash install.sh
# Idempotent — safe to re-run.

set -e

step() { printf "\033[36m==>\033[0m %s\n" "$1"; }
ok()   { printf "\033[32m OK\033[0m %s\n" "$1"; }
warn() { printf "\033[33m !!\033[0m %s\n" "$1"; }
fail() { printf "\033[31m XX\033[0m %s\n" "$1"; exit 1; }

# ---------- 0. Sanity check ----------
if [ ! -f "extension/com.claudebridge.panel/index.html" ] || [ ! -f "bridge/bridge.js" ]; then
    fail "Run this from the repo root (where extension/ and bridge/ live)."
fi

# ---------- 1. Node check ----------
step "Checking Node.js"
if command -v node >/dev/null 2>&1; then
    ok "node $(node --version)"
else
    fail "Node.js not found. Install from https://nodejs.org (LTS), then re-run."
fi

# ---------- 2. claude CLI check ----------
step "Checking claude CLI"
if command -v claude >/dev/null 2>&1; then
    ok "$(claude --version)"
else
    warn "claude CLI not found in PATH."
    echo "    Install: https://docs.claude.com/en/docs/claude-code"
    echo "    Continuing — the extension will install but won't work until claude is set up."
fi

# ---------- 3. Enable unsigned CEP extensions ----------
step "Enabling PlayerDebugMode for CEP"
for v in 12 11 10 9 8; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 >/dev/null 2>&1 || true
done
ok "set on CSXS 8-12"

# ---------- 4. Copy panel ----------
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

# ---------- 5. Copy bridge ----------
step "Installing bridge"
BRIDGE_DIR="$HOME/PremiereClaude"
mkdir -p "$BRIDGE_DIR/output"
cp "bridge/bridge.js" "$BRIDGE_DIR/"
if [ ! -f "$BRIDGE_DIR/bridge.js" ]; then
    fail "Bridge copy failed — $BRIDGE_DIR/bridge.js missing"
fi
ok "$BRIDGE_DIR/bridge.js"

# ---------- 6. Desktop launcher ----------
step "Placing launcher on Desktop"
DESKTOP="$HOME/Desktop"
LAUNCHER="$DESKTOP/Claude Bridge.command"
cp "bridge/start.command" "$LAUNCHER"
chmod +x "$LAUNCHER"
ok "$LAUNCHER"

# ---------- 7. Done ----------
echo ""
printf "\033[32m----------------------------------------\033[0m\n"
printf "\033[32m Claude Bridge installed.\033[0m\n"
printf "\033[32m----------------------------------------\033[0m\n"
echo ""
echo " Next steps:"
echo "  1. Double-click \"Claude Bridge.command\" on your Desktop."
echo "  2. Open Premiere Pro -> Window -> Extensions -> Claude."
echo "  3. Status pill turns green; you're ready."
echo ""
echo " To stop the bridge: close its terminal window."
echo ""
