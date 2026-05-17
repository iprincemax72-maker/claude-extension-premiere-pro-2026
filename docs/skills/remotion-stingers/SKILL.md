---
name: remotion-stingers
description: Four brand-moment stinger components for Remotion. Use when the user asks for a "brand reveal", "logo intro", "end card", "outro", "chapter title", "part 2 bumper", "sponsor plate", or any short branded transition card between content blocks.
---

# Remotion Stingers

Four brand-moment / interstitial components for intros, outros, and chapter transitions. Render-verified to mp4.

- [Source](./references/stingers-source.tsx)
- [Catalog](./references/stingers-catalog.md)

## The Four Stingers

| Name | Use for | Choreography |
|------|---------|--------------|
| **BrandReveal** | Big logotype with mask-wipe reveal + accent line + tagline. Channel intro. | Mask wipes outward from center 0–18f; line draws 18–28f; tagline fades 28–40f |
| **EndCard** | YouTube-style outro — "THANKS FOR WATCHING" + Like/Subscribe | Primary slides up 0–18f; subtitle row 10–22f; heart pulses indefinitely (loop-safe) |
| **ChapterBumper** | "PART 02 — The Reckoning" cinematic title card with serif italic | Number 0–10f; line draws 0–18f; title rises 14–22f |
| **SponsorPlate** | "BROUGHT TO YOU BY ACME" pop-in card for ad reads | Card pops 0–6f; sponsor slides into place 12–22f |

## Trigger keywords

`"brand reveal"`, `"logo intro"`, `"channel intro"`, `"outro"`, `"end card"`, `"like and subscribe"`, `"thanks for watching"`, `"chapter title"`, `"part 02 bumper"`, `"sponsor plate"`, `"brought to you by"`, `"interstitial"`

## Golden rules

1. All stingers are full-frame cards — designed to play as standalone 1–3s segments BETWEEN other content, not as overlays
2. **Default duration sweet spot: 60–90 frames at 30fps (2–3 seconds).** Past 90f, the choreography has completed and you're holding on a static card — viewers feel it as dead air. Either cut earlier or layer subtle motion (e.g. a `WavyLines` background underneath).
3. BrandReveal uses CSS `mask-image` for the wipe — black areas are VISIBLE, transparent are HIDDEN (easy to invert by mistake — the source has the correct directions). The wipe expands a black gap outward from center.
4. EndCard's heart pulse uses `Math.sin(frame * 0.3) * 0.06` — it loops cleanly without seams. Safe to hold past the spring entrance.

## Anti-patterns

- **Don't** use BrandReveal for short brand names (≤2 chars). The mask-wipe needs visual real estate — single letters wipe so fast the effect is invisible. For short names use `LogoSlam` from `remotion-logos` instead.
- **Don't** stack a BrandReveal *and* a ChapterBumper at the start of a video. They're both "this is the title moment" devices. Pick one.
- **Don't** use SponsorPlate without a hold beat. The card lands in 22 frames but the eye needs ~30 frames to read "BROUGHT TO YOU BY ACME" — total minimum 60 frames. Anything shorter feels rushed and disrespectful to the sponsor.
- **Don't** override `bg="transparent"` on these. Stingers are designed as standalone cards — making them transparent leaves them floating over your content, which kills the "interstitial" intent. If you want a brand overlay during content, use `remotion-lower-thirds` or `remotion-banners` instead.
- **Don't** put a ChapterBumper with `number` longer than 4 characters (e.g. "VIII", "FOUR"). The label space is sized for "01"-style numerals. Long numbers throw the typographic hierarchy off.

## Composition Recipes

**Channel intro (BrandReveal at top):**
```tsx
<Sequence durationInFrames={75}>
  <BrandReveal brand="CRUX" tagline="design + dev" accent="#10b981" />
</Sequence>
<Sequence from={75}><YourFirstClip /></Sequence>
```

**Outro card (EndCard at end, hold while music tails out):**
```tsx
<Sequence from={lastFrame - 90} durationInFrames={90}>
  <EndCard primary="THANKS FOR WATCHING" secondary="Like · Subscribe · See you next time" accent="#ef4444" />
</Sequence>
```

**Chapter break (mid-video bumper):**
```tsx
<Sequence from={300} durationInFrames={75}>
  <ChapterBumper number="02" title="The Reckoning" numLabel="PART" accent="#fde047" />
</Sequence>
<Sequence from={375}><Chapter2Content /></Sequence>
```

**Ad read bookends (sponsor plate before + after):**
```tsx
<Sequence from={contentEnd} durationInFrames={60}>
  <SponsorPlate sponsor="ACME" prefix="BROUGHT TO YOU BY" />
</Sequence>
<Sequence from={contentEnd + 60}><AdRead /></Sequence>
<Sequence from={adEnd} durationInFrames={60}>
  <SponsorPlate sponsor="ACME" prefix="THIS WAS" cardColor="#0a0a0a" textColor="#fff" accent="#fff" />
</Sequence>
```

**Brand intro with backdrop (gradient behind brand reveal):**
```tsx
<Sequence durationInFrames={75}>
  <AbsoluteFill>
    <AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" speed={1.5} />
    <AbsoluteFill style={{ zIndex: 1 }}>
      <BrandReveal brand="CRUX" tagline="design + dev" bg="transparent" />
    </AbsoluteFill>
  </AbsoluteFill>
</Sequence>
```

## Common Prop Overrides

```tsx
// BrandReveal with brand-color line + tagline
<BrandReveal brand="CRUX" accent="#ff7a4d" />

// EndCard with custom tagline
<EndCard primary="THAT'S A WRAP" secondary="See you Friday · Bell on" />

// ChapterBumper using a name instead of a number
<ChapterBumper number="THREE" title="Recovery" numLabel="CHAPTER" />

// SponsorPlate inverted (dark card on dark bg)
<SponsorPlate sponsor="ACME" cardColor="#1a1a1a" textColor="#fff" accent="#fff" />
```

## Render Notes

- **1920×1080, 30fps** is the canonical canvas. All stingers fit 1080×1920 vertical too — but BrandReveal's 200px font for the brand text + 380px accent line are tuned for landscape. For vertical, shrink font sizes by ~25% and line width to 280px (fork the source).
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid — legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- **WebKit mask compatibility:** BrandReveal uses both `maskImage` and `WebkitMaskImage` for cross-browser safety. Don't drop either — Chromium (Remotion's renderer) needs the webkit-prefixed version.
- **Audio cue points:**
  - BrandReveal: wipe completes ~18f; tagline appears 28–40f → "logo bang" SFX at frame 8 (peak of mask wipe), soft pad sustains through tagline
  - EndCard: primary lands ~18f; subtitle row at ~22f → soft chord at frame 0, secondary tick at frame 22
  - ChapterBumper: line draws by 18f; title rises 14–22f → film "thwack" at frame 14 (title landing)
  - SponsorPlate: card lands 6f; sponsor at 22f → snare/thud at frame 0, "stamp" at frame 22
- These cards work well with a brief silence after the SFX cue — let the visual hold for ~30 frames before cutting to the next clip.

## Pairing with other skills

- **BrandReveal + AnimatedGradient** (`remotion-backgrounds`) — mesh-gradient backdrop behind the logo wipe
- **ChapterBumper + WavyLines** (`remotion-backgrounds`) — calm waves behind a cinematic chapter title
- **EndCard + LikeBurst** (`remotion-social-ui`) — outro card with hearts flying out for emphasis
- **SponsorPlate + AlertStrip** (`remotion-banners`) — sponsor card with a "limited offer" alert strip
- **BrandReveal → LogoPulse** (`remotion-logos`) — channel reveal then breathing-logo hold during talking content
