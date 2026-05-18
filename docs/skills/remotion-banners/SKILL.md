---
name: remotion-banners
description: Four banner-style components for Remotion — NewsTicker scrolling text, BreakingBanner red slide-in, CTABanner glowing prompt, and AlertStrip top warning. Use when the user asks for "news ticker", "breaking news", "scrolling banner", "CTA banner", "like and subscribe banner", "alert strip", "warning bar", or "marquee".
---

# Remotion Banners

Four banner-style overlays — bottom news tickers, breaking-news cards, top warning strips, and engagement CTA boxes. Render-verified to mp4.

- [Source](./references/banners-source.tsx)

## The Four Banners

| Name | Use | Position | Loops? |
|------|-----|----------|--------|
| **NewsTicker** | Bottom bar with continuously scrolling text + prefix label | Bottom, full-width | Yes — text scrolls indefinitely |
| **BreakingBanner** | Red "BREAKING" banner with headline, slide-in from bottom | Bottom, left-anchored | One-shot (lands and holds) |
| **CTABanner** | "LIKE AND SUBSCRIBE" with soft accent glow loop | Center, full-frame | Yes — glow breathes |
| **AlertStrip** | Top warning strip with pulsing dot | Top, full-width | Yes — dot + glow pulse |

## When to Load

- "News ticker / scrolling banner / marquee / bottom crawl" → **NewsTicker**
- "Breaking / breaking news / red banner / urgent" → **BreakingBanner**
- "Like / subscribe / CTA banner / engagement banner" → **CTABanner**
- "Alert / warning strip / top notice" → **AlertStrip**

## Golden rules

1. All four default to `bg="transparent"` — they're meant to overlay video content.
2. Animations are `useCurrentFrame()` driven, no `useState`.
3. **NewsTicker is the only one that needs `pixelsPerFrame` tuning** — default 6px/frame ≈ 180px/sec at 30fps. For longer text, set higher to keep the cycle from feeling slow.
4. **AlertStrip's `level` prop** (`warning | error | info`) drives color: yellow / red / blue respectively. `error` has an extra glow pulse; warning/info are calmer.

## Anti-patterns

- **Don't** use NewsTicker for important info viewers need to read. The scroll is constant — by the time a reader notices it, key text may have already scrolled past. Use BreakingBanner for "stop and read" moments; NewsTicker is ambient texture.
- **Don't** put BreakingBanner headlines longer than ~60 chars. The dark headline strip is sized for one-line news headers. Longer wraps unpredictably.
- **Don't** stack CTABanner + BreakingBanner — both want the bottom half of the frame and they'll fight visually. Sequence them: BreakingBanner during the news beat, CTABanner during the engagement beat.
- **Don't** use AlertStrip's `level="error"` for non-critical content. The pulsing glow is meme-coded as "real problem" — false alarms train viewers to dismiss the visual.
- **Don't** chain two NewsTickers in the same shot. The continuous scroll is hypnotic; doubling it overwhelms.
- **Don't** override CTABanner's `bg`. The semi-transparent dark `rgba(15,15,15,0.92)` is critical to readability; making it transparent makes the text fight whatever's behind, while making it opaque blocks too much of the underlying frame.

## Composition Recipes

**News-broadcast overlay during a clip:**
```tsx
<AbsoluteFill>
  <YourClip />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <NewsTicker
      text="Latest update — markets up 2% on Q4 earnings"
      label="LIVE"
      labelColor="#ed2024"
      pixelsPerFrame={6}
    />
  </AbsoluteFill>
</AbsoluteFill>
```

**Breaking news headline drop:**
```tsx
<Sequence durationInFrames={100}>
  <BreakingBanner
    headline="major story unfolds"
    label="BREAKING NEWS"
    bannerColor="#ed2024"
  />
</Sequence>
```

**End-card engagement prompt:**
```tsx
<Sequence from={endFrame - 60} durationInFrames={60}>
  <CTABanner text="LIKE AND SUBSCRIBE" accent="#ff7a4d" />
</Sequence>
```

**System alert during a screen recording:**
```tsx
<AbsoluteFill>
  <YourScreenRecording />
  <AbsoluteFill style={{ zIndex: 1, pointerEvents: "none" }}>
    <AlertStrip
      text="System update available — restart to apply changes"
      level="warning"
    />
  </AbsoluteFill>
</AbsoluteFill>
```

**Live-broadcast set (NewsTicker + AlertStrip + lower-third):**
```tsx
<AbsoluteFill>
  <YourFootage />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <AlertStrip text="LIVE NOW · ON AIR" level="error" />
    <NewsTicker text="market update / sports / weather…" label="LIVE" />
  </AbsoluteFill>
  <AbsoluteFill style={{ zIndex: 2 }}>
    {/* lower-third from remotion-lower-thirds */}
    <NewsBroadcast name="Vera Dixie" role="reporter" />
  </AbsoluteFill>
</AbsoluteFill>
```

## Common Prop Overrides

```tsx
// NewsTicker faster scroll
<NewsTicker text="..." pixelsPerFrame={10} />

// BreakingBanner in brand color (not red)
<BreakingBanner headline="…" bannerColor="#7c3aed" label="EXCLUSIVE" />

// CTABanner with custom text and accent
<CTABanner text="TAP FOLLOW NOW" accent="#10b981" />

// AlertStrip error level
<AlertStrip text="Critical bug detected" level="error" />

// AlertStrip info (calm blue)
<AlertStrip text="Captions enabled" level="info" />
```

## Render Notes

- **1920×1080 or 1080×1920** — both work. NewsTicker's height (84px) is more obvious in vertical; in landscape it's a slim strip. AlertStrip is symmetric.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For ProRes 4444 alpha overlay: render with `--codec prores --prores-profile 4444 --mute`. All four default to `bg="transparent"`.
- **Audio cue points:**
  - NewsTicker: continuous, no cue points; underscore with sustained news-room hum
  - BreakingBanner: slides in ~14f → "BREAKING NEWS" sting; flash at frame 4-6 → quick whoosh
  - CTABanner: lands ~14f → soft "ding"; glow breathes on a ~31-frame period (`|sin(f * 0.1)|` → π/0.1 ≈ 1s at 30fps) → no SFX needed for the loop
  - AlertStrip: lands ~14f → notification chime; dot pulses on a ~16-frame period (`|sin(f * 0.2)|` → π/0.2 ≈ 0.5s at 30fps) → no SFX for loop

## Pairing with other skills

- **NewsTicker + RetroVhs** (`remotion-lower-thirds`) — vintage broadcast set
- **NewsTicker + NewsBroadcast** (`remotion-lower-thirds`) — modern news broadcast set
- **BreakingBanner → CTABanner** — news moment then engagement prompt
- **AlertStrip + SponsorPlate** (`remotion-stingers`) — "LIMITED TIME" alert + sponsor card
- **CTABanner + SubscribeArrow** (`remotion-ctas`) — banner above, arrow points at the YT subscribe button
