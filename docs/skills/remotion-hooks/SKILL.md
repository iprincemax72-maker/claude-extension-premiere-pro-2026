---
name: remotion-hooks
description: Six production-grade short-form video opener "hooks" for Remotion — Wait-Zoom, POV caption, Plot-Twist reveal, Story-Time title, Real-Talk caption, and Watch-This stamp. Each is multi-act motion design (anticipate → entrance → settle → idle → climax → aftermath), not a single spring. Use when the user asks for a "hook", "opener", "POV", "wait...", "plot twist", "story time", "real talk", or "attention grabber".
---

# Remotion Hooks (v2 — deep motion design)

Six short-form opener components calibrated for the first 60–90 frames of a vertical video — the window where the algorithm decides whether to keep your viewer.

These are **NOT one-shot springs**. Each component is choreographed across 5–6 acts:

| Act | What | Frames (typical) |
|-----|------|------------------|
| 1. Anticipate | Vignette tightens, color cools, subtle inward pull — builds tension before impact | 0–8 |
| 2. Entrance | The slam/spring. Overshoots, weighty. Chromatic aberration on impact frame. | 8–22 |
| 3. Settle | Post-overshoot oscillation decays | 22–24 |
| 4. Idle | Held but *alive* — multi-sine micro-tremor, slow breath, drift | 24–climax |
| 5. Climax | Optional punch / shock-ring / flash | varies |
| 6. Aftermath | Exponential glow decay, residual echo | climax+ |

This is what separates "made it" from "designed it." A static-after-entrance hook looks lifeless to the eye after ~10 frames. A hook with **idle tremor + breath** holds attention indefinitely.

## Quick Reference

- [Source](./references/hooks-source.tsx)
- [Catalog](./references/hooks-catalog.md)

## The Six Hooks

| Name | Best for | Climax effect |
|------|---------|---------------|
| **WaitZoomHook** | Urgent reveal openers | Zoom-punch on chosen word + shock ring + flash |
| **POVCaption** | TikTok skits, relatable scenarios | Per-word entrance variation + active-word glow |
| **PlotTwistReveal** | Mid-clip surprise, chapter break | Kerning entrance + scanline glitch + flash |
| **StoryTimeTitle** | Calm personal storytelling | Underline-draw + paper grain + drift |
| **RealTalkCaption** | Editorial pull-quote opener | Bar pulse + motion-blur slide-in |
| **WatchThisStamp** | Sticker callout | Dust puff + ink-bleed + arrow bounce |

## Anti-patterns

- **Don't** use multiple high-intensity hooks back-to-back. WaitZoom followed by PlotTwist is exhausting — viewers tune out. Pair one high-intensity hook with a calm body.
- **Don't** set `framesPerWord` < 6 on POVCaption. Reading speed has a floor. Below 6f/word the eye can't track.
- **Don't** turn off `withChromAb` on WaitZoom unless your background is colored — RGB split needs darkness to read.
- **Don't** put StoryTime over saturated video. It's a paper-card aesthetic — meant to fill the frame, not overlay.
- **Don't** stretch hooks past 90 frames. They're openers, not body content. If you need to fill more time, hold the body content underneath.

## Composition Recipes

**Cold-open + content reveal:**
```tsx
<Sequence durationInFrames={70}><WaitZoomHook /></Sequence>
<Sequence from={70}><YourContent /></Sequence>
```

**Plot-twist mid-clip:**
```tsx
<Sequence durationInFrames={120}><YourClipA /></Sequence>
<Sequence from={120} durationInFrames={80}>
  <PlotTwistReveal startFrame={0} punchFrame={36} />
</Sequence>
<Sequence from={200}><YourTwistContent /></Sequence>
```

**POV skit opener:**
```tsx
<Sequence durationInFrames={100}>
  <POVCaption sentence="you just realized your phone was recording" />
</Sequence>
<Sequence from={100}><Skit /></Sequence>
```

**Calm personal opener:**
```tsx
<Sequence durationInFrames={80}>
  <StoryTimeTitle text="story time" subhead="EPISODE FOUR" />
</Sequence>
```

## Common Prop Overrides

```tsx
// Brand-color WaitZoom
<WaitZoomHook punchColor="#7eb800" bg="#0a0a0a" />

// Faster POV (snappier read)
<POVCaption sentence="..." framesPerWord={9} />

// Restrained PlotTwist (no scanline glitch)
<PlotTwistReveal text="THE TRUTH" withScanlines={false} />

// StoryTime with paper card on a different palette
<StoryTimeTitle paperColor="#1a1410" inkColor="#f3eadb" />

// RealTalk without the opening quote glyph
<RealTalkCaption text="Listen." withMark={false} />

// WatchThis without the arrow (just the stamp)
<WatchThisStamp text="MUST SEE" arrow={false} />
```

## Render Notes

- **Vertical 1080×1920, 30fps** is the default short-form aspect. Hooks self-position with percentages so they also fit landscape.
- Render with `--mute` for silent visual overlays. (`--audio-codec=no-audio` is an invalid Remotion flag and will error — valid `--audio-codec` values are `pcm-16`, `aac`, `mp3`, `opus`.)
- For transparent overlay (ProRes 4444): `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points** worth knowing — these are the frames where a sound effect should land:
  - WaitZoom: slam at frame 8, punch at `punchFrame`
  - POVCaption: every `8 + i * framesPerWord` (per-word pop)
  - PlotTwist: kerning landing at frame 18, punch at `punchFrame`
  - StoryTime: underline finish at frame 22
  - RealTalk: bar draw at frame 14
  - WatchThis: stamp landing at frame 12

## Motion Utilities Embedded

The source file ships with shared utilities Claude can pull into other compositions:

```tsx
// Purpose-specific springs
motion.slam   = { damping: 9, stiffness: 240, mass: 0.85 }  // heavy text drop
motion.punch  = { damping: 14, stiffness: 320, mass: 0.5 }  // snappy, no overshoot
motion.pop    = { damping: 11, stiffness: 200, mass: 0.6 }  // bubble pop
motion.drift  = { damping: 22, stiffness: 80,  mass: 1.1 }  // calm fade
motion.settle = { damping: 16, stiffness: 150, mass: 0.8 }  // recovery

// Multi-sine micro-tremor for held elements
tremor(frame, amplitude=1, speed=0.18): number

// Exponential glow decay after impact
aftermathGlow(framesSincePunch, decay=30): number
```

Reuse these in compositions you build alongside hooks — keeps timing coherent across the whole short.
