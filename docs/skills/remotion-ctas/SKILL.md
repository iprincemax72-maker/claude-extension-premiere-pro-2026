---
name: remotion-ctas
description: Six production-grade call-to-action animations for Remotion — YouTube subscribe arrow, notification bell ring, like-button smash, share-and-save callouts, and "tap to follow" finger animation. Use when the user asks for a "CTA", "subscribe arrow", "bell icon", "like button", "smash like", "share callout", "save bookmark", "follow prompt", or "engagement prompt".
---

# Remotion CTAs

Six **call-to-action** components for video creators — the animated prompts that nudge a viewer to subscribe, like, share, save, or follow. Drop in at the end of a clip or mid-roll for max engagement lift.

## Quick Reference

- [CTAs Catalog](./references/ctas-catalog.md) — Full prop list per component
- [Source](./references/ctas-source.tsx) — Drop-in TSX

## The Six CTAs

| Name | Mimics | Key Mechanic |
|------|--------|--------------|
| **SubscribeArrow** | YT "subscribe arrow" pointing at button | Hand-drawn arrow draws + bouncing loop |
| **BellRing** | Notification bell click + ring | Tilt-shake + sound ripples + filled state |
| **LikeSmash** | TikTok/IG double-tap heart smash | Heart slams in white → fills red → particles |
| **ShareCallout** | "Share this" paper-plane prompt | Paper-plane glide + arrow + label |
| **SaveBookmark** | "Save for later" corner bookmark | Bookmark fold pulses in corner |
| **TapToFollow** | "Tap to follow" finger animation | Hovering finger taps + ripple + label fade |

## When to Load

- "Subscribe arrow / pointing arrow / subscribe prompt" → **SubscribeArrow**
- "Bell / ring the bell / notification on" → **BellRing**
- "Like / smash like / heart smash / double tap" → **LikeSmash**
- "Share / share this / share callout / paper plane" → **ShareCallout**
- "Save / bookmark / save for later" → **SaveBookmark**
- "Tap / follow / tap to follow / cursor tap" → **TapToFollow**

## Golden Rules

1. **CTA components LOOP by design.** They keep gently bouncing/pulsing so they hold attention without being ignored.
2. **All driven by `useCurrentFrame()` + `interpolate()`/`spring()`** — deterministic, no useState.
3. **Anchor to a corner** by default; the parent can absolute-position them where needed.
4. **Render with `--mute`** + `--codec prores --prores-profile 4444` for transparent overlay. (`--audio-codec=no-audio` is an invalid Remotion flag.)
5. **Pair with `SubscribePop` from `remotion-social-ui`** for the click-through moment.

## When to Use Which CTA

- **End-card** (last 3-4s): SubscribeArrow + BellRing stacked
- **Mid-roll callout**: ShareCallout or SaveBookmark in a corner
- **Engagement bait moment** (after a punchline): LikeSmash
- **First-time-viewer prompt** (early in video): TapToFollow
