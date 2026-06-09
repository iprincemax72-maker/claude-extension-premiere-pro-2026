# Remotion deep-research → Flimify upgrades (2026-06-10)

Six parallel research agents swept remotion.dev (docs, packages, CLI, templates,
changelog) and diffed findings against Flimify's pipeline baseline. Every claim
below was **verified against the installed packages** before being applied —
agent claims about `@remotion/effects`, `fitText`, `setHardwareAcceleration`,
and the transitions catalog were confirmed in `node_modules` type definitions,
and two smoke renders proved the upgrade compiles all 278 existing comps.

## What was applied

| Change | Where | Why |
|---|---|---|
| Upgrade remotion 4.0.465 → **4.0.474** | live project + `bridge/remotion-template/package.json` | effects on shapes, easing arrays, CSS-transform interpolate, posterize |
| Install **15 creative packages** (transitions, shapes, paths, noise, motion-blur, layout-utils, animation-utils, gif, lottie, captions, animated-emoji, light-leaks, fonts, sfx, effects) | both | the generator could only hand-roll what these provide battle-tested |
| `ensureRemotionPackages()` | bridge launch | existing installs self-heal missing toolkit packages, pinned to project's remotion version |
| **REMOTION TOOLKIT** prompt section | SYSTEM_PROMPT | teaches Claude the package catalog + v4 API rules a stale-knowledge model gets wrong |
| `--hardware-acceleration=if-possible` | render command in prompt, captions args, `remotion.config.ts` | VideoToolbox encode on Macs (H.264/H.265/ProRes, v4.0.228+); silent fallback on Windows |
| `Config.setConcurrency(min(8, cores-1))` | both config files | Remotion's default is conservative |
| fitText mandate | prompt | kills the text-overflow class of bugs at the source |
| `loadFont({weights, subsets})` guidance | prompt | smoke render showed 25+ font network requests per family |

## Key verified facts (for future reference)

- **`@remotion/effects` (v4.0.465+)**: canvas effect fns — blur, brightness,
  contrast, chromaticAberration, barrelDistortion, colorKey, duotone, dotGrid,
  rings, zigzag, halftone, scanlines… applied via `effects` prop on `<Img>`,
  `<CanvasImage>`, `<Gif>`, shapes. ESM-only package. https://www.remotion.dev/docs/effects
- **Transitions catalog is bigger than docs imply**: subpath exports include
  fade, slide, wipe, flip, clock-wipe, iris, cube, none + GL set: cross-zoom,
  crosswarp, dissolve, dreamy-zoom, film-burn, linear-blur, ripple, swap,
  zoom-blur, zoom-in-out, book-flip. https://www.remotion.dev/docs/transitions
- **`@remotion/layout-utils`**: `fitText`, `fitTextOnNLines`, `measureText`,
  `fillTextBox`. https://www.remotion.dev/docs/layout-utils
- **`@remotion/sfx`**: URL constants on the remotion.media CDN (whoosh, whip,
  ding, vine-boom, anime-wow…), normalized −3dB. https://www.remotion.dev/docs/sfx
- **Hardware acceleration**: macOS-only VideoToolbox; `if-possible` is safe
  cross-platform; **incompatible with `--crf`** (use `--video-bitrate` if you
  ever need quality control with hw accel). https://www.remotion.dev/docs/hardware-acceleration
- **Deprecations**: `startFrom`/`endAt` → `trimBefore`/`trimAfter` (frames);
  media-parser/webcodecs being phased toward Mediabunny; `@remotion/media` is
  experimental — keep using `<OffthreadVideo>` for server renders.
- **Alpha recipe** (unchanged, confirmed): `--codec=prores --prores-profile=4444
  --pixel-format=yuva444p10le --image-format=png`, only 4444/4444-xq carry alpha.
- `<Sequence premountFor={N}>` (v4.0.140+) pre-mounts heavy children — the
  official fix for first-frame jank.
- `spring()` has no built-in presets; recipes: snappy = `{damping: 200}`,
  bouncy = `{damping: 10}`; `measureSpring({fps, config})` for true settle time.

## Smoke-test evidence

- 30-frame H.264 render of an existing comp after upgrade: **passed** (bundles
  all 278 comps → whole-project compile proof).
- Same render via new config (concurrency + hw accel): 18.0s → 8.5s wall.

## Not adopted (deliberately)

- `@remotion/media`, media-parser, webcodecs — experimental/deprecated.
- Lambda/CloudRun/player/timeline — server/app infra, irrelevant to local renders.
- `usePixelDensity`/`CanvasImage` taught via skill rules rather than prompt
  (niche; prompt space is budgeted).
- Tailwind packages — generator writes inline styles; adding a CSS pipeline
  would slow bundling for no quality gain.
