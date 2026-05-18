# Tutorial — Building a complete short with the v2 skills

This is a step-by-step tutorial for composing a real 30-second video using the v2 skill library. Use this when you're starting a fresh project and want a concrete playbook.

## The brief

> "Make a 30-second vertical video introducing my product. Hook the viewer, show 3 features, end with a CTA to follow."

Translated to a frame budget at 30fps:

| Beat | Seconds | Frames | Cumulative |
|------|---------|--------|------------|
| Hook | 0–3s | 0–90 | 90 |
| Feature 1 | 3–11s | 90–330 | 330 |
| Feature 2 | 11–19s | 330–570 | 570 |
| Feature 3 | 19–27s | 570–810 | 810 |
| CTA | 27–30s | 810–900 | 900 |

Total: 900 frames @ 30fps = 30 seconds.

## Step 1 — Pick the components

Open [INDEX.md](./INDEX.md) and find one component per beat:

| Beat | Pick | Why |
|------|------|-----|
| Hook | **WaitZoomHook** (`remotion-hooks`) | Zoom-punch on the product name |
| Feature 1 | **WordPopCaption** (`remotion-hooks`) + **PolaroidFrame** (`remotion-frames`) | Caption + supporting visual |
| Feature 2 | **WordPopCaption** + **ProgressRing** (`remotion-stats`) | "94% accuracy" claim |
| Feature 3 | **WordPopCaption** + **CodeSnippet** (`remotion-tech`) | "It's just 3 lines of code" |
| CTA | **TapToFollow** (`remotion-ctas`) + **AnimatedGradient** (`remotion-backgrounds`) | Final pointer + hero backdrop |

## Step 2 — Verify the choices against cross-skill anti-patterns

From [INDEX.md](./INDEX.md) and individual SKILL.md files:

- ✅ Don't chain 3+ CTAs — we use only 1 (TapToFollow).
- ✅ Don't chain >2 reactions back-to-back — we use 0 reactions.
- ✅ Don't layer GlitchText + NeonGlow — we use neither.
- ✅ Don't put two backgrounds simultaneously — we use 1 (AnimatedGradient at end).
- ✅ Don't chain 3+ tech components — we use 1 (CodeSnippet).

All clear.

## Step 3 — Wire it up

```tsx
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { WaitZoomHook } from "./hooks";
import { WordPopCaption } from "./text-presets";
import { PolaroidFrame } from "./frames";
import { ProgressRing } from "./stats";
import { CodeSnippet } from "./tech";
import { TapToFollow } from "./ctas";
import { AnimatedGradient } from "./backgrounds";

export const ProductIntro: React.FC = () => (
  <AbsoluteFill style={{ background: "#0a0a0a" }}>
    {/* HOOK 0–90 */}
    <Sequence durationInFrames={90}>
      <WaitZoomHook text="meet QUICKSHIP" punchWord="QUICKSHIP" />
    </Sequence>

    {/* FEATURE 1: 90–330 — 8 seconds. Sequential within the feature:
        caption first (3s, own full-frame), then supporting visual (5s,
        own full-frame). WordPopCaption + visual can't be stacked in one
        AbsoluteFill because WordPopCaption uses its own AbsoluteFill + 
        centered layout — see "Common mistakes" #4 below. */}
    <Sequence from={90} durationInFrames={90}>
      <WordPopCaption words={["fast", "shipping", "anywhere"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={180} durationInFrames={150}>
      <PolaroidFrame content="🚚" caption="2-day worldwide" />
    </Sequence>

    {/* FEATURE 2: 330–570 */}
    <Sequence from={330} durationInFrames={90}>
      <WordPopCaption words={["94%", "on-time", "rate"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={420} durationInFrames={150}>
      <ProgressRing target={94} label="on time" />
    </Sequence>

    {/* FEATURE 3: 570–810 */}
    <Sequence from={570} durationInFrames={90}>
      <WordPopCaption words={["just", "3 lines", "of code"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={660} durationInFrames={150}>
      <CodeSnippet
        code={`import { ship } from "quickship";
const order = await ship("anywhere");
console.log(order.id);`}
        language="tsx"
        charsPerFrame={1.5}
      />
    </Sequence>

    {/* CTA: 810–900 — 3 seconds */}
    <Sequence from={810} durationInFrames={90}>
      <AbsoluteFill>
        <AnimatedGradient colorA="#10b981" colorB="#3b82f6" speed={1.5} />
        <AbsoluteFill style={{ zIndex: 1 }}>
          <TapToFollow label="follow @quickship" />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);
```

## Step 4 — Register the composition

```tsx
// src/Root.tsx
<Composition
  id="ProductIntro"
  component={ProductIntro}
  durationInFrames={900}
  fps={30}
  width={1080}
  height={1920}
/>
```

## Step 5 — Typecheck before render

```bash
bash tests/skill-sources-typecheck.sh
# This catches prop-naming bugs that the render itself tolerates.
```

## Step 6 — Render

```bash
npx remotion render src/index.ts ProductIntro /tmp/product-intro.mp4 --mute --codec h264
```

Don't use `--audio-codec=no-audio` — that flag is invalid and will error. Use `--mute` (silent video, AAC track at 0 dB).

## Step 7 — Post-process (optional)

If Premiere is the destination and you really don't want even a silent audio track:

```bash
ffmpeg -i /tmp/product-intro.mp4 -c:v copy -an /tmp/product-intro-noaudio.mp4
```

For ProRes 4444 alpha overlay (transparent background, composite over real footage in Premiere):

```bash
npx remotion render src/index.ts ProductIntro /tmp/product-intro.mov --codec prores --prores-profile 4444 --mute
```

Make sure every component you use has `bg="transparent"` set when going the ProRes route.

## Common mistakes to avoid

1. **Forgetting to register the composition in `Root.tsx`** — the renderer can't find it otherwise.
2. **Using a lowercase-starting component name in JSX** — `<iMessageBubble />` is treated as an HTML tag. Import with a capital alias: `import { iMessageBubble as IMessageBubble } from ...`.
3. **Passing the wrong prop name** — components ignore unknown props at runtime, so the render "succeeds" but the prop value isn't applied. Always typecheck first (Step 5).
4. **Stacking two full-frame components in one AbsoluteFill expecting them to share screen real estate** — many v2 skill components (WordPopCaption, BarChart, ProgressRing, etc.) render their own internal AbsoluteFill with `justifyContent: center` and a fill background. Stacking them via `<AbsoluteFill><A /><B /></AbsoluteFill>` doesn't position A above B; the second one renders ON TOP of the first. Either: (a) sequence them in time (one Sequence each, back-to-back), or (b) pass `bg="transparent"` to whichever you want behind AND fork the source to remove the centering. Sequential is almost always the cleaner choice. **When two backgrounds are stacked, set opacity or `mixBlendMode` on the top one** — backgrounds from `remotion-backgrounds` are explicitly designed to be stackable, unlike most foreground components.
5. **Sequencing past `durationInFrames`** — content past the composition end isn't rendered. The total `durationInFrames` must cover every Sequence's `from + durationInFrames`.
6. **Using `Math.random` or `Date.now()` inside components** — non-deterministic, breaks frame caching. Use `useCurrentFrame()` + math instead.

## See also

- [INDEX.md](./INDEX.md) — flat index of every component
- [showreel/Showreel.tsx](./showreel/Showreel.tsx) — landscape highlight reel template
- [showreel/ShowreelV.tsx](./showreel/ShowreelV.tsx) — vertical TikTok template
- [showreel/ShowreelExplainer.tsx](./showreel/ShowreelExplainer.tsx) — long-form tutorial template
- [showreel/ProductIntro.tsx](./showreel/ProductIntro.tsx) — finished version of the composition built in this tutorial
- [showreel/ShowreelMeme.tsx](./showreel/ShowreelMeme.tsx) — meme/comedy showreel (proves reactions can chain when sequenced apart)
- [showreel/StressTest.tsx](./showreel/StressTest.tsx) — edge-case verification at every documented cap
- Each skill's `SKILL.md` for anti-patterns, recipes, prop overrides, audio cues, pairings.
