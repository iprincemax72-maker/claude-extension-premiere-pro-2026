# Callouts Catalog

Five drop-in emphasis/callout components for talking-head video. Full source in [callouts-source.tsx](./callouts-source.tsx).

---

## 1. HandDrawnArrow

**Effect:** Yellow marker arrow that draws on with stroke-dashoffset. Hand-written label near the tail. Arrowhead pops in at the end.

```tsx
<HandDrawnArrow
  label="look here"
  color="#fde047"
  bg="transparent"
  fromX={75} fromY={18}  // % of frame (label end)
  toX={50}   toY={50}    // % of frame (arrowhead end)
/>
```

**Customization:** flip `color` for brand. Swap `label` for any handwritten text. Drag the from/to points to retarget.

---

## 2. HighlightCircle

**Effect:** Scribbled red ellipse around a center point — drawn in two passes for a hand-drawn feel. Default points to screen center.

```tsx
<HighlightCircle
  cx={50} cy={50}      // % center
  rxPct={18} ryPct={12} // % half-width / half-height
  color="#ef4444"
  bg="transparent"
/>
```

**Customization:** position over a face by tweaking `cx`/`cy`. Change `color` for non-red emphasis.

---

## 3. PullQuote

**Effect:** Big italic serif quote with magazine-style yellow brackets sliding in from outside. Optional attribution beneath.

```tsx
<PullQuote
  text="You don't rise to the level of your goals."
  attribution="James Clear"
  accent="#fde047"
  bg="#0a0a0a"
/>
```

**Customization:** swap to white background + black text for editorial. Increase `fontSize` (default 88) for hero-card mode.

---

## 4. SpeechBubble

**Effect:** Comic-style white bubble pops in with a bouncy spring. Tail can be positioned at any corner.

```tsx
<SpeechBubble
  text="WHAT?!"
  tail="bl"            // bl | br | tl | tr
  bgColor="#ffffff"
  textColor="#0a0a0a"
  bg="transparent"
/>
```

**Customization:** swap `bgColor` to yellow `#fde047` or pink `#ec4899` for impact. Tail direction follows whoever is "speaking" on-screen.

---

## 5. QuestionCard

**Effect:** Dark card scales in, big pink question mark rotates from -20° into place, then question text fades in.

```tsx
<QuestionCard
  question="What would you do?"
  qMark="?"
  textColor="#ffffff"
  cardColor="#0a0a0a"
  accent="#ec4899"
  bg="transparent"
/>
```

**Customization:** swap `qMark` to `"!"` for exclamation cards. Use `accent="#10b981"` (emerald) for brand-friendly variant.

---

## Notes

- All are full-frame overlays — render at the resolution of the target composition.
- Set `bg="transparent"` for use as overlays in Premiere; render with `--codec prores --prores-profile 4444`.
- Arrow and Circle accept percentage coordinates so they scale to any resolution.
