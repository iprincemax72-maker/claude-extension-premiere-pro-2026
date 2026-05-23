#!/bin/bash
# Install (or uninstall) the Claude Bridge LaunchAgent so the bridge runs
# automatically at every login — no need to keep a terminal open, no need
# to spawn from the panel.
#
# Usage:
#   bash bridge/install-launchagent.sh           # install + start now
#   bash bridge/install-launchagent.sh --uninstall  # stop + remove

set -e

PLIST_DEST="$HOME/Library/LaunchAgents/com.claudebridge.plist"
LABEL="com.claudebridge"

uninstall() {
    echo "Stopping com.claudebridge LaunchAgent..."
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
        launchctl bootout "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || \
        launchctl unload -w "$PLIST_DEST" 2>/dev/null || true
    fi
    rm -f "$PLIST_DEST"
    # Free the port if a stray process is still bound
    lsof -ti tcp:3737 2>/dev/null | xargs kill 2>/dev/null || true
    echo "Done. Bridge will no longer auto-start at login."
    echo "(You can still launch it manually: node ~/PremiereClaude/bridge.js)"
    exit 0
}

if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ]; then
    uninstall
fi

# Find node — prefer absolute paths that survive launchd's minimal PATH
NODE_BIN=""
for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.local/bin/node"; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
done
if [ -z "$NODE_BIN" ]; then
    echo "ERROR: node not found at /usr/local/bin/node, /opt/homebrew/bin/node, or ~/.local/bin/node"
    echo "Install Node first (brew install node, or https://nodejs.org)"
    exit 1
fi

# Ensure bridge.js is in place — installer should have done this, but
# this script may be run standalone, so check.
BRIDGE_JS="$HOME/PremiereClaude/bridge.js"
if [ ! -f "$BRIDGE_JS" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    REPO_BRIDGE="$SCRIPT_DIR/bridge.js"
    if [ -f "$REPO_BRIDGE" ]; then
        mkdir -p "$HOME/PremiereClaude/output"
        cp "$REPO_BRIDGE" "$BRIDGE_JS"
        echo "Copied bridge.js → $BRIDGE_JS"
    else
        echo "ERROR: $BRIDGE_JS doesn't exist and I can't find a copy at $REPO_BRIDGE"
        echo "Re-run the main installer (bash install.sh) first."
        exit 1
    fi
fi

# Generate the plist from template — substitute home + node binary
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/com.claudebridge.plist.template"
if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: plist template missing at $TEMPLATE"
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$NODE_BIN|g" "$TEMPLATE" > "$PLIST_DEST"
echo "Wrote $PLIST_DEST"

# Unload any existing instance before loading (in case this is a re-install)
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || true
fi

# Free port 3737 if a manually-launched bridge is bound to it — otherwise
# the new launchctl-managed bridge will fail to listen and respawn-loop.
lsof -ti tcp:3737 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Load + start
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || \
launchctl load -w "$PLIST_DEST"
sleep 2

# Verify
if curl -s -m 3 http://127.0.0.1:3737/ping | grep -q '"ok":true'; then
    echo "OK — bridge is live and will auto-start on login from now on."
    echo "Log:  $HOME/PremiereClaude/bridge.log"
    echo "Stop: bash $(basename "$0") --uninstall"
else
    echo "Bridge didn't respond on /ping. Check log: $HOME/PremiereClaude/bridge.log"
    exit 1
fi
