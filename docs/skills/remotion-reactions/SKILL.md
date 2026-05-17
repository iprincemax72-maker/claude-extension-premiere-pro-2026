---
name: remotion-reactions
description: Eight emoji-driven reaction components for Remotion — mind-blown explosion, fire emoji burst, 100 emoji slam, heart-eyes, side-eye peek, crying-laugh loop, eyes peek, and sparkle particles. Use when the user asks for "mind blown", "fire burst", "100 slam", "heart eyes", "side eye", "crying laugh", "eyes peek", "sparkles", or any meme-reaction overlay.
---

# Remotion Reactions

Eight emoji-and-particle reaction overlays for short-form video. Each is a self-contained punchy moment that lands in <60 frames. Render-verified to mp4.

- [Source](./references/reactions-source.tsx)
- [Catalog](./references/reactions-catalog.md)

## The Eight Reactions

| Name | Vibe | Mechanic | Loops after entrance? |
|------|------|----------|-----------------------|
| **MindBlown** | 🤯 mind-blown moment | Big emoji + radiating explosion lines | Yes (gentle pulse) |
| **FireBurst** | 🔥 hype/spicy reaction | 6–8 fire emojis rising + drift | Yes (continuous rise) |
| **HundredSlam** | 💯 facts | Slams in from above with shake | Yes (gentle wobble) |
| **HeartEyes** | 😍 love reaction | Pops in with floating heart particles | Yes (hearts loop up) |
| **SideEye** | 👀 suspicious | Peeks in from corner with shifty motion | Yes (eye sway loop) |
| **CryingLaugh** | 😂 dying laughing | Bounces in corner with tear-drop loop | Yes (bounce + tears) |
| **EyesPeek** | 👀 looking | Eyes rise from bottom, peek, retreat | One-shot (with `holdFrames`) |
| **SparkleField** | ✨ magical | Sparkles pop around screen, slow fade | One-shot |

## When to Load

- "Mind blown / 🤯 / brain exploding" → **MindBlown**
- "Fire / 🔥 / spicy / hype" → **FireBurst**
- "100 / 💯 / facts / no cap" → **HundredSlam**
- "Heart eyes / love / 😍" → **HeartEyes**
- "Side eye / suspicious / 👀 sus" → **SideEye**
- "Crying laughing / 😂 / dying / hilarious" → **CryingLaugh**
- "Eyes / 👀 peek / curious" → **EyesPeek**
- "Sparkles / ✨ / magical / glitter" → **SparkleField**

## Golden Rules

1. All `useCurrentFrame()` + `interpolate()`/`spring()`. Deterministic.
2. **Most reactions LOOP after their entrance** so they hold beat for multiple seconds. Safe to hold a 90-frame Sequence on any of them except EyesPeek/SparkleField (one-shot).
3. Render with `--mute` + transparent bg for overlay use. (`--audio-codec=no-audio` is an invalid Remotion flag.)
4. **Pair with a sound effect** (Premiere side) for max impact — these are reaction beats, not silent visual texture.
5. **All eight accept `emoji` prop** — swap the default emoji for any single-char glyph. The motion stays the same.

## Anti-patterns

- **Don't** chain three or more different reactions back-to-back. Two reactions can read as a "double take" pattern; three+ is meme-stack overload.
- **Don't** use FireBurst with `count > 12`. Past 12 emojis the screen looks chaotic and slows the renderer noticeably (lots of independent transforms).
- **Don't** use HundredSlam in formal/editorial content. The shake + emoji aesthetic is inherently casual.
- **Don't** use SideEye with `from` direction that conflicts with the speaker's screen position. If your talking head is left-side of frame, use `from="right"` so the side-eye comes FROM the empty side (peek INTO the speaker). Reverse looks weird.
- **Don't** use EyesPeek for >150 frames. The peek-hold-retreat cycle completes by ~120 frames; longer durations show empty frame after.
- **Don't** layer SparkleField on top of a busy video. Sparkles need negative space to read — over a busy background they vanish into noise.
- **Don't** override `bg` to a solid color on these reactions. They're designed as overlays — solid bg defeats the purpose.

## Composition Recipes

**"Wait... what?!" moment (mind-blown + sound):**
```tsx
<Sequence from={beatFrame} durationInFrames={80}>
  <MindBlown />
</Sequence>
```

**Hype reveal (FireBurst over the reveal):**
```tsx
<AbsoluteFill>
  <YourRevealClip />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <FireBurst count={8} />
  </AbsoluteFill>
</AbsoluteFill>
```

**Facts stamp (100 emoji + caption):**
```tsx
<Sequence from={statementEnd} durationInFrames={70}>
  <HundredSlam />
</Sequence>
```

**Love moment (heart eyes over a couple/pet shot):**
```tsx
<AbsoluteFill>
  <YourLoveShot />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <HeartEyes />
  </AbsoluteFill>
</AbsoluteFill>
```

**Skeptical reaction (side eye from corner):**
```tsx
<Sequence from={suspiciousFrame} durationInFrames={90}>
  <SideEye from="right" />
</Sequence>
```

**Joke landing (crying laugh in corner):**
```tsx
<AbsoluteFill>
  <YourPunchlineClip />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <CryingLaugh corner="bottom-right" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Anticipation (eyes peek then content):**
```tsx
<Sequence durationInFrames={120}>
  <EyesPeek holdFrames={60} />
</Sequence>
<Sequence from={120}><YourReveal /></Sequence>
```

**Magical reveal (sparkle field):**
```tsx
<Sequence durationInFrames={80}>
  <SparkleField />
</Sequence>
```

## Common Prop Overrides

```tsx
// Custom emoji (swap any reaction's emoji)
<MindBlown emoji="🤯" />
<FireBurst emoji="🌶️" count={6} />
<HundredSlam emoji="💯" />

// Larger CryingLaugh in a different corner
<CryingLaugh corner="bottom-left" size={400} />

// SideEye from the other side
<SideEye from="left" />

// EyesPeek with a longer hold (peek-and-stare)
<EyesPeek holdFrames={45} />
```

## Render Notes

- **Vertical 1080×1920** is the canonical canvas. Reactions are calibrated for TikTok/Reels. In 1920×1080 landscape, the emoji size and motion arc still work but feel undersized — bump `size` prop by ~30%.
- Render with `--mute`.
- For overlay (the standard use case): `bg="transparent"` (default on most) and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points (these REALLY need SFX to land):**
  - MindBlown: explosion at ~10f → "boom" SFX with reverb
  - FireBurst: ignition at ~6f → "fire whoosh"
  - HundredSlam: lands ~14f → "stamp + reverb" or "MLG horn"
  - HeartEyes: pop at ~10f → soft "magical sparkle" + sustained pad
  - SideEye: peek-in at ~12f → "sus" musical sting (descending)
  - CryingLaugh: lands ~10f → "laugh track" or "vine boom"
  - EyesPeek: rises ~14f → "creak" or "tip-toe" SFX
  - SparkleField: first pop ~8f → "magic sparkle" cluster

## Pairing with other skills

- **MindBlown + GlitchText** (`remotion-text-presets`) — brain explodes, "WAIT WHAT" text glitches in
- **FireBurst + WordPopCaption** (`remotion-text-presets`) — fire burst + per-word "THIS / IS / FIRE" caption
- **HundredSlam + StampImpact** (`remotion-text-presets`) — 💯 + "FACTS" stamp
- **HeartEyes + LyricDrop** (`remotion-music-lyrics`) — love moment with sappy lyric
- **CryingLaugh + ToastPopup** (`remotion-frames`) — joke lands, mock notification from "your dignity"
- **SparkleField + BrandReveal** (`remotion-stingers`) — magical channel intro
- **EyesPeek → PlotTwistReveal** (`remotion-hooks`) — anticipation then the actual reveal
