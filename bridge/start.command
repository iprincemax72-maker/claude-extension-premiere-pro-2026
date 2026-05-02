#!/bin/bash
# Claude Bridge launcher — double-click this from anywhere to start the bridge.
cd "$HOME/PremiereClaude" || { echo "ERROR: ~/PremiereClaude not found"; read; exit 1; }

# Pick the right node binary (Apple Silicon vs Intel brew, or PATH fallback)
NODE_BIN=""
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)"; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
done
if [ -z "$NODE_BIN" ]; then
    echo "ERROR: node not found. Install Node.js from https://nodejs.org"
    read; exit 1
fi

echo "──────────────────────────────────────────"
echo "  Claude Bridge"
echo "──────────────────────────────────────────"
echo "  Node:    $NODE_BIN"
echo "  Bridge:  $PWD/bridge.js"
echo "  Stop:    close this terminal window"
echo "──────────────────────────────────────────"
echo

# If port is already taken, surface that clearly instead of a cryptic crash.
if lsof -ti tcp:3737 >/dev/null 2>&1; then
    echo "Port 3737 is already in use — the bridge is probably already running."
    echo "If you want to restart it, close the existing one first or run:"
    echo "    lsof -ti tcp:3737 | xargs kill -9"
    echo
    read -p "Press Enter to close…"
    exit 0
fi

exec "$NODE_BIN" bridge.js
