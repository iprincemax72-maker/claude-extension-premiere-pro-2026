---
name: remotion-logos
description: Four channel-logo / brand-intro components for Remotion — LogoSlam slam-in stinger, LogoMorph circular accent ring, LogoRing rotating accent halo, and LogoPulse breathing channel intro. Use when the user asks for "logo intro", "channel logo", "brand stinger", "logo reveal", "logo animation", or "intro sting".
---

# Remotion Logos

Four channel-logo / brand-intro stingers — drop in a single character/glyph or short brand name, get a tight 60–90 frame intro. Render-verified to mp4.

- [Source](./references/logos-source.tsx)

## The Four Logo Components

| Name | Use | Best as |
|------|-----|---------|
| **LogoSlam** | Big logo tile slams in with cast shadow + idle pulse | Cold-open intro (first 90f of a video) |
| **LogoMorph** | Logo morphs circle → rounded square with rotation | Mid-clip rebrand moment |
| **LogoRing** | Logo sits in a rotating dashed accent ring + counter-rotating inner ring | Held intro screen (e.g. while music spools up) |
| **LogoPulse** | Logo with breathing scale + periodic halo + brand text | End card / final hold |

## When to Load

- "Logo slam / logo intro / channel intro / stinger" → **LogoSlam**
- "Logo morph / shape morph / changing logo" → **LogoMorph**
- "Logo ring / rotating ring / halo / orbit" → **LogoRing**
- "Logo pulse / breathing logo / end card" → **LogoPulse**

## Golden rules

1. All four take a single-character `glyph` prop (the brand monogram). LogoSlam and LogoPulse also take an optional `brand` name shown beneath.
2. **The cast shadow on LogoSlam LAGS the logo by ~14 frames** — that's real physics (heavy object hits, then casts shadow). Don't "fix" the delay.
3. Animations are `useCurrentFrame()` driven, no `useState`.
4. **Default `bg` is `#0a0a0a`** on all four. For real-footage overlay, pass `bg="transparent"` and render with ProRes 4444.

## Anti-patterns

- **Don't** use LogoSlam with `glyph` longer than 2 chars. The tile is sized for one big monogram letter (e.g. "C"). Two chars work tightly ("CX"); three+ chars clip. For longer brand names use LogoPulse with a `brand` text below the monogram.
- **Don't** use LogoMorph for a permanent intro hold. The shape morphs from circle to rounded square and then stays — beyond ~120 frames you're holding on a static result. Use LogoPulse for held intros (its breathing loops cleanly).
- **Don't** override LogoRing's `ringSize`. The component computes `size * 1.35` for a reason — at higher ratios the dashed ring renders off-screen on tighter compositions.
- **Don't** stack two logos in the same composition. The "this is the brand" moment is singular. If you need to introduce two brands (e.g. host + sponsor), sequence: 90f LogoSlam for brand A, then 90f LogoSlam for brand B, with a beat between.
- **Don't** use LogoPulse for less than 90 frames. The breathing loop period is ~30 frames (1s) and the halo cycle is 90 frames — anything shorter and the periodic halo doesn't fire at all, making it indistinguishable from a static logo.

## Composition Recipes

**Cold-open channel intro (LogoSlam → content):**
```tsx
<Sequence durationInFrames={90}>
  <LogoSlam glyph="C" brand="CRUX" accent="#d97757" />
</Sequence>
<Sequence from={90}><YourFirstClip /></Sequence>
```

**Rebrand mid-clip (LogoMorph):**
```tsx
<Sequence from={400} durationInFrames={75}>
  <LogoMorph glyph="C" accent="#10b981" />
</Sequence>
```

**Hold screen with rotating ring (LogoRing while music spools):**
```tsx
<Sequence durationInFrames={120}>
  <LogoRing glyph="C" accent="#22d3ee" />
</Sequence>
```

**End card with breathing logo + brand:**
```tsx
<Sequence from={endFrame - 90} durationInFrames={90}>
  <LogoPulse glyph="C" brand="CRUX" accent="#ff7a4d" />
</Sequence>
```

**Brand intro with backdrop (mesh gradient behind LogoSlam):**
```tsx
<Sequence durationInFrames={90}>
  <AbsoluteFill>
    <AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" speed={1.5} />
    <AbsoluteFill style={{ zIndex: 1 }}>
      <LogoSlam glyph="C" brand="CRUX" bg="transparent" />
    </AbsoluteFill>
  </AbsoluteFill>
</Sequence>
```

## Common Prop Overrides

```tsx
// Branded accent color
<LogoSlam glyph="C" brand="CRUX" accent="#7c3aed" />

// Smaller size for corner brand
<LogoMorph glyph="A" size={240} />

// Inverse: white logo on dark
<LogoRing glyph="C" accent="#ffffff" bg="#0a0a0a" />

// LogoPulse without brand text (just the breathing logo)
<LogoPulse glyph="C" brand="" />
```

## Render Notes

- **Both landscape and vertical work** — all four use percentage-positioned containers. LogoSlam's tile is `size: 360` by default (works in both aspects).
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For ProRes 4444 alpha overlay (composite over real footage in Premiere): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - LogoSlam: tile lands ~14f → "THWACK" + low rumble; shadow lands at frame ~22f (delayed) → soft "settle" thud
  - LogoMorph: morph completes ~22f → "shapeshift swoosh"
  - LogoRing: outer ring spins continuously at 1.2°/frame (10s for full rotation) → tonal hum, no discrete cue points
  - LogoPulse: enter ~14f → soft chord; halo cycles every 90 frames (3s) → could pair each with a single tonal sting

## Pairing with other skills

- **LogoSlam + AnimatedGradient** (`remotion-backgrounds`) — mesh-gradient brand intro
- **LogoMorph → ChapterBumper** (`remotion-stingers`) — rebrand moment then chapter title
- **LogoRing + SoundWaveBars** (`remotion-music-lyrics`) — held intro with audio bars in corner
- **LogoPulse + EndCard** (`remotion-stingers`) — breathing logo + outro text + subscribe stack
- **LogoSlam → BrandReveal** (`remotion-stingers`) — monogram first, then full wordmark
