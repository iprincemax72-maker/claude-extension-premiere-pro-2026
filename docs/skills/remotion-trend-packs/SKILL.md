---
name: remotion-trend-packs
description: Seven authentic stylized title-moment "trend packs" for Remotion — each modeled with its source aesthetic's specific motion vocabulary. Brat with grain + hover loop, Coquette with depth-staggered sparkles + ribbon stroke draw, Y2K with rotating chrome specular + lens flare, Vaporwave with breathing sun + CRT scanlines, Editorial Brutalist with tight -0.07em kerning + paper grain, Glitch Hype with multi-wave RGB chaos + rolling scanlines + datamosh slices, Mocha Podcast with breathing light leak. Use when the user asks for a "Brat title", "Coquette intro", "Y2K", "Vaporwave", "Brutalist editorial", "Glitch reveal", "Mocha podcast intro", or specifies a 2024-2026 trend palette by name.
---

# Remotion Trend Packs (v2 — authentic motion)

Seven complete stylized title moments. Each is **modeled after the real visual identity** of its era — not just colored to match.

## Quick Reference

- [Source](./references/trend-packs-source.tsx)
- [Catalog](./references/trend-packs-catalog.md)

## What "authentic" means per pack

| Pack | Motion personality |
|------|-------------------|
| **BratTitle** | Anti-design. Lowercase forced. Kerning closes wide→tight, then *static energy* — multi-sine hover (0.6px) + film jitter. No glow, no shadow. |
| **CoquetteIntro** | Depth-staggered sparkles (near = bigger/slower/brighter; far = smaller/blurred/dimmer). Ribbon flourish drawn via SVG `stroke-dashoffset`. Soft pink glow beneath title. |
| **Y2KChromeTitle** | Rotating specular highlight across the chrome gradient (1.5°/frame). Lens-flare sweeps across once at frame 30. Grid pulses to a 30-frame beat. Title rotates ±5° in 3D. |
| **VaporwaveSunset** | Sun breathes ±2.5%. Atmospheric grid glow (closer = brighter). Palm silhouettes anchored in corners. CRT scanlines (multiply blend). |
| **EditorialBrutalist** | Real publication kerning (`-0.07em`). Paper grain (multiply). Accent bar draws, then pulses 3 cycles with damping. Optional dated stamp. |
| **GlitchHype** | Multi-wave chaos — strong at first, re-spikes at 50–70%, dies down. Datamosh horizontal slices. Rolling bright scanline (VHS). Optional "REC ●" timestamp. |
| **MochaPodcastIntro** | Breathing light leak (slow opacity pulse). Title settles with kerning bounce after entrance. Warm-light underline draws beneath (drop shadow glow). |

## When to Load

- "Brat / Charli XCX / lime green / anti-design title" → **BratTitle**
- "Coquette / pink / sparkle / blush / feminine / soft" → **CoquetteIntro**
- "Y2K / chrome / metallic / 2000s / perspective grid" → **Y2KChromeTitle**
- "Vaporwave / synthwave / sunset / palm trees / retro grid" → **VaporwaveSunset**
- "Editorial / brutalist / fashion magazine / publication / massive headline" → **EditorialBrutalist**
- "Glitch / RGB split / VHS / cyberpunk / hype / drop" → **GlitchHype**
- "Mocha / Pantone 2025 / warm earth / podcast intro / calm" → **MochaPodcastIntro**

## Anti-patterns

- **Don't** put two trend packs back-to-back — they each occupy a strong aesthetic lane. Trend-pack → calm body → trend-pack works; trend-pack → trend-pack does not.
- **Don't** override the palette on BratTitle. The lime-on-black is the trademark — once you change it, it's not a Brat title anymore.
- **Don't** turn off `withScanlines` on Vaporwave unless you're stacking another scanline source — flat vaporwave reads as a gradient, not the aesthetic.
- **Don't** pass long sentences to any of these. Trend packs are for *one word* or a *very short phrase*. Multi-line trend packs break the design.
- **Don't** put EditorialBrutalist over real footage. It's a magazine-cover aesthetic — it owns the whole frame.

## Composition Recipes

**Brat opening + body content:**
```tsx
<Sequence durationInFrames={60}><BratTitle text="apple" /></Sequence>
<Sequence from={60}><YourBodyContent /></Sequence>
```

**Y2K throwback intro stack:**
```tsx
<Sequence durationInFrames={70}>
  <Y2KChromeTitle text="ICONIC" withLensFlare />
</Sequence>
<Sequence from={70}>
  <SubscribePop clickFrame={50} /> {/* from remotion-social-ui */}
</Sequence>
```

**Editorial cover → body:**
```tsx
<Sequence durationInFrames={90}>
  <EditorialBrutalist
    text="POWER"
    kicker="ISSUE 04"
    dateStamp="NOV 2026"
    accent="#e63946"
  />
</Sequence>
<Sequence from={90}><LowerThird name="..." role="..." /></Sequence> {/* from remotion-lower-thirds */}
```

**Drop reveal — Glitch into clean:**
```tsx
<Sequence durationInFrames={50}>
  <GlitchHype text="DROP" chaosFrames={18} />
</Sequence>
<Sequence from={50}>
  <YourCleanRevealContent />
</Sequence>
```

**Calm podcast intro → typewriter line:**
```tsx
<Sequence durationInFrames={80}>
  <MochaPodcastIntro text="The Late Hours" kicker="EP. 12" />
</Sequence>
<Sequence from={80}>
  <TypewriterPro text="..." /> {/* from remotion-text-presets */}
</Sequence>
```

**Vaporwave music moment:**
```tsx
<Sequence durationInFrames={100}>
  <VaporwaveSunset text="DREAMER" withScanlines withPalms />
</Sequence>
<Sequence from={100}>
  <LyricDrop lyric="..." bpm={120} /> {/* from remotion-music-lyrics */}
</Sequence>
```

## Common Prop Overrides

```tsx
// Brat title with a slightly different lime
<BratTitle text="apple" color="#7eb800" />

// Coquette in deeper rose
<CoquetteIntro text="dreams" accent="#ff5599" ink="#a83b6a" bg="#ffd9d2" />

// Y2K without the lens flare (calmer)
<Y2KChromeTitle text="WIN" withLensFlare={false} />

// Vaporwave without palms (cleaner geometric look)
<VaporwaveSunset text="DREAMER" withPalms={false} withScanlines />

// Brutalist on dark stock (less common, but works)
<EditorialBrutalist text="DESIGN" bg="#0a0a0a" accent="#ff7a4d" />

// Heavier glitch — longer chaos
<GlitchHype text="HYPE" chaosFrames={22} />

// Mocha without underline (cleaner)
<MochaPodcastIntro text="Late Hours" withUnderline={false} />
```

## Render Notes

- 1920×1080 or 1080×1920, 60–90 frames @ 30fps fits all packs.
- Render with `--mute`. These are pure visual moments. (`--audio-codec=no-audio` is an invalid Remotion flag.)
- Trend packs work best as **opening shots** — pair with a clean transition out to body content.
- BratTitle and EditorialBrutalist work in landscape AND vertical; the others (especially Y2K/Vaporwave with perspective grids) are stronger in landscape.

## Pairing with other skills

- **BratTitle → POVCaption** (`remotion-hooks`) — Brat opener then "POV:" body
- **Y2KChromeTitle → SubscribeArrow** (`remotion-ctas`) — chrome intro then end-card
- **EditorialBrutalist → LowerThird** (`remotion-lower-thirds`) — magazine cover then interview lower-third
- **MochaPodcastIntro → TypewriterPro** (`remotion-text-presets`) — calm intro then a quoted line
- **GlitchHype → DropIncoming** (`remotion-music-lyrics`) — drop preamble then the literal 3-2-1 reveal
- **VaporwaveSunset → LyricDrop** (`remotion-music-lyrics`) — synthwave intro then beat-thump lyric
