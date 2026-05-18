---
name: remotion-social-ui
description: Eight platform-accurate social UI mockup components for Remotion — iMessage with typing dots + delivery states, IG/TikTok DM banner with online dot, like-burst with depth + motion blur, YouTube subscribe with 7-act cursor-to-bell choreography, comment overlay with type-in, live indicator with sound-wave bars + organic viewer tick, hashtag chip with selection flash, and channel watermark with heartbeat halo. Use when the user asks for "iMessage", "DM notification", "Instagram-style", "TikTok-style", "subscribe pop", "live badge", "comment overlay", "hashtag chip", or "channel watermark".
---

# Remotion Social UI (v2 — platform-accurate)

Eight social platform mockup components for short-form video. Each one models the **real UX state machine** of its source app — not just a static look.

## Quick Reference

- [Source](./references/social-ui-source.tsx) — Drop-in TSX
- [Catalog](./references/social-ui-catalog.md)

## What "platform-accurate" means

| Component | UX state machine modeled |
|-----------|-------------------------|
| **iMessageBubble** | typing-dots → bubble-pop → text-type → delivery-haptic-shake → "Delivered" → "Read" |
| **DMNotification** | slide-in with haptic spring → online-dot pulse → hold → drift-right exit |
| **LikeBurst** | bg-pulse on impact → hearts spawn with depth/spin/motion-blur trails |
| **SubscribePop** | idle hover → cursor approach (motion-blurred) → click compress → ripple + color sweep → bell appear + shake → "Bell on" tooltip |
| **CommentOverlay** | spring-in → optional type-in → online status dot + like-count tick-up |
| **LiveIndicator** | enter → red-dot pulse → halo ring expanding → sound-wave bars dance → viewer count ticks organically |
| **HashtagPop** | spring-in → cursor selection flash → breathing scale + tiny drift |
| **CornerWatermark** | fade-in → heartbeat halo every 90f → logo gloss rotates → optional type-in handle |

## When to Load

- "iMessage / iPhone text / SMS bubble" → **iMessageBubble**
- "Instagram DM / TikTok DM / DM banner / message notification" → **DMNotification**
- "like burst / hearts flying / love bomb" → **LikeBurst**
- "subscribe button / YouTube subscribe / subscribe pop" → **SubscribePop**
- "comment / TikTok comment / floating comment" → **CommentOverlay**
- "LIVE badge / live indicator / streaming dot" → **LiveIndicator**
- "hashtag chip / #tag pop / tag bubble" → **HashtagPop**
- "watermark / channel logo / corner brand" → **CornerWatermark**

## Anti-patterns

- **Don't** stack iMessage bubbles for a "conversation" by hand-positioning them. Use `<Sequence>` and let each bubble own its delivery state. Otherwise the typing dots collide.
- **Don't** turn `withCursor={false}` on SubscribePop unless the camera is locked on the button — without the cursor approach the click feels disembodied.
- **Don't** put DMNotification on a busy background. The glassmorphism needs blur — it reads as transparent over plain video.
- **Don't** set `count > 30` on LikeBurst at vertical 1080×1920 — particles overlap into a magenta blob.
- **Don't** use LiveIndicator's organic-tick with a tiny viewer count (`viewers={3}`) — the +2/sec tick feels fake. For low counts use `organicTick={false}`.

## Composition Recipes

**Engagement moment (peak hype):**
```tsx
<AbsoluteFill>
  <Sequence durationInFrames={60}><LikeBurst count={24} withBgPulse /></Sequence>
  <Sequence from={20} durationInFrames={120}>
    <CommentOverlay
      username="me"
      comment="lets gooo"
      likes={4}
      likeAfter={30}
      typeIn
    />
  </Sequence>
</AbsoluteFill>
```

**Channel-intro stack:**
```tsx
<AbsoluteFill>
  <SubscribePop clickFrame={50} withCursor withTooltip />
  <CornerWatermark handle="cruxdev" />
</AbsoluteFill>
```

**Livestream highlight:**
```tsx
<AbsoluteFill>
  <LiveIndicator viewers={1854} organicTick />
  <CornerWatermark handle="streamer" maxOpacity={0.55} />
</AbsoluteFill>
```

**Phone-notification skit:**
```tsx
<Sequence from={0} durationInFrames={140}>
  <DMNotification
    sender="best friend"
    preview="did you see??"
    app="Instagram"
    onlineDot
  />
</Sequence>
<Sequence from={120}>
  <iMessageBubble
    text="WHAT"
    side="you"
    withTypingDots={false}
  />
</Sequence>
```

**Faked text-conversation (the right way):**
```tsx
<Sequence from={0}>
  <iMessageBubble text="you up?" side="them" sender="Sam" charsPerFrame={2} />
</Sequence>
<Sequence from={70}>
  <iMessageBubble text="ugh yeah" side="you" charsPerFrame={2.2} withTypingDots={false} showRead />
</Sequence>
```
The `from={70}` gives the first message time to land + Delivered + Read before the reply begins. Don't compress this.

## Common Prop Overrides

```tsx
// Brand-blue iMessage (e.g. Telegram style)
<iMessageBubble text="..." side="you" blueAccent="#0088cc" />

// DM on dark video — pump opacity by skipping bg
<DMNotification sender="..." preview="..." bg="transparent" />

// Restrained LikeBurst (no background pulse)
<LikeBurst count={12} withBgPulse={false} />

// SubscribePop without the click cursor (already-on-button shot)
<SubscribePop clickFrame={20} withCursor={false} />

// Always-on watermark with logo emoji
<CornerWatermark handle="creator" logo="🍿" maxOpacity={0.5} />
```

## Render Notes

- **Vertical 1080×1920, 30fps** is the default. All components self-position.
- Render with `--mute` — these are visual overlays. (`--audio-codec=no-audio` is an invalid Remotion flag.)
- For transparent overlay on real footage: `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points** for sync with Premiere SFX:
  - iMessageBubble: typing-dots peaks at frame 0–20; bubble pop at `typingDotsFrames`; "received" haptic at typing-end + 12.
  - SubscribePop: click at `clickFrame`; bell ring at `clickFrame + 14`.
  - LikeBurst: pop SFX at frame 0 (peak intensity).
  - LiveIndicator: continuous low-frequency hum.

## Motion Utilities Shared with Other Skills

```tsx
motion.pop    = { damping: 11, stiffness: 200, mass: 0.6 }
motion.slam   = { damping: 9,  stiffness: 240, mass: 0.85 }
motion.haptic = { damping: 16, stiffness: 260, mass: 0.5 } // iOS-feel snap
motion.drift  = { damping: 22, stiffness: 80,  mass: 1.1 }

tremor(frame, amplitude=1, speed=0.18): number  // multi-sine micro-tremor
```

These match `remotion-hooks` — use them in compositions for cross-skill timing coherence.

## Pairing with other skills

- **iMessageBubble + ToastPopup** (`remotion-device-notifications`) — phone-screen vibe with both notification types
- **DMNotification + WordPopCaption** (`remotion-text-presets`) — DM lands + caption explains
- **LikeBurst + EndCard** (`remotion-stingers`) — outro card with hearts flying out for celebration
- **SubscribePop + SubscribeArrow** (`remotion-ctas`) — anticipation prompt (arrow) → fulfillment animation (pop)
- **CommentOverlay + iMessageBubble** — comment lands on screen, then iMessage thread of the response
- **LiveIndicator + NewsTicker** (`remotion-banners`) — full live-broadcast set
- **HashtagPop + LikeBurst** — hashtag pops with hearts on the beat
- **CornerWatermark + (any other component)** — universal branding overlay; safe to layer on top of anything because it lives in a corner
