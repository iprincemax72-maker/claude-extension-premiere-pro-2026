---
name: remotion-frames
description: Five decorative frame and reveal components for Remotion — iOS ToastPopup, PolaroidFrame falling into view, PriceReveal flip card, BookmarkFold corner accent, and GiftBoxReveal. Use when the user asks for "toast", "iOS notification", "polaroid", "photo frame", "price reveal", "price tag", "bookmark", "gift box", or "reveal card".
---

# Remotion Frames

Five decorative frame / reveal cards for video editing. Render-verified to mp4.

- [Source](./references/frames-source.tsx)

## The Five Components

| Name | Use | Default canvas | Choreography |
|------|-----|----------------|--------------|
| **ToastPopup** | iOS-style notification toast | Vertical 1080×1920 | Slides down 0–14f, holds for `holdFrames`, slides up to dismiss |
| **PolaroidFrame** | Photo frame falls into view | Vertical 1080×1920 | Drops in with rotation (tiltDeg) and shadow |
| **PriceReveal** | Price tag flips into view | Vertical 1080×1920 | Card flips on Y-axis with depth shadow |
| **BookmarkFold** | Corner bookmark accent | Vertical 1080×1920 | Top corner unfolds with shadow underneath |
| **GiftBoxReveal** | Gift box shakes then opens | Vertical 1080×1920 | Shake 0–36f, opens at `openFrame`, contents pop out |

## When to Load

- "Toast / iOS notification / banner / toast popup" → **ToastPopup**
- "Polaroid / photo frame / instant photo" → **PolaroidFrame**
- "Price / price tag / price reveal / sale card" → **PriceReveal**
- "Bookmark / corner fold / decorative corner" → **BookmarkFold**
- "Gift box / present / reveal box" → **GiftBoxReveal**

## Golden rules

1. All five accept a `startFrame` prop — combine with `<Sequence from={N}>` for precise timing.
2. **PolaroidFrame `content` prop can be either** plain text OR an image URL. If it starts with `/`, `http`, or `file:`, it renders as a CSS `background: url(...)` (NOT `<Img>`). For Remotion renders, that means: `http://...` URLs work directly, but local paths need to be served through `staticFile('photo.jpg')` rather than a bare `/photo.jpg` — pass the result of `staticFile()` as `content`. Plain-text content renders inside a pink-cyan gradient placeholder.
3. Animations are `useCurrentFrame()` driven — frame-deterministic.
4. **ToastPopup auto-dismisses** at `startFrame + holdFrames + ~14f` (slide-up animation). Default total visible duration is ~118 frames at 30fps.

## Anti-patterns

- **Don't** use ToastPopup with `holdFrames < 60`. The toast needs ≥2 seconds of hold to be readable. Less, and the slide-in + slide-out blur into each other.
- **Don't** put long body text in ToastPopup. The `body` field is sized for ~40 chars max. Longer text overflows the toast.
- **Don't** use PolaroidFrame for serious branded content. The tilted frame + caption ("good times") aesthetic is casual/personal — for product shots use a clean image overlay instead.
- **Don't** put real-looking prices in PriceReveal without legal review. The component renders any string in big red — `"$0.00"` or `"FREE"` or `"$1,000,000"` all look equally official. Be intentional.
- **Don't** use BookmarkFold in landscape. The top-corner bookmark anchors to a corner — in landscape, the larger viewport makes the bookmark feel tiny and out of place.
- **Don't** chain two GiftBoxReveals. The shake-then-open is a "moment of suspense" effect — back-to-back removes the suspense.

## Composition Recipes

**iOS-style notification overlay:**
```tsx
<Sequence durationInFrames={150}>
  <ToastPopup
    title="ansh_dhakad"
    body="liked your photo"
    icon="❤️"
    holdFrames={90}
  />
</Sequence>
```

**Memory-lane polaroid montage** (images must live in `public/` so `staticFile` resolves them):
```tsx
import { staticFile } from "remotion";

<Sequence from={0}  durationInFrames={90}><PolaroidFrame content={staticFile("photo1.jpg")} caption="june 2024" tiltDeg={-7} /></Sequence>
<Sequence from={90} durationInFrames={90}><PolaroidFrame content={staticFile("photo2.jpg")} caption="august"     tiltDeg={4}  /></Sequence>
<Sequence from={180} durationInFrames={90}><PolaroidFrame content={staticFile("photo3.jpg")} caption="oct sunset" tiltDeg={-3} /></Sequence>
```

**Subscription price reveal:**
```tsx
<Sequence durationInFrames={90}>
  <PriceReveal price="$9" kicker="ONLY" unit="/month" color="#10b981" />
</Sequence>
```

**"New" corner badge during a product shot:**
```tsx
<AbsoluteFill>
  <YourProductShot />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <BookmarkFold label="NEW" corner="top-right" color="#ff2d55" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Holiday giveaway reveal:**
```tsx
<Sequence durationInFrames={120}>
  <GiftBoxReveal
    content="MERCH BUNDLE"
    openFrame={36}
    color="#dc2626"
    ribbonColor="#ffd60a"
  />
</Sequence>
```

## Common Prop Overrides

```tsx
// Toast with custom hold
<ToastPopup title="Order confirmed" body="Shipping today" icon="📦" holdFrames={120} />

// Polaroid with bigger tilt
<PolaroidFrame content="/img.jpg" caption="chaos" tiltDeg={-12} />

// PriceReveal in brand color
<PriceReveal price="$49" kicker="LAUNCH PRICE" unit="" color="#10b981" />

// BookmarkFold on top-left
<BookmarkFold label="SALE" corner="top-left" color="#fde047" />

// GiftBoxReveal with brand ribbon
<GiftBoxReveal content="🎉" color="#7c3aed" ribbonColor="#22d3ee" />
```

## Render Notes

- **Vertical 1080×1920** is the default canvas for all five. They work in 1920×1080 landscape too but the visual emphasis is calibrated for portrait (especially BookmarkFold's corner).
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For overlay use (e.g. toast on top of real footage): the components already default to `bg="transparent"` (except PriceReveal and GiftBoxReveal which default to `#0a0a0a`). For overlay on those two, pass `bg="transparent"` explicitly and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - ToastPopup: slide-in lands ~14f → iOS notification chime
  - PolaroidFrame: drops to landing at ~28f → paper-thump SFX with reverb
  - PriceReveal: flip completes ~22f → "card-flip" or "stamp" SFX
  - BookmarkFold: unfolds to settle ~16f → paper-fold SFX
  - GiftBoxReveal: opens at `openFrame` (default 36) → ribbon-tear + "ta-da" SFX

## Pairing with other skills

- **ToastPopup + iMessageBubble** (`remotion-social-ui`) — phone-screen vibe with both notification types
- **PolaroidFrame + LyricDrop** (`remotion-music-lyrics`) — nostalgic montage with bass-thump lyric
- **PriceReveal + StampImpact** (`remotion-text-presets`) — price reveal followed by "SOLD OUT" stamp
- **BookmarkFold + RetroVhs lower-third** (`remotion-lower-thirds`) — vintage corner with broadcast vibe
- **GiftBoxReveal + LikeBurst** (`remotion-social-ui`) — gift opens, hearts fly out for celebration
