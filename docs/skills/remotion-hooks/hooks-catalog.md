# Hooks Catalog

Six short-form opener hooks. Each calibrated for the first 60-90 frames (2-3s @ 30fps).

## 1. WaitZoomHook
```tsx
<WaitZoomHook
  text="Wait — you have to see this"
  punchWord="this"      // word that gets the zoom-punch
  punchFrame={16}        // frame the punch lands
  punchColor="#ff7a4d"   // accent for the punched word
/>
```
Slams in, then zoom-punches the named word. Highest-intensity hook. **Pair with a sound effect at `punchFrame`** for max impact.

## 2. POVCaption
```tsx
<POVCaption
  sentence="you just realized your phone has been recording the whole time"
  label="POV:"            // override for "MEANWHILE:" etc.
  framesPerWord={11}
  labelColor="#ffd60a"
/>
```
"POV:" label springs in, then sentence word-by-word with tiny rotation jitter. The classic TikTok hook.

## 3. PlotTwistReveal
```tsx
<PlotTwistReveal
  text="PLOT TWIST"
  punchFrame={30}
  color="#ffffff"
/>
```
Letters spread wide then snap tight (kerning-in), hold, then zoom-punch. Use mid-clip or as a chapter divider.

## 4. StoryTimeTitle
```tsx
<StoryTimeTitle
  text="story time"
  paperColor="#f3eadb"     // background tone
  inkColor="#2b1d12"        // text
/>
```
Italic-serif card on a soft cream/paper texture with subtle grain. Calm energy — use when the rest of the video is personal, not urgent.

## 5. RealTalkCaption
```tsx
<RealTalkCaption
  text="Real talk."
  subtitle="LET'S BE HONEST"   // small uppercase line beneath
  accent="#ff7a4d"
/>
```
Vertical accent bar draws, then italic-serif text slides in. Editorial pull-quote vibe.

## 6. WatchThisStamp
```tsx
<WatchThisStamp
  text="WATCH THIS"
  arrow={true}      // shows "→" after the text
  tiltDeg={-7}
  color="#ff2d55"
/>
```
Outlined rubber-stamp sticker that slams in with a bounce and slight rotation. Use as a sticker callout over real footage.

## Hook + Body Stack Recipes

**Plot-twist mid-clip:**
```tsx
<Sequence from={0} durationInFrames={60}><YourClip /></Sequence>
<Sequence from={60} durationInFrames={70}><PlotTwistReveal /></Sequence>
<Sequence from={130}><YourTwistClip /></Sequence>
```

**Cold open + content:**
```tsx
<Sequence durationInFrames={70}><WaitZoomHook /></Sequence>
<Sequence from={70}><YourContent /></Sequence>
```

**POV intro for a relatable skit:**
```tsx
<Sequence durationInFrames={100}><POVCaption sentence="..." /></Sequence>
<Sequence from={100}><Skit /></Sequence>
```

## Render Notes

- Vertical 1080×1920, 30fps. Hooks fit landscape too.
- Always render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For transparent overlay (ProRes 4444): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
