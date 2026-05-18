# Social UI Catalog

Eight production-ready mockup components — all source in `social-ui-source.tsx`.

## 1. iMessageBubble — iOS Messages

Mimics an iPhone iMessage. Bubble springs in, text types character-by-character with a blinking cursor, and an optional "Read" receipt fades in after typing finishes.

```tsx
<iMessageBubble
  text="hey what time are we meeting tomorrow?"
  side="them"           // "them" (grey, left) | "you" (blue, right)
  sender="Sam"           // shown above on left bubbles only
  charsPerFrame={1.5}    // typing speed
  startFrame={6}         // when bubble + typing begin
  showRead={true}        // "Read" receipt under bubble after typing
/>
```

**Use cases:**
- "Show me a text I got from my mom"
- Reaction to a screenshot
- Faking a conversation scene

**Customization tips:**
- For a typed-out feel, use `charsPerFrame={1}` or lower.
- For a paste-then-send feel, set `charsPerFrame={99}` so the whole text appears at once.
- `showRead` lights up about 12f after typing finishes — chain a follow-up bubble for a real conversation.

---

## 2. DMNotification — IG/TikTok/WhatsApp banner

Slides down from the top with the platform-appropriate gradient avatar tile. Hold time defaults to 90 frames (3s @ 30fps) before sliding out.

```tsx
<DMNotification
  sender="lina.films"
  preview="omg I LOVED the new video 🔥🔥"
  app="Instagram"        // "Instagram" | "TikTok" | "WhatsApp" | "Message"
  startFrame={0}
  holdFrames={90}
  avatar="L"             // single char or emoji shown in the gradient tile
/>
```

**Use cases:**
- "Look what someone DM'd me"
- Engagement bait moment
- Demo of a feature in your app

**Customization tips:**
- The avatar gradient is themed by `app`. Pass `avatar` to override the first-letter fallback with an emoji.
- Long previews auto-truncate with ellipsis.
- For perpetual on-screen, set `holdFrames` to a huge number (e.g. 9999).

---

## 3. LikeBurst — heart flood

A fountain of red heart particles rising from screen-center, each with seeded jitter so the burst is deterministic per render.

```tsx
<LikeBurst
  count={18}             // total hearts
  durationFrames={60}    // total burst length
  color="#ff2d55"        // base color, slight hue shift per heart
/>
```

**Use cases:**
- Celebration moment
- "Look at all this love"
- TikTok-style double-tap reaction

**Customization tips:**
- Crank `count` to 40+ for a flood. Lower to 6-8 for a tasteful pop.
- Pair with **CommentOverlay** for a "live engagement" mock.

---

## 4. SubscribePop — YouTube subscribe button

Idle red button → tiny hover lift → "click" compress with white ripple → fills white with "SUBSCRIBED" + bell shake. Six beats of choreography in ~50 frames.

```tsx
<SubscribePop
  clickFrame={40}              // frame at which the user "clicks"
  label="SUBSCRIBE"            // pre-click label
  subscribedLabel="SUBSCRIBED" // post-click label
/>
```

**Use cases:**
- End-card subscribe prompt
- Mid-roll CTA
- "What it looks like when you hit the button"

**Customization tips:**
- For longer dwell time pre-click, increase `clickFrame`.
- Translate the labels to your locale: `label="ABONNEER"` etc.

---

## 5. CommentOverlay — TikTok comment

Comment card slides up from bottom-left. Username, comment body, optional like count with heart icon.

```tsx
<CommentOverlay
  username="alex_v"
  comment="this is so accurate 💀"
  likes={1247}
  startFrame={0}
  holdFrames={90}
  avatar="A"
/>
```

**Use cases:**
- Stitch-style reaction to a comment
- "I keep getting this comment"
- Demo of social engagement

**Customization tips:**
- Omit `likes` for a "live comment" feel (no count).
- Stack 2-3 with staggered `startFrame` for a comment flood.

---

## 6. LiveIndicator — LIVE badge

Pulsing red dot + "LIVE" label, top-left or top-right corner. Optional viewer count in a glassy pill next to it.

```tsx
<LiveIndicator
  viewers={12453}
  position="top-left"   // "top-left" | "top-right"
  label="LIVE"
/>
```

**Use cases:**
- Fake a livestream
- Stream highlight reels
- "We're going live in..." intro

**Customization tips:**
- For a Twitch feel, use `label="LIVE"` + dark backdrop.
- Drop the viewers prop for a minimal badge.

---

## 7. HashtagPop — #tag chip

Pill-shaped chip with the tag in a soft accent glow. Springs in, then breathes subtly (±2.5% scale) on a slow sine.

```tsx
<HashtagPop
  tag="POV"              // "#" auto-prepended if missing
  color="#25f4ee"        // chip + glow color
  fontSize={64}
  startFrame={0}
/>
```

**Use cases:**
- Sticker callout on a clip
- Topic intro
- Trend reference

**Customization tips:**
- For brand pink, use `color="#ff2d55"`.
- For YouTube red, `color="#ed2024"`.
- Combine with a TiltedSlam from `remotion-text-presets` for a full title moment.

---

## 8. CornerWatermark — channel watermark

Subtle bottom-right (default) logo tile + handle. Gentle fade-in then breathing opacity loop so it sits unobtrusively on real footage.

```tsx
<CornerWatermark
  handle="cruxdev"       // "@" auto-prepended
  logo="C"               // glyph in the logo tile
  position="bottom-right"
  maxOpacity={0.7}
  accent="#d97757"       // logo tile color
/>
```

**Use cases:**
- Every-clip channel branding
- "Don't steal my videos" deterrent
- Subtle "watch on @handle" reminder

**Customization tips:**
- For full-time watermark across a long clip, the breathing loop is ~5s — looks natural over any footage.
- Lower `maxOpacity` to 0.4 for "barely-there" branding.

---

## Stack Recipes

A few combinations that work nicely:

**Engagement moment:**
```tsx
<LikeBurst count={24} />
<CommentOverlay username="me" comment="lets gooo" likes={4} />
```

**Channel intro:**
```tsx
<TiltedSlam text="CHANNEL NAME" />   /* from remotion-text-presets */
<HashtagPop tag="newvideo" startFrame={30} />
```

**Livestream highlight:**
```tsx
<LiveIndicator viewers={1854} />
<CornerWatermark handle="streamer" />
```

**Phone notification skit:**
```tsx
<DMNotification sender="best friend" preview="did you see??" app="Instagram" />
<iMessageBubble text="WHAT" side="you" startFrame={90} />
```

## Render Notes

- Default canvas: **1080×1920**, 30fps. Components also look right at 1920×1080 — they self-position via percentages.
- Always render with `--mute`. These are pure visual overlays. (`--audio-codec=no-audio` is an invalid Remotion flag.)
- For ProRes 4444 (alpha overlay over real footage in Premiere): `--codec prores --prores-profile 4444 --mute`.
