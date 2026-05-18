---
name: remotion-text-presets
description: Eleven production-tested text animation presets for Remotion — drop-in title-moment components for video editors. Use when the user asks for "title slam", "kinetic text", "TikTok caption", "typewriter", "highlight underline", "counter / count-up", "glitch text", "neon glow", "3d extruded text", "stamp impact", "karaoke lyric", or "tilted text" animations.
---

# Remotion Text Presets

**Eleven** production-tested text animation components, designed as drop-in "title moment" pieces for video editors. Each was rendered against a high-contrast harness and frame-checked across the animation duration.

## Quick Reference

- [Source](./references/text-presets-source.tsx)
- [Catalog](./references/text-presets-catalog.md) — full source + customization tips

## The Eleven Presets

| Name | Best For | Key Mechanic |
|------|----------|--------------|
| **TiltedSlam** | YouTube intros, brand titles | Spring slam in + tilt + settle wobble |
| **WordPopCaption** | TikTok captions, reels | Per-word spring stagger + active-word highlight |
| **LetterCascade** | Big title cards | Per-letter spring drop from above |
| **TypewriterPro** | Code reveals, story openers | Char-by-char slice + blinking cursor + punctuation pause |
| **MarkerUnderline** | Emphasis, callouts | Text fade + highlighter line draws beneath |
| **CounterCountUp** | Stats, money, %, big numbers | Eased numeric ramp + comma grouping + final-value punch |
| **GlitchText** | Damaged-feed openers, error states | RGB-split + jitter, settle factor decays to 0 by frame 30; residual ~5px RGB split persists afterward (intentional, sells the "damaged feed" aesthetic) |
| **NeonGlow** | Neon-sign aesthetic, "LIVE" badges | Layered text-shadow glow + soft pulse |
| **Extrude3D** | Bold logo wordmarks | Z-stacked shadow copies for depth |
| **StampImpact** | "APPROVED" / "REJECTED" / "SOLD OUT" | Slam-in with rotation overshoot + dust-puff vibe |
| **KaraokeLyric** | Music videos, lyric reveals | Per-word active highlight with sliding playhead |

## When to Load

- User asks for a "title", "intro", "stinger", "kinetic text", "caption" → load [text-presets-catalog.md](./references/text-presets-catalog.md), pick the preset that fits the energy, copy the component into a fresh composition.
- Trigger-keyword routing:
  - "tilted text / slam title" → **TiltedSlam**
  - "TikTok caption / word by word" → **WordPopCaption**
  - "letter by letter / cascade / drop" → **LetterCascade**
  - "typewriter / typing / code reveal" → **TypewriterPro**
  - "highlight / underline / marker" → **MarkerUnderline**
  - "counter / count up / animated number / stat" → **CounterCountUp**
  - "glitch / broken text / RGB split" → **GlitchText**
  - "neon / glow / sign / LIVE badge" → **NeonGlow**
  - "3D / extruded / depth title" → **Extrude3D**
  - "stamp / APPROVED / REJECTED / SOLD OUT" → **StampImpact**
  - "karaoke / lyric reveal / sing along" → **KaraokeLyric**

## Golden Rules

1. **All animation is `useCurrentFrame()` + `interpolate()`/`spring()`** — no CSS transitions, no useState, no `setTimeout`.
2. **TypewriterPro MUST use string slicing**, never per-char opacity. (See `remotion-best-practices/rules/text-animations.md`.)
3. **Use `fontVariantNumeric: "tabular-nums"`** on CounterCountUp so digits don't jump width as they animate.
4. **Use `letterSpacing: "-0.03em"` or `"-0.04em"`** on big bold uppercase titles — looks tighter and more designed.
5. **Pair with `transparent` bg** when the preset will overlay video (set `bg="transparent"` prop).

## Anti-patterns

- **Don't** use TiltedSlam for text >12 chars. The slam + tilt + wobble is calibrated for 1–2 word titles. Long phrases lose the impact and the tilt makes long text hard to read.
- **Don't** use WordPopCaption with `framesPerWord < 6`. The eye can't track word-by-word reveals faster than ~5 frames per word (200ms). Below 6 it feels glitched.
- **Don't** use GlitchText for more than ~30 frames. The settle factor (`Math.max(0, 1 - frame / 30)`) decays to 0 by frame 30, BUT a residual ~5px RGB split persists indefinitely — it's the "post-damage steady state" effect. Either: (a) cut at frame 30 for a clean dies-down feel, or (b) hold longer if you want the persistent-damaged-feed look (the residual is intentional, not a bug).
- **Don't** layer GlitchText + NeonGlow simultaneously. Glitch's RGB split fights the neon glow halo, both effects cancel.
- **Don't** use Extrude3D with a transparent bg over real footage. The Z-stacked shadow copies bleed into the underlying frame and the depth illusion collapses. Use it on solid bg only.
- **Don't** use StampImpact for more than one stamp per scene. Two stamps competing visually feels like a meme template, not editing.
- **Don't** use KaraokeLyric without time-coding the words to actual audio. The default `framesPerWord` gives evenly-spaced highlights — if you want real karaoke, you need to pass per-word frame timings (fork the source).

## Composition Recipes

**YouTube intro with TiltedSlam (set against an animated gradient):**
```tsx
<Sequence durationInFrames={75}>
  <AbsoluteFill>
    <AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" />
    <AbsoluteFill style={{ zIndex: 1 }}>
      <TiltedSlam text="SLAM" bg="transparent" />
    </AbsoluteFill>
  </AbsoluteFill>
</Sequence>
```

**TikTok caption cascade (3 lines, each pop-captioned in turn):**
```tsx
<Sequence from={0}   durationInFrames={75}><WordPopCaption words={["wait", "for", "it"]} /></Sequence>
<Sequence from={75}  durationInFrames={75}><WordPopCaption words={["this", "is", "wild"]} /></Sequence>
<Sequence from={150} durationInFrames={90}><WordPopCaption words={["okay", "bye"]} /></Sequence>
```

**Code-reveal opener:**
```tsx
<Sequence durationInFrames={150}>
  <TypewriterPro text="// run this script" />
</Sequence>
```

**Stats moment with CounterCountUp + Marker:**
```tsx
<Sequence durationInFrames={90}>
  <CounterCountUp target={184000} prefix="$" />
</Sequence>
<Sequence from={90} durationInFrames={60}>
  <MarkerUnderline text="in revenue, last year" />
</Sequence>
```

**Damaged-feed transition (GlitchText as a 25-frame burst):**
```tsx
<Sequence durationInFrames={25}>
  <GlitchText text="ERROR" />
</Sequence>
<Sequence from={25}><RetroVhs name="Channel 4" role="live" /></Sequence>
```

**Live-broadcast intro with NeonGlow:**
```tsx
<Sequence durationInFrames={90}>
  <NeonGlow text="LIVE" neonColor="#22d3ee" />
</Sequence>
```

**Approved stamp on a deal:**
```tsx
<Sequence from={contentFrame} durationInFrames={75}>
  <StampImpact text="APPROVED" color="#16a34a" />
</Sequence>
```

## Common Prop Overrides

```tsx
// TiltedSlam in brand color
<TiltedSlam text="CRUX" color="#ff7a4d" />

// WordPopCaption faster (9 frames/word — snappier read)
<WordPopCaption words={["this", "is", "fast"]} framesPerWord={9} />

// TypewriterPro for code (slower pace — note: prop is charsPerSecond, NOT framesPerChar)
// Default is 28 cps; drop to ~14 for a slower, more deliberate reveal.
<TypewriterPro text="const x = 42;" charsPerSecond={14} />

// CounterCountUp with K-suffix and slower ramp
<CounterCountUp target={184} suffix="K" durationFrames={60} />

// NeonGlow in hot pink
<NeonGlow text="OPEN" neonColor="#ff2e63" />

// Extrude3D with custom depth + shadow color
<Extrude3D text="BOLD" depth={18} extrudeColor="#7c3aed" />
```

## Tested Defaults

Each preset has sensible defaults that produce a usable result with just one required prop (the text/words/target). All visual params (color, fontSize, bg, timings) are optional with battle-tested defaults — only override when the brand/composition demands it.

## Render Notes

- **1920×1080, 30fps** canonical. All 11 presets work in 1080×1920 vertical too — but TiltedSlam / LetterCascade / NeonGlow use absolute-pixel font sizes; for vertical, drop the default `fontSize` by ~25%.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid — legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- For transparent overlay (e.g. WordPopCaption over real footage): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - TiltedSlam: slam at frame ~10 → "THWACK" SFX on frame 8
  - WordPopCaption: each word at `8 + i * framesPerWord` → tick per word
  - LetterCascade: letters land at `i * framesPerLetter + ~12` (default `framesPerLetter=3` → letter 0 at frame 12, letter 5 at frame 27) → keyboard-tap SFX per letter
  - TypewriterPro: `charsPerSecond` (default 28 cps ≈ 1 char per ~1.07 frames at 30fps) → mechanical keystroke per char; the component also auto-pauses 6 frames at `.,?!:` so the SFX should match the visible cadence, not a metronome
  - CounterCountUp: ramp completes at `durationFrames` (default 45) → "ding" at completion
  - GlitchText: peak at frame 0, decay by 18 → static burst SFX
  - NeonGlow: lights up at frame 0, pulses indefinitely → "neon hum" sustained
  - Extrude3D: lands ~12 → bass thud
  - StampImpact: stamp at ~12 → wooden stamp SFX with reverb
  - KaraokeLyric: each word at `i * framesPerWord` → music beat per word

## Pairing with other skills

- **TiltedSlam + AnimatedGradient** (`remotion-backgrounds`) — punchy intro
- **WordPopCaption + iMessageBubble** (`remotion-social-ui`) — chat-bubble text reveal
- **TypewriterPro + CornerWatermark** (`remotion-social-ui`) — coding tutorial vibe
- **CounterCountUp + ProgressRing** (`remotion-stats`) — counter pops + ring spins simultaneously
- **GlitchText → RetroVhs lower-third** (`remotion-lower-thirds`) — damaged-feed transition
- **StampImpact + LikeBurst** (`remotion-social-ui`) — APPROVED stamp + hearts fly out
