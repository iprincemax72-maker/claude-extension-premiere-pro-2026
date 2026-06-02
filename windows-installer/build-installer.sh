#!/bin/bash
# Build ClaudeForPremiere-Setup.exe from the repo with NSIS (makensis).
# Usage:  bash windows-installer/build-installer.sh [version]
# Requires: makensis  (macOS: brew install makensis)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="${1:-1.0.1}"
BUILD="$HERE/build"

command -v makensis >/dev/null 2>&1 || { echo "makensis not found. Install: brew install makensis"; exit 1; }

rm -rf "$BUILD"; mkdir -p "$BUILD/payload/bridge" "$BUILD/payload/extension"

# Stage the Windows payload (flat tree: install.ps1 + extension\ + bridge\)
cp "$ROOT/install.ps1" "$ROOT/README.md" "$ROOT/LICENSE" "$BUILD/payload/"
cp "$ROOT/bridge/bridge.js" "$ROOT/bridge/start.bat" "$BUILD/payload/bridge/"
cp -R "$ROOT/bridge/remotion-template" "$BUILD/payload/bridge/"
cp -R "$ROOT/extension/com.claudebridge.panel" "$BUILD/payload/extension/"

# Scrub junk
find "$BUILD/payload" -name ".DS_Store" -delete
find "$BUILD/payload" -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# License + script for the build dir (NSIS resolves File/LICENSE relative to CWD)
cp "$ROOT/LICENSE" "$BUILD/LICENSE"
cp "$HERE/setup.nsi" "$BUILD/setup.nsi"

cd "$BUILD"
makensis -DVERSION="$VERSION" setup.nsi
echo ""
echo "Built: $BUILD/ClaudeForPremiere-Setup.exe"
ls -la "$BUILD/ClaudeForPremiere-Setup.exe"
