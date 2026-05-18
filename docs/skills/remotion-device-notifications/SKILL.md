---
name: remotion-device-notifications
description: Seven device and notification overlay components for Remotion — StickyNote, SpeechBubble, ThoughtBubble, TapeSticker, CameraFlash, RecordingDot, and BatteryLow. Use when the user asks for "sticky note", "speech bubble", "thought bubble", "tape sticker", "camera flash", "REC indicator", "recording dot", or "low battery" overlay.
---

# Remotion Device & Notifications

Seven small device / sticker / notification overlays for video editing. Render-verified to mp4.

- [Source](./references/device-notifications-source.tsx)

## The Seven Components

| Name | Use | Animation | Duration sweet spot |
|------|-----|-----------|---------------------|
| **StickyNote** | Yellow note slams down with handwritten text | Slam-in with tilt + settle wobble | 60–90 frames |
| **SpeechBubble** | Comic-style bubble pops in pointing at thing | Pop scale + tail anchor | 60–90 frames |
| **ThoughtBubble** | Cloud-shape rising with trailing dots | Dots stagger up, cloud lands | 80–120 frames |
| **TapeSticker** | Piece-of-tape sticker landing at an angle | Drops in with rotation | 60–90 frames |
| **CameraFlash** | Full-frame white flash (`flashFrames` peak, decay after) | 1 bright frame, exponential decay | 8–30 frames |
| **RecordingDot** | Pulsing red REC dot in corner | Indefinite pulse + optional timer count-up | Indefinite (designed to loop) |
| **BatteryLow** | Battery warning chip ticking red | Slow tick-pulse, % count visible | 60–120 frames |

## When to Load

- "Sticky note / post-it / handwritten note" → **StickyNote**
- "Speech bubble / comic bubble / dialogue balloon" → **SpeechBubble**
- "Thought bubble / cloud thought" → **ThoughtBubble**
- "Tape / sticker / masking tape" → **TapeSticker**
- "Camera flash / photo flash / white flash" → **CameraFlash**
- "Recording / REC dot / live recording / live indicator" → **RecordingDot**
- "Battery low / power warning" → **BatteryLow**

## Golden rules

1. All take `startFrame` for offset timing — compose with `<Sequence from={N}>`.
2. **Default `bg` is `"transparent"`** on all seven — they're designed as overlays.
3. Animations are `useCurrentFrame()` driven.
4. **CameraFlash is a transition device, not a hold.** Use it between two clips (e.g. before a reveal); don't hold it for more than ~30 frames.
5. **RecordingDot has a built-in elapsed timer** (`withTimer={true}` default) that counts up from frame 0. Set `withTimer={false}` to disable.

## Anti-patterns

- **Don't** stack SpeechBubble + ThoughtBubble simultaneously. Two competing dialogue/thought bubbles read as confusion.
- **Don't** use StickyNote for long text (>15 chars). The handwritten font + small note size handles 1–2 short words; longer text overruns the note edges.
- **Don't** use CameraFlash without a clip cut on/after it. The flash IS the transition; if it fades to nothing, it feels like a glitch. Pair with a hard cut at flash peak.
- **Don't** put TapeSticker labels in lowercase. The tape aesthetic is uppercase-coded ("TODO", "DO NOT FORGET", "URGENT"); lowercase ("todo") looks weak.
- **Don't** set BatteryLow `percent` above ~15. The component's tick-pulse animation is "warning low" semantics — at 50% or higher the visual doesn't match what battery level actually means.
- **Don't** use RecordingDot with `withTimer={true}` for >5 minutes of video — the timer counts up using `frame / fps`, which becomes visually crowded at long times (`05:23:14`).
- **Don't** chain ThoughtBubble + SpeechBubble for the same character. The thought is supposed to be unspoken — followed by speech feels like the character heard their own thought.

## Composition Recipes

**"Note to self" moment:**
```tsx
<Sequence from={beatFrame} durationInFrames={75}>
  <StickyNote text="ship it" tiltDeg={6} />
</Sequence>
```

**Character reaction (speech bubble):**
```tsx
<AbsoluteFill>
  <YourTalkingHead />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <SpeechBubble text="wait, what?" tailDirection="right" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Character thinking (cloud bubble + dots trail):**
```tsx
<Sequence from={pauseFrame} durationInFrames={100}>
  <ThoughtBubble text="hmm..." />
</Sequence>
```

**Stuck-on label (tape sticker):**
```tsx
<AbsoluteFill>
  <YourShot />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <TapeSticker text="WIP" color="#ffe89a" tiltDeg={-8} />
  </AbsoluteFill>
</AbsoluteFill>
```

**Hard cut transition (camera flash between clips):**
```tsx
<Sequence durationInFrames={60}><ClipA /></Sequence>
<Sequence from={60} durationInFrames={8}>
  <CameraFlash flashFrames={4} />
</Sequence>
<Sequence from={68}><ClipB /></Sequence>
```

**"Recording" overlay during a livestream-style clip:**
```tsx
<AbsoluteFill>
  <YourLivestreamFootage />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <RecordingDot label="LIVE" corner="top-right" withTimer={true} />
  </AbsoluteFill>
</AbsoluteFill>
```

**Phone-tension moment (battery low warning before action):**
```tsx
<Sequence from={tensionFrame} durationInFrames={80}>
  <BatteryLow percent={4} label="Battery Critical" />
</Sequence>
```

## Common Prop Overrides

```tsx
// Pink sticky note
<StickyNote text="!!!" color="#ffb3d9" tiltDeg={-4} />

// Speech bubble pointing right
<SpeechBubble text="yo" tailDirection="right" />

// Tape sticker with brand color
<TapeSticker text="URGENT" color="#ff7a4d" tiltDeg={12} />

// Longer camera flash
<CameraFlash flashFrames={6} />

// REC dot without timer
<RecordingDot label="REC" corner="top-left" withTimer={false} />

// BatteryLow at 2%
<BatteryLow percent={2} label="Battery Dead" />
```

## Render Notes

- **Vertical 1080×1920 default canvas.** All seven work in landscape too — RecordingDot/BatteryLow/CameraFlash are agnostic; StickyNote/SpeechBubble/ThoughtBubble/TapeSticker have absolute positions tuned for portrait.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- All seven default to `bg="transparent"` — render with `--codec prores --prores-profile 4444 --mute` for alpha overlay over real footage.
- **Audio cue points:**
  - StickyNote: slam lands ~14f → paper-thump SFX
  - SpeechBubble: pop lands ~10f → comic-book "POP" SFX
  - ThoughtBubble: cloud lands ~18f after dots → soft "bing" / chime
  - TapeSticker: lands ~12f → tape-rip SFX
  - CameraFlash: peak at `startFrame + 1` → camera-shutter SFX with flash sting
  - RecordingDot: no entrance SFX (loops) — pair with a sustained "recording" hum
  - BatteryLow: tick pulse ~14-frame period (`|sin(f * 0.22)|` gives π/0.22 ≈ 14f) → low-battery beep on each tick

## Pairing with other skills

- **StickyNote + CodeSnippet** (`remotion-tech`) — note pinned over code as a teaching aside
- **SpeechBubble + iMessageBubble** (`remotion-social-ui`) — character speaks + iMessage notification arrives
- **ThoughtBubble + LyricDrop** (`remotion-music-lyrics`) — character thinks while song lyric drops
- **TapeSticker + PolaroidFrame** (`remotion-frames`) — taped-up polaroid memory aesthetic
- **CameraFlash + PlotTwistReveal** (`remotion-hooks`) — flash transitions into the twist
- **RecordingDot + GlitchLowerThird** (`remotion-lower-thirds`) — damaged-feed broadcast vibe with REC indicator
- **BatteryLow + CryingLaugh** (`remotion-reactions`) — tension moment with comedy reaction
