---
name: remotion-backgrounds
description: Four animated background presets for Remotion. Use when the user asks for an "animated background", "gradient background", "particle field", "noise / grain texture", "wavy lines background", or any full-frame backdrop behind other content.
---

# Remotion Backgrounds

Four animated backdrops — each fills the frame as an `AbsoluteFill` and is intended to sit BEHIND other content.

- [Source](./references/backgrounds-source.tsx)
- [Catalog](./references/backgrounds-catalog.md)

## The Four Backgrounds

| Name | Vibe | Best for | Render cost |
|------|------|----------|-------------|
| **AnimatedGradient** | Drifting mesh-gradient blobs | Hero shots, brand intros, podcast covers | Cheap — pure CSS radial gradients |
| **ParticleField** | Slow-floating dots with depth | Tech, dark mode, late-night vibe | Cheap — 80 dots, position-only animation |
| **NoiseGrain** | Procedural TV-static dots | Retro, VHS, vintage film | **Heavy** — 90×90 grid (8100 cells) filtered by `intensity`; reseeds every frame |
| **WavyLines** | Parallax sine waves | Calm, designed, branded | Cheap — 7 polylines × 36 segments |

## Trigger keywords

`"animated background"`, `"gradient bg"`, `"mesh gradient"`, `"particle field"`, `"floating dots"`, `"noise texture"`, `"film grain"`, `"static overlay"`, `"wavy lines"`, `"sine wave background"`

## Golden rules

1. All are full-frame `AbsoluteFill` — wrap your content in another `AbsoluteFill` on top with `zIndex: 1`
2. `NoiseGrain` is meant to LAYER over other content with `mixBlendMode: "overlay"` or low opacity — it's not great as a standalone backdrop because the grid is faintly visible
3. Animations are frame-deterministic — pass an explicit `speed` prop on `AnimatedGradient` to tune drift rate (1 = slow, 3 = fast)
4. ParticleField positions are seeded from `i` — deterministic and reproducible across renders

## Anti-patterns

- **Don't** crank `NoiseGrain intensity` above ~0.6. The component renders 8,100 grid cells per frame, kept-rate scales linearly with intensity. At `intensity=1` you're rendering ~400+ DOM nodes per frame — render time triples and Chrome's compositor lags.
- **Don't** use `monochrome={false}` on `NoiseGrain` for footage with strong color. The pseudo-random shade values clash with most subjects — keep it monochrome for film/VHS look.
- **Don't** set `ParticleField count > 200`. The component is fine at 80 (default); past 200 it dominates frame paint time without visual gain (you can't see individual particles in a dense field).
- **Don't** drop `AnimatedGradient` behind text without verifying contrast against both `colorA` and `colorB` at their *brightest* moment. The blob drift means contrast oscillates — test the worst frame, not the average.
- **Don't** layer two of these (e.g. WavyLines + NoiseGrain) without setting opacity. Both compete for the eye. Stack with `opacity: 0.3` on the top one or use `mixBlendMode: "overlay"`.
- **Don't** use NoiseGrain as a permanent background — the per-frame reseed (`SEED = frame * 7919`) means the noise actually shifts every frame (true TV static). That's eye-tiring over more than a couple of seconds. Use as a 0.5–1.5s flash, not a 10s hold.

## Composition Recipes

**Brand intro behind a logo:**
```tsx
<AbsoluteFill>
  <AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" speed={1.2} />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <LogoSlam glyph="C" brand="CRUX" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Tech-vlog opener (particles + word effects on top):**
```tsx
<AbsoluteFill>
  <ParticleField count={120} color="#22d3ee" bg="#020617" />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <WaitZoomHook word="LAUNCH" />
  </AbsoluteFill>
</AbsoluteFill>
```

**VHS retro flash (noise grain as a 1-second flash):**
```tsx
<Sequence durationInFrames={30}>
  <NoiseGrain intensity={0.4} monochrome />
</Sequence>
<Sequence from={30} durationInFrames={120}>
  <RetroVhs name="CHANNEL 4" role="live" />
</Sequence>
```

**Calm branded backdrop (waves under everything):**
```tsx
<AbsoluteFill>
  <WavyLines color="#10b981" lines={9} />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <StoryTimeTitle text="story time" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Noise layered over a flat color (subtle texture):**
```tsx
<AbsoluteFill style={{ background: "#0a0a0a" }}>
  <NoiseGrain intensity={0.2} bg="transparent" />
</AbsoluteFill>
```

## Common Prop Overrides

```tsx
// Brand colors for AnimatedGradient (3rd color is base bg)
<AnimatedGradient colorA="#f97316" colorB="#fde047" colorC="#1a1410" speed={1} />

// ParticleField in white-on-dark for tech vibe
<ParticleField count={100} color="#22d3ee" bg="#000814" />

// WavyLines with more density
<WavyLines color="#a855f7" lines={11} bg="#1a1410" />

// NoiseGrain as a subtle texture layer (use mixBlendMode in parent)
<div style={{ mixBlendMode: "overlay" }}>
  <NoiseGrain intensity={0.2} bg="transparent" />
</div>
```

## Render Notes

- **Canvas:** 1920×1080 by default. All four scale fine to 1080×1920 — no fork needed (positions use percentages or SVG viewBox).
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid — legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- **Measured render times on a 14" M1 Pro (Remotion 4.0.x, --codec h264, 1920×1080):**
  - AnimatedGradient: ~34ms/frame (150f → 5.2s total). Largest output file (~2.5 MB / 5s) because of high color complexity.
  - ParticleField: ~22ms/frame.
  - NoiseGrain at `intensity=0.5`: ~37ms/frame. At `intensity=1` expect ~100ms/frame.
  - WavyLines: ~28ms/frame.
- For transparent overlay (e.g. NoiseGrain on top of real footage): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Loop seam warning:** ParticleField uses `((y0 - frame * speed * 0.1) % 110)` which loops cleanly only when `frame * speed * 0.1` reaches a multiple of 110. For seamless loops, set `durationInFrames` to a multiple of `1100 / speed`. Otherwise the loop point shows a discontinuity.

## Pairing with other skills

- **AnimatedGradient + LogoSlam** (`remotion-logos`) — mesh-gradient hero behind a brand intro
- **ParticleField + WaitZoomHook** (`remotion-hooks`) — tech backdrop for a punchy reveal
- **NoiseGrain + RetroVhs lower-third** (`remotion-lower-thirds`) — full VHS-era set
- **WavyLines + StoryTimeTitle** (`remotion-hooks`) — calm waves under a personal story
- **AnimatedGradient + StatCardGrid** (`remotion-stats`) — colorful data-reveal hero
