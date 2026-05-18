---
name: remotion-music-lyrics
description: Six music and lyric-driven components for Remotion — KaraokeLine with sweep-highlight per word, LyricDrop centered bass-thump scale with bass-glow lag, BeatHitPop pulsing word with shock ring per beat, DropIncoming countdown with cleanly-flashing transitions, NowPlaying Apple-style music card with scrubber dot + beat-pulse art, and SoundWaveBars equalizer with peak indicators. Use when the user asks for "karaoke", "lyric drop", "lyric caption", "beat hit", "drop incoming", "now playing", "music card", "equalizer", or "sound waves".
---

# Remotion Music & Lyrics

Six components for music videos, lyric drops, podcast intros, or beat-driven content. **v2 with proper beat-driven motion** — see source header comments for what each upgrade adds over v1.

- [Source](./references/music-lyrics-source.tsx) — full implementations

## The Six Components

| Name | Use | v2 motion upgrade |
|------|-----|-------------------|
| **KaraokeLine** | Word-by-word highlight as the line plays | Sweep highlight (color gradient wipes across) instead of instant color flip |
| **LyricDrop** | Single lyric centered with bass-thump scale loop | Bass glow LAGS the scale by a frame (real bass shadow physics) |
| **BeatHitPop** | Word that pulses on each beat | Shock ring + color flash per beat |
| **DropIncoming** | 3-2-1 countdown with flash reveal | Each number has zoom personality, flash transitions clean between |
| **NowPlaying** | Apple-style music card with progress bar | Progress bar has scrubber-dot at leading edge; cover art pulses to beat |
| **SoundWaveBars** | 5-bar equalizer that reacts deterministically | Peak indicators that hold briefly at top |

## When to Load

- "Karaoke / lyric line / sung text" → **KaraokeLine**
- "Lyric drop / centered lyric / song quote" → **LyricDrop**
- "Beat hit / beat pop / BPM word" → **BeatHitPop**
- "Drop incoming / 3 2 1 / countdown reveal" → **DropIncoming**
- "Now playing / music card / track info" → **NowPlaying**
- "Sound wave / equalizer / EQ bars / audio bars" → **SoundWaveBars**

## Golden rules

1. **BPM-aware components** (`LyricDrop`, `BeatHitPop`, `NowPlaying`) take a `bpm` prop — phase math drives the pulse. Match the prop to the actual track tempo for clean sync.
2. **All animations are frame-deterministic** — `useCurrentFrame()` + `interpolate()` / `spring()`. No `useState`.
3. **KaraokeLine reads timing from `framesPerWord`** — default 14f/word ≈ 466ms/word at 30fps. For actual lyric sync, override per-line.
4. **Vertical 1080×1920 canvas is the default** for these (TikTok/Reels aspect). NowPlaying is the exception — it's designed for 1920×1080 landscape.

## Anti-patterns

- **Don't** use KaraokeLine for >12-word lines. The line is one row; long lines wrap unpredictably. For long lyrics, split into two `<KaraokeLine>` sequences instead of one wrapping row.
- **Don't** use BeatHitPop with `beats < 2`. The pulse needs at least 2 beats to read as a beat-driven effect — a single pulse just looks like a generic pop.
- **Don't** set BPM higher than ~180 on LyricDrop. Above 180, the scale-loop period drops below 0.33s — the eye reads it as flicker, not bass.
- **Don't** put a NowPlaying card in vertical 1080×1920. The 320×320 cover art + meta row + progress bar are tuned for landscape width. In vertical they get cropped or overlap.
- **Don't** mix DropIncoming with another count-up component (e.g. CounterCountUp). Two timers competing visually is confusing.
- **Don't** override SoundWaveBars `count` above ~12. Each bar uses `Math.abs(Math.sin(frame * speed * (0.7 + i * 0.13) + i * 1.5))` — the per-bar speed multiplier (`0.7 + i * 0.13`) diverges meaningfully across the first ~12 bars. Past 12 bars, the higher-i bars cycle so fast the eye reads them as flicker rather than organic motion.

## Composition Recipes

**Karaoke verse (4 lines, BPM-matched):**
```tsx
<Sequence from={0}   durationInFrames={80}><KaraokeLine words={["sing", "along", "with", "me"]} framesPerWord={14} /></Sequence>
<Sequence from={80}  durationInFrames={80}><KaraokeLine words={["one", "more", "time", "tonight"]} framesPerWord={14} /></Sequence>
<Sequence from={160} durationInFrames={80}><KaraokeLine words={["dance", "the", "whole", "way", "home"]} framesPerWord={14} /></Sequence>
<Sequence from={240} durationInFrames={80}><KaraokeLine words={["one", "last", "lap"]} framesPerWord={14} /></Sequence>
```

**Lyric drop on the chorus (120 BPM):**
```tsx
<Sequence durationInFrames={90}>
  <LyricDrop lyric="dance the whole way home" bpm={120} color="#ff7a4d" />
</Sequence>
```

**Pre-drop countdown (BPM-driven):**
```tsx
<Sequence from={preDropFrame} durationInFrames={120}>
  <DropIncoming word="DROP" framesPerNumber={30} />
</Sequence>
<Sequence from={preDropFrame + 120}><YourDrop /></Sequence>
```

**Beat-pop hashtag on chorus:**
```tsx
<Sequence from={chorusFrame} durationInFrames={120}>
  <BeatHitPop word="#VIBE" beats={6} bpm={120} color="#ff2e63" />
</Sequence>
```

**Music-podcast intro (NowPlaying card in landscape):**
```tsx
<Composition
  id="music-intro"
  width={1920}
  height={1080}
  durationInFrames={150}
  fps={30}
  component={NowPlaying as any}
  defaultProps={{
    track: "Late Night Drive",
    artist: "Vera Dixie",
    coverUrl: "https://example.com/cover.jpg",
    durationSec: 240,
    startSec: 0,
    bpm: 95,
  }}
/>
```

**Podcast/music overlay during talking (bars at bottom-right):**
```tsx
<AbsoluteFill>
  <YourTalkingHead />
  <div style={{ position: "absolute", bottom: 80, right: 80, width: 220, height: 80 }}>
    {/* size is the pixel-height of the bar container (default 220).
        For an 80px-tall corner spot, drop size to ~80. */}
    <SoundWaveBars count={5} color="#22d3ee" size={80} speed={1.5} />
  </div>
</AbsoluteFill>
```

## Common Prop Overrides

```tsx
// KaraokeLine in brand color
<KaraokeLine words={["custom", "color", "vibe"]} highlightColor="#ff7a4d" />

// LyricDrop at slower tempo for a ballad
<LyricDrop lyric="hold me closer" bpm={75} />

// BeatHitPop matching a 140-BPM dance track
<BeatHitPop word="LET'S GO" beats={8} bpm={140} />

// DropIncoming with a custom drop word
<DropIncoming word="LAUNCH" framesPerNumber={28} />

// NowPlaying with no album art (uses default placeholder block)
<NowPlaying track="Untitled #4" artist="lo-fi nights" bpm={70} />

// SoundWaveBars with brand color and slower wave
// (size is in pixels — default 220, use 300+ for larger displays)
<SoundWaveBars count={8} color="#ec4899" size={280} speed={0.8} />
```

## Render Notes

- **Default canvas:** 1080×1920 vertical (TikTok/Reels) for 5 of the 6. NowPlaying is 1920×1080 landscape.
- Render with `--mute` for visual overlays (correct Remotion flag; `--audio-codec=no-audio` is invalid). For an actual music video, add `<Audio src={...} />` from `remotion` and DROP the `--mute` flag.
- **BPM-to-frame math:**
  - At 30fps, one beat at BPM B lasts `30 / (B/60) = 1800/B` frames
  - 120 BPM → 15 frames per beat
  - 140 BPM → 12.86 frames per beat
  - 90 BPM → 20 frames per beat
- **Audio cue points:** these components are designed to react to the music, not stamp SFX. Sync your Premiere edit to the music itself, then drop these in on the beats Remotion is already locking to.

## Pairing with other skills

- **KaraokeLine + ParticleField** (`remotion-backgrounds`) — karaoke verse over a dark tech backdrop
- **LyricDrop + AnimatedGradient** (`remotion-backgrounds`) — lyric drop over a mesh-color hero
- **BeatHitPop + GlitchText** (`remotion-text-presets`) — beat-pop hashtag with glitch-burst openings on each pulse
- **DropIncoming → BrandReveal** (`remotion-stingers`) — countdown into channel reveal
- **NowPlaying + CornerWatermark** (`remotion-social-ui`) — music card with brand mark in corner
- **SoundWaveBars + RetroVhs lower-third** (`remotion-lower-thirds`) — vintage radio-broadcast set
