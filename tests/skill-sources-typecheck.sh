#!/bin/bash
# Strict TypeScript check on every Remotion skill v2 source + the
# cross-skill showreels. Catches prop-naming and other shape bugs
# that pass the render but fail strict types.
#
# Usage:
#   bash tests/skill-sources-typecheck.sh
#
# Exits non-zero if any file fails strict type-check.

set -e
cd "$(dirname "$0")/../../PremiereClaude/remotion-intro" || {
  echo "PremiereClaude/remotion-intro not found at expected relative path"
  exit 2
}

FILES=(
  src/skills-test/backgrounds.tsx
  src/skills-test/banners.tsx
  src/skills-test/callouts.tsx
  src/skills-test/charts.tsx
  src/skills-test/comparison.tsx
  src/skills-test/ctas.tsx
  src/skills-test/device-notifications.tsx
  src/skills-test/frames.tsx
  src/skills-test/hooks.tsx
  src/skills-test/lists.tsx
  src/skills-test/logos.tsx
  src/skills-test/lower-thirds.tsx
  src/skills-test/music-lyrics.tsx
  src/skills-test/quotes.tsx
  src/skills-test/reactions.tsx
  src/skills-test/social-ui.tsx
  src/skills-test/stats.tsx
  src/skills-test/stingers.tsx
  src/skills-test/tech.tsx
  src/skills-test/text-presets.tsx
  src/skills-test/trend-packs.tsx
  src/skills-test/word-effects.tsx
  src/skills-test/Showreel.tsx
  src/skills-test/ShowreelV.tsx
)

echo "Type-checking ${#FILES[@]} skill source files..."

npx tsc --noEmit \
  --jsx react-jsx \
  --strict \
  --esModuleInterop \
  --skipLibCheck \
  --moduleResolution bundler \
  --module esnext \
  --target es2020 \
  "${FILES[@]}"

echo "✓ All skill sources type-check clean"
