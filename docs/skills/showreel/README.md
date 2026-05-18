# Showreel templates — copy-paste cross-skill compositions

Six render-verified compositions that mix multiple v2 skills in one timeline. Use these as starting points for new productions, or as anti-pattern reference (e.g. how to layer a background under a foreground without them fighting).

All six type-check clean under `tests/skill-sources-typecheck.sh` and render to mp4 with `--mute --codec h264`.

## What's here

| File | Aspect | Duration | Skills used | Use for |
|------|--------|----------|-------------|---------|
| **Showreel.tsx** | 1920×1080 | 13.7s | BrandReveal, WaitZoomHook + ParticleField, KaraokeLine + WavyLines, DonutMetric, EndCard + SubscribeArrow | Highlight reel demo of 5 skill families |
| **ShowreelV.tsx** | 1080×1920 | 14.5s | CoquetteIntro, POVCaption + CornerWatermark, iMessageBubble, HeartEyes, NumberedList, LikeBurst, AnimatedGradient + SubscribeArrow | TikTok-aspect vertical short, 8 skill families |
| **ShowreelExplainer.tsx** | 1920×1080 | 19.3s | ChapterBumper + WavyLines, CodeSnippet, TerminalCommand, ProgressRing (B-roll), SectionBreak, PullQuote | Long-form tutorial format |
| **ProductIntro.tsx** | 1080×1920 | 30s | WaitZoomHook, WordPopCaption, PolaroidFrame, ProgressRing, CodeSnippet, TapToFollow, AnimatedGradient | Full product-intro short (from TUTORIAL.md walkthrough) |
| **ShowreelMeme.tsx** | 1080×1920 | 17s | POVCaption, CensorBar, MindBlown, ExpectedVsHappened, CryingLaugh, HundredSlam, SpinningLetters, StampImpact | Meme/comedy showreel — proves the meme-coded components compose cleanly when sequenced. Demonstrates that you CAN chain reactions if you sequence them apart (HundredSlam at f315, CryingLaugh at f255 — 60 frames between them). |
| **StressTest.tsx** | 1920×1080 | 23s | NumberedList (7 items), KaraokeLine (mixed unicode), CodeSnippet (80-char line), BarChart (6 categories), TypewriterPro (all punctuation) | Verifies the anti-pattern caps documented in each SKILL.md actually hold at the boundary |

## How to use these

1. Pick the template closest to what you're building.
2. Copy the `.tsx` file into your Remotion project's `src/`.
3. Adjust the props (brand name, durations, text content).
4. Register the matching composition in `Root.tsx` (each comes with a `TestRoot*.tsx` example).
5. Run `bash tests/skill-sources-typecheck.sh` to catch prop-name bugs before render (this script saved me twice during the night — once on the WordPopCaption skill misattribution, once on a lowercase JSX tag).
6. Render with `--mute --codec h264` and `npx remotion render`.

## Hard-won lessons embedded in these templates

- **Multi-layered `AbsoluteFill` with `zIndex`** — see Showreel scene 2 for the pattern: background fill at z0, content overlay at z1. Both AbsoluteFills inside a parent AbsoluteFill.
- **Half-frame caption + half-frame visual** — see ProductIntro features 1–3 for the upper/lower split pattern. Uses `paddingTop`/`paddingBottom` with `justifyContent: flex-start/flex-end` so caption and supporting visual don't overlap.
- **Lowercase-named component import alias** — ShowreelV does `import { iMessageBubble as IMessageBubble } from "./social-ui"` because JSX treats lowercase tags as HTML intrinsics.
- **B-roll between dense info components** — ShowreelExplainer puts a ProgressRing between CodeSnippet and TerminalCommand to give the eye a beat (the "don't chain 3+ tech components" rule from `remotion-tech` SKILL.md).
- **Persistent watermark across scenes** — ShowreelV puts CornerWatermark inside two different Sequences so it appears in scenes 2 and 3 with the same handle/position. Repeat the component if you want it across multiple beats; don't try to make it span Sequences.

## Related docs

- [../INDEX.md](../INDEX.md) — flat index of every component across the 22 Remotion skills.
- [../TUTORIAL.md](../TUTORIAL.md) — step-by-step build of the ProductIntro template.
- Each skill's `../<skill-name>/SKILL.md` — anti-patterns, recipes, prop overrides, audio cues, pairings.
