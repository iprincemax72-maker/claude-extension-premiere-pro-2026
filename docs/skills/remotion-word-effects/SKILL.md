---
name: remotion-word-effects
description: Seven word-manipulation effect components for Remotion — WordSwap cycles through synonyms, StrikethroughSwap crosses out one word and reveals another, HighlightedWord with yellow marker, CensorBar with bleep overlay, SpinningLetters, FallingLetters, and SparkleTitle. Use when the user asks for "word swap", "cycling words", "strikethrough", "highlight word", "censor bar", "bleep", "spinning letters", "falling letters", "sparkle title", or "letter animation".
---

# Remotion Word Effects

Seven text-effect components that manipulate words/letters with frame-perfect motion. Render-verified to mp4.

- [Source](./references/word-effects-source.tsx)

## The Seven Effects

| Name | Use | Animation |
|------|-----|-----------|
| **WordSwap** | One position cycles through N words with fast pop swap | Each word in for `framesPerWord`, pops in/out |
| **StrikethroughSwap** | Word gets struck through, replacement fades in | Strike draws, original fades, replacement reveals |
| **HighlightedWord** | One word in a sentence gets a yellow marker slide-in | Marker line wipes across the target word |
| **CensorBar** | Black censor bar slides over a word with "BLEEP" caption | Bar slides in, holds, "BLEEP" caption pops |
| **SpinningLetters** | Each letter spins into place one by one | 360° spin + stagger per letter |
| **FallingLetters** | Letters fall into position with bounce settle | Spring drop from above, per-letter stagger |
| **SparkleTitle** | Title with sparkles pinging around each letter | Title fades in, sparkles ping randomly around |

## When to Load

- "Word swap / cycling word / change word" → **WordSwap**
- "Strikethrough / strike out / cross out word" → **StrikethroughSwap**
- "Highlight word / marker / yellow highlight" → **HighlightedWord**
- "Censor / censor bar / bleep / black bar" → **CensorBar**
- "Spinning letters / letter spin / typography spin" → **SpinningLetters**
- "Falling letters / letters drop / cascade" → **FallingLetters**
- "Sparkle / sparkle title / magic letters" → **SparkleTitle**

## Golden rules

1. All animations are `useCurrentFrame()` driven, no `useState`.
2. **WordSwap and StrikethroughSwap** are about swapping content; the others animate revealing a single fixed text.
3. SpinningLetters and FallingLetters use per-letter stagger — long text means a long animation. Plan duration accordingly.
4. **Default vertical 1080×1920 canvas** for the per-letter / per-word effects. They work landscape but feel undersized — bump `fontSize` by ~25% if going landscape.

## Anti-patterns

- **Don't** use WordSwap with `framesPerWord < 12`. Below 12, the eye reads it as flicker, not swap. 14–20 is the sweet spot.
- **Don't** use StrikethroughSwap on long words (>8 chars). The strike line takes longer to draw than the eye expects — the result is the strike still drawing when the replacement fades in, which looks broken.
- **Don't** use HighlightedWord on a one-word sentence. The highlight is calibrated to draw attention to ONE word in a phrase — if it's the only word, it just looks like a generic underline.
- **Don't** use CensorBar without ACTUAL profanity / sensitive content. The visual is meme-coded — using it for non-censored text reads as ironic and confuses viewers.
- **Don't** chain SpinningLetters + FallingLetters in the same shot. Both have per-letter stagger, both compete visually. Pick one.
- **Don't** use SparkleTitle for text >10 chars. The sparkle pinging math gets crowded past 10 letters — sparkles overlap and the magic effect collapses.

## Composition Recipes

**Cycling word ("smart / fast / new / SHIP IT"):**
```tsx
<Sequence durationInFrames={90}>
  <WordSwap words={["smart", "fast", "new", "SHIP IT"]} framesPerWord={20} />
</Sequence>
```

**Replace / correct moment:**
```tsx
<Sequence durationInFrames={75}>
  <StrikethroughSwap oldWord="impossible" newWord="possible" />
</Sequence>
```

**Highlight emphasis in a sentence:**
```tsx
<Sequence durationInFrames={75}>
  {/* highlightIndex is the WORD INDEX in the sentence (0-based).
      "the only thing that matters is execution" has words at
      indices 0-6; "execution" is index 6. */}
  <HighlightedWord sentence="the only thing that matters is execution" highlightIndex={6} />
</Sequence>
```

**Bleeped word for a podcast clip:**
```tsx
<Sequence from={swearFrame} durationInFrames={50}>
  <CensorBar word="badword" caption="BLEEP" />
</Sequence>
```

**Spinning title intro:**
```tsx
<Sequence durationInFrames={80}>
  <SpinningLetters text="HYPE" />
</Sequence>
```

**Cascading title reveal:**
```tsx
<Sequence durationInFrames={80}>
  <FallingLetters text="DROP" />
</Sequence>
```

**Magical title (sparkles):**
```tsx
<Sequence durationInFrames={90}>
  <SparkleTitle text="MAGIC" />
</Sequence>
```

## Common Prop Overrides

```tsx
// WordSwap slower (more reading time)
<WordSwap words={["a", "b", "c"]} framesPerWord={28} />

// WordSwap with prefix + suffix — the cycling word sits inside a fixed sentence:
//   "Made for {prefix}{word}{suffix}"
<WordSwap
  words={["creators", "founders", "designers"]}
  prefix="Made for "
  suffix=" who ship daily."
/>

// HighlightedWord brand color (uses highlightColor + highlightIndex)
<HighlightedWord sentence="..." highlightIndex={2} highlightColor="#ff7a4d" />

// Censor with custom caption
<CensorBar word="censored" caption="REDACTED" />

// SparkleTitle in brand color
<SparkleTitle text="MAGIC" color="#7c3aed" />
```

## Render Notes

- **Vertical 1080×1920 default.** For landscape, bump `fontSize` by ~25%.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For overlay (word effect on top of footage): default `bg` is already transparent on most — render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - WordSwap: each swap at `i * framesPerWord` → tick / soft pop per swap
  - StrikethroughSwap: strike completes ~14f, replacement appears ~22f → pen-stroke + reveal chime
  - HighlightedWord: marker wipes 0–22f → marker-stroke SFX
  - CensorBar: bar lands ~10f, BLEEP at ~14f → "BLEEP" SFX (the actual bleep tone)
  - SpinningLetters: each letter lands at `i * stagger + 14` → typewriter tick per letter
  - FallingLetters: letters land at `i * stagger + 18` → key-thud per letter
  - SparkleTitle: title appears ~10f, sparkle pings random → magic-sparkle cluster

## Pairing with other skills

- **WordSwap + AnimatedGradient** (`remotion-backgrounds`) — cycling word hero on mesh-gradient
- **StrikethroughSwap + PullQuote** (`remotion-callouts`) — "not X but Y" editorial moment
- **HighlightedWord + CodeSnippet** (`remotion-tech`) — highlight a function name then show the code
- **CensorBar + CryingLaugh** (`remotion-reactions`) — censored moment + comedy reaction
- **SpinningLetters + DropIncoming** (`remotion-music-lyrics`) — countdown ends with title spinning in
- **FallingLetters + LogoSlam** (`remotion-logos`) — letters drop in to form the logo wordmark
- **SparkleTitle + BrandReveal** (`remotion-stingers`) — magical channel-intro pairing
