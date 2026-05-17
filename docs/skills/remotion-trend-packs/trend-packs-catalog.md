# Trend Packs Catalog

Seven complete title-moment looks. Each has a locked palette + font + motion.

## 1. BratTitle — Charli XCX lime
```tsx
<BratTitle text="apple" />        /* heavy black Arial, lime on black */
```
Lowercase forced. Kerning closes from wide to tight over 14 frames, then breathes with a 1° wobble. Single word works best.

**Palette**: lime `#8acf00` on black.
**Use**: opinion videos, summer aesthetics, attention statements.

## 2. CoquetteIntro — soft pink
```tsx
<CoquetteIntro
  text="darling"
  accent="#ff7faf"      // sparkle + ribbon
  bg="#f8e7e0"
  ink="#d0577d"
/>
```
Italic serif on warm cream, four sparkles drift around the text, ribbon flourish underneath.

**Palette**: blush + cream + rose-pink.
**Use**: beauty, fashion, soft lifestyle.

## 3. Y2KChromeTitle — chrome perspective
```tsx
<Y2KChromeTitle text="ICONIC" />
```
Magenta→cyan chrome gradient title floating over a receding perspective grid. Pops in with spring scale 0.7→1.

**Palette**: magenta/cyan chrome + purple grid + dark sky.
**Use**: gaming, tech reveals, nostalgia-flips.

## 4. VaporwaveSunset
```tsx
<VaporwaveSunset text="DREAMER" />
```
80s sun disc with horizontal masking stripes, magenta perspective grid floor, italic serif title in outline.

**Palette**: magenta-purple-teal mesh + sunset gradient.
**Use**: music drops, late-night moods, synthwave content.

## 5. EditorialBrutalist — high-fashion bw
```tsx
<EditorialBrutalist
  text="POWER"
  kicker="ISSUE 04"     // optional small uppercase line
  accent="#e63946"
/>
```
Massive uppercase Helvetica in pure black on white. Single red vertical bar draws in beside the text. Magazine cover energy.

**Palette**: pure black/white + 1 accent (default red).
**Use**: fashion drops, design content, "serious" statements.

## 6. GlitchHype — RGB chaos
```tsx
<GlitchHype
  text="DROP"
  chaosFrames={10}      // length of the glitch storm
/>
```
6-10 frames of RGB-split chaos with random color slices and scanlines, then snaps clean. Use for hype/drop moments.

**Palette**: white + cyan + magenta on black.
**Use**: drop reveals, hype trailers, cyberpunk.

## 7. MochaPodcastIntro — Pantone 2025
```tsx
<MochaPodcastIntro
  text="The Late Hours"
  kicker="EP. 12"
/>
```
Warm mocha radial background with a soft amber light leak. Italic serif title rises gently from below.

**Palette**: Pantone 2025 mocha `#a47864` + cream + amber leak.
**Use**: podcast intros, calm explainers, premium wellness.

## Render Notes

- 1920×1080 or 1080×1920, 90 frames @ 30fps fits most.
- Render with `--mute`. These are pure visual moments. (`--audio-codec=no-audio` is an invalid Remotion flag.)
- Trend packs work best as opening shots — pair with a transition out to your real footage.

## Mixing With Other Skills

- **BratTitle → POVCaption** (`remotion-hooks`) — Brat slam then "POV:" body.
- **Y2KChromeTitle → SubscribeArrow** (`remotion-ctas`) — chrome intro then end-card.
- **EditorialBrutalist → LowerThird** (`remotion-lower-thirds`) — magazine cover then interview LT.
- **MochaPodcastIntro → TypewriterPro** (`remotion-text-presets`) — calm intro then a quoted line.
