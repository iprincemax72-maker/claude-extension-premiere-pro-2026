# CTAs Catalog

Six call-to-action components. Each loops gently to hold attention.

## 1. SubscribeArrow
```tsx
<SubscribeArrow
  point="down-right"        // direction toward target button
  label="SUBSCRIBE"          // null/empty = just the arrow
  color="#ff2d55"
/>
```
Swoopy hand-drawn arrow that draws in over 18 frames, then bounces in a loop in the pointing direction. Tilted label sits at the start of the curve.

## 2. BellRing
```tsx
<BellRing
  color="#ffd60a"           // bell color
  rippleColor="#ffd60a"
  size={240}
/>
```
Bell springs in, tilt-shakes hard for 30f, then settles into a gentle pulse with sound-wave ripples emanating every 60f. Use right after SubscribeArrow.

## 3. LikeSmash
```tsx
<LikeSmash
  smashFrame={18}            // frame the fill-to-red lands
  color="#ff2d55"
  size={280}
/>
```
Heart slams in at scale 2.5, holds white outline briefly, then SMASH → fills red with particle burst. The "engagement bait" moment.

## 4. ShareCallout
```tsx
<ShareCallout
  label="SHARE THIS"
  target="bottom-right"      // direction of the arrow
  color="#25f4ee"
/>
```
Paper-plane tile + bold label + tilted arrow. Hover loop. Drop in mid-roll over a punchline.

## 5. SaveBookmark
```tsx
<SaveBookmark
  label="SAVE FOR LATER"
  corner="top-right"
  color="#ffd60a"
/>
```
Yellow bookmark fold drops in from above, then gently pulses (±3% scale) so it stays visible.

## 6. TapToFollow
```tsx
<TapToFollow
  label="TAP TO FOLLOW"
  color="#ff2d55"
  size={220}
/>
```
A finger emoji hovers over a target circle, taps down + ripples every 50 frames. Label fades in beneath. Loops indefinitely.

## End-Card Stack Recipe

```tsx
<AbsoluteFill>
  <Sequence from={0} durationInFrames={90}>
    <SubscribeArrow point="down-right" />
  </Sequence>
  <Sequence from={20}>
    <BellRing />   /* offset so the bell rings after subscribe lands */
  </Sequence>
</AbsoluteFill>
```

## Mid-Roll Engagement Boost

```tsx
<Sequence from={60} durationInFrames={45}>
  <LikeSmash smashFrame={18} />
</Sequence>
<Sequence from={105}>
  <ShareCallout label="SHARE WITH A FRIEND" />
</Sequence>
```

## Render Notes
- Vertical 1080×1920, 30fps, transparent bg → composite over real footage in Premiere.
- Always render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For alpha overlay: `--codec prores --prores-profile 4444 --mute`.
