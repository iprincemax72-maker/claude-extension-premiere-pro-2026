---
name: remotion-ctas
description: Six production-grade call-to-action animations for Remotion — YouTube subscribe arrow, notification bell ring, like-button smash, share-and-save callouts, and "tap to follow" finger animation. Use when the user asks for a "CTA", "subscribe arrow", "bell icon", "like button", "smash like", "share callout", "save bookmark", "follow prompt", or "engagement prompt".
---

# Remotion CTAs

Six **call-to-action** components for video creators — the animated prompts that nudge a viewer to subscribe, like, share, save, or follow. Render-verified to mp4.

## Quick Reference

- [Source](./references/ctas-source.tsx)
- [Catalog](./references/ctas-catalog.md)

## The Six CTAs

| Name | Mimics | Key Mechanic | Loop period |
|------|--------|--------------|-------------|
| **SubscribeArrow** | YT subscribe arrow pointing at button | Hand-drawn arrow draws + bouncing loop | ~24 frames |
| **BellRing** | Notification bell click + ring | Tilt-shake + sound ripples + filled state | ~36 frames |
| **LikeSmash** | TikTok/IG double-tap heart smash | Heart slams white → fills red → particles | ~50 frames |
| **ShareCallout** | "Share this" paper-plane prompt | Paper-plane glide + arrow + label | ~80 frames |
| **SaveBookmark** | "Save for later" corner bookmark | Bookmark unfolds in corner | ~70 frames |
| **TapToFollow** | "Tap to follow" finger animation | Hovering finger taps + ripple + "✓ Following" tooltip | ~90 frames |

## When to Load

- "Subscribe arrow / pointing arrow / subscribe prompt" → **SubscribeArrow**
- "Bell / ring the bell / notification on" → **BellRing**
- "Like / smash like / heart smash / double tap" → **LikeSmash**
- "Share / share this / share callout / paper plane" → **ShareCallout**
- "Save / bookmark / save for later" → **SaveBookmark**
- "Tap / follow / tap to follow / cursor tap" → **TapToFollow**

## Golden Rules

1. **CTA components LOOP by design.** They keep gently bouncing/pulsing so they hold attention without being ignored — safe to hold a Sequence on them for 5+ seconds.
2. **All driven by `useCurrentFrame()` + `interpolate()`/`spring()`** — deterministic, no useState.
3. **Anchor to a corner by default**; the parent can absolute-position them where needed.
4. **Render with `--mute`** + `--codec prores --prores-profile 4444` for transparent overlay. (`--audio-codec=no-audio` is an invalid Remotion flag.)
5. **Pair with `SubscribePop` from `remotion-social-ui`** for the click-through moment AFTER the CTA.

## When to Use Which CTA

- **End-card** (last 3-4s): SubscribeArrow + BellRing stacked
- **Mid-roll callout**: ShareCallout or SaveBookmark in a corner
- **Engagement bait moment** (after a punchline): LikeSmash
- **First-time-viewer prompt** (early in video): TapToFollow

## Anti-patterns

- **Don't** stack 3+ CTAs simultaneously. SubscribeArrow + BellRing is the max stack (they're designed to pair). Three competing CTAs read as desperate.
- **Don't** put a CTA on screen for less than 60 frames. The loop animation needs at least one full cycle to register — shorter durations feel like glitches.
- **Don't** trigger LikeSmash for emphasis on non-engagement moments. The heart smash is "double-tap your like" — using it for "this is cool" reads as a misplaced engagement bait.
- **Don't** anchor TapToFollow to the bottom of a vertical short. Bottom-aligned CTAs get covered by TikTok/Reels UI chrome (description, sound icon, side buttons). Top or middle-vertical is safer.
- **Don't** use ShareCallout in the first 5 seconds. Viewers haven't yet decided whether the content is worth sharing — early-share prompts read as desperate. Mid-roll or end-card only.
- **Don't** use SaveBookmark for clips longer than ~2 minutes without re-triggering. Viewers forget the save prompt — re-show it at the natural section boundary.

## Composition Recipes

**Classic YouTube end-card stack:**
```tsx
<Sequence from={endFrame - 90} durationInFrames={90}>
  <AbsoluteFill>
    <SubscribeArrow color="#ed2024" />
    <BellRing accent="#ed2024" />
  </AbsoluteFill>
</Sequence>
```

**Mid-roll save prompt (corner):**
```tsx
<AbsoluteFill>
  <YourMainContent />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <SaveBookmark corner="top-right" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Punchline → like smash:**
```tsx
<Sequence from={punchlineFrame} durationInFrames={80}>
  <LikeSmash />
</Sequence>
```

**TikTok early-video follow prompt:**
```tsx
<Sequence from={20} durationInFrames={150}>
  <TapToFollow />
</Sequence>
```

**Share moment after big reveal:**
```tsx
<Sequence from={revealFrame + 60} durationInFrames={120}>
  <ShareCallout />
</Sequence>
```

**End-card with stacked CTAs + watermark:**
```tsx
<Sequence from={endFrame - 90} durationInFrames={90}>
  <AbsoluteFill>
    <SubscribeArrow />
    <BellRing />
    <CornerWatermark text="@anshdhakad" corner="bottom-left" />
  </AbsoluteFill>
</Sequence>
```

## Common Prop Overrides

```tsx
// Brand-color subscribe arrow
<SubscribeArrow color="#ff7a4d" />

// BellRing in custom accent
<BellRing accent="#7c3aed" />

// LikeSmash with bigger heart
<LikeSmash size={280} />

// ShareCallout in left corner
<ShareCallout corner="bottom-left" />

// SaveBookmark with brand color
<SaveBookmark color="#10b981" />

// TapToFollow with custom label
<TapToFollow label="follow for more" />
```

## Render Notes

- **Vertical 1080×1920** is the canonical canvas for short-form CTAs. Landscape works but bottom-anchored CTAs need vertical-padding adjustments.
- Render with `--mute`. For transparent overlay (the standard use case): `--codec prores --prores-profile 4444 --mute` with `bg="transparent"` on the component.
- **Audio cue points** — CTAs are SFX-heavy by tradition. Sync these from Premiere:
  - SubscribeArrow: arrow draws ~14f, bounces every ~24f → "pencil scribble" intro, soft bounce per loop
  - BellRing: bell tilts ~12f, ripples expand → "bell-ring" SFX with reverb
  - LikeSmash: heart slams ~10f, color-fills ~22f, particles ~30f → "thump + sparkle"
  - ShareCallout: paper plane glides 10-40f → "whoosh" SFX
  - SaveBookmark: unfolds 10-22f → "paper-tuck" SFX
  - TapToFollow: finger taps every ~45f → soft "tap" per cycle

## Pairing with other skills

- **SubscribeArrow + BellRing** (in this skill) — the classic YouTube end-card stack
- **LikeSmash + WordPopCaption** (`remotion-text-presets`) — heart smash + "LIKE!" word pop
- **ShareCallout + ToastPopup** (`remotion-device-notifications`) — share prompt + notification of someone sharing
- **SaveBookmark + RecipeStep** (`remotion-lists`) — "save this recipe" mid-cooking-tutorial
- **TapToFollow + SubscribePop** (`remotion-social-ui`) — anticipation prompt → fulfillment animation
- **All CTAs + CornerWatermark** (`remotion-social-ui`) — branded end-card setup
