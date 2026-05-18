---
name: remotion-comparison
description: Five before/after and versus comparison components for Remotion — split-screen Before/After, Day 1 vs Day 30 transformation, Then vs Now nostalgia card, "What I expected vs what happened" panels, and a centered VS battle card. Use when the user asks for "before and after", "split screen", "Day 1 Day 30", "then vs now", "expected vs reality", "versus", or any side-by-side comparison.
---

# Remotion Comparison

Five side-by-side comparison cards for transformation, versus, or "this vs that" content. Render-verified to mp4.

- [Source](./references/comparison-source.tsx)
- [Catalog](./references/comparison-catalog.md)

## Components

| Name | Use | Visual identity |
|------|-----|-----------------|
| **BeforeAfter** | Generic Before / After split, labels at top | Hard center-split, equal weight |
| **DayOneVsDayThirty** | Transformation arc | Left desaturated, right punchy — direction matters (left = before, right = after) |
| **ThenVsNow** | Nostalgia card | Vintage filter left, modern-clean right |
| **ExpectedVsHappened** | Expectation vs reality | Playful panels, second one with mild distortion |
| **VersusCard** | Battle card | Centered "VS" between two big labels |

## When to Load

- "Before and after / before/after / split" → **BeforeAfter**
- "Day 1 vs Day 30 / transformation / progress" → **DayOneVsDayThirty**
- "Then vs now / nostalgia" → **ThenVsNow**
- "What I expected / expectation vs reality" → **ExpectedVsHappened**
- "Versus / VS / battle card / X vs Y" → **VersusCard**

## Golden Rules

1. Pass two text labels (and optionally two image URLs for the visual components).
2. All animation is `useCurrentFrame()` + `interpolate()`/`spring()` — frame-deterministic.
3. Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
4. **Order matters.** Each component encodes a narrative arrow (Day1→Day30, Then→Now, Expected→Actual). Don't flip the labels expecting the same visual — the desaturated/aged side is always LEFT.

## Anti-patterns

- **Don't** use BeforeAfter for transformation moments — use DayOneVsDayThirty. BeforeAfter is value-neutral; DayOneVsDayThirty has built-in fade/punch contrast that does the storytelling work for you.
- **Don't** use ExpectedVsHappened for serious content. The mild distortion on the "happened" side is meme-coded — viewers read it as comedy. For neutral comparisons use BeforeAfter or ThenVsNow.
- **Don't** put long labels (>10 chars) on VersusCard. The two side labels are sized for short words (PIZZA, TACO, OLD, NEW). Long labels overrun the centered "VS" badge.
- **Don't** chain two comparisons back-to-back. The mental model of "compare A and B" + "compare C and D" overloads. Pair one comparison with a body clip explaining the takeaway.
- **Don't** use ThenVsNow over actually old footage. Its vintage filter is meant to *simulate* aging on modern content. Real aged content + filter is too much aging.

## Composition Recipes

**Transformation reveal (Day 1 → Day 30):**
```tsx
<Sequence durationInFrames={120}>
  <DayOneVsDayThirty start="Day 1" end="Day 30" />
</Sequence>
```

**Product comparison (BeforeAfter with image URLs):**
```tsx
import { staticFile } from "remotion";

<Sequence durationInFrames={100}>
  <BeforeAfter
    before={staticFile("old-logo.png")}
    after={staticFile("new-logo.png")}
    beforeLabel="BEFORE"
    afterLabel="AFTER"
  />
  {/* BeforeAfter auto-detects URL-vs-text on each side: if `before` or
      `after` starts with `/`, `http`, or `file:` it renders as an <Img>
      with cover-fit + the "faded" filter applied to the left half. Pass
      plain text and the side becomes a colored gradient panel with the
      text centered. Mixing one image side + one text side works. */}
</Sequence>
```

**Versus moment in a debate video:**
```tsx
<Sequence durationInFrames={75}>
  <VersusCard leftLabel="REACT" rightLabel="VUE" />
</Sequence>
```

**Meme moment (expected vs happened):**
```tsx
<Sequence durationInFrames={100}>
  <ExpectedVsHappened expected="Smooth sailing" happened="Total chaos" />
</Sequence>
```

**Nostalgia callback (Then vs Now):**
```tsx
<Sequence durationInFrames={90}>
  <ThenVsNow then="2014" now="2026" />
</Sequence>
```

## Common Prop Overrides

```tsx
// BeforeAfter with custom label colors (modify by forking source if needed)
<BeforeAfter before="Original" after="Restored" beforeLabel="BEFORE" afterLabel="AFTER" />

// DayOneVsDayThirty for fitness arc
<DayOneVsDayThirty start="Day 1" end="Day 90" />

// ThenVsNow with year labels
<ThenVsNow then="2010" now="2026" />

// VersusCard in short-form
<VersusCard leftLabel="iOS" rightLabel="ANDROID" />
```

## Render Notes

- **1920×1080 landscape** is the canonical canvas. The 50/50 split is sized for landscape — vertical 1080×1920 squashes both sides to half-width which makes labels overlap.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For overlay use (compare two real video clips with the labels on top): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - BeforeAfter: split divider lands at frame ~14 → "snap" SFX on frame 12
  - DayOneVsDayThirty: right-side punch lands at ~22f → "whoosh + impact" combo
  - ThenVsNow: cross-fade completes ~24f → soft pad sustains
  - ExpectedVsHappened: distortion fizzles in 14–22f → "glitch pop" SFX
  - VersusCard: VS badge appears at ~16f → "thwack" with reverb

## Pairing with other skills

- **DayOneVsDayThirty + ProgressRing** (`remotion-stats`) — transformation + completion percentage
- **VersusCard + StampImpact** (`remotion-text-presets`) — battle reveal + WINNER stamp
- **BeforeAfter + MarkerUnderline** (`remotion-text-presets`) — comparison + highlighted takeaway
- **ExpectedVsHappened + LikeBurst** (`remotion-social-ui`) — meme moment with hearts
- **ThenVsNow + NowPlaying** (`remotion-music-lyrics`) — nostalgia card with throwback track playing
