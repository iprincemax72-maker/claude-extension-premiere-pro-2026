---
name: remotion-callouts
description: Five production-tested callout / emphasis components for Remotion. Use when the user asks to "point at", "highlight", "circle", "show this", "callout", "quote", "speech bubble", "pull quote", or "question card".
---

# Remotion Callouts

Five production-tested emphasis components, designed as overlays for talking-head video.

- [Source](./references/callouts-source.tsx)
- [Catalog](./references/callouts-catalog.md) — full source + customization tips

## The Five Callouts

| Name | Vibe | When to use |
|------|------|-------------|
| **HandDrawnArrow** | Hand-written marker arrow + label | Pointing at on-screen UI |
| **HighlightCircle** | Scribbled red ring (two passes for that hand-drawn feel) | Emphasis around a face/object |
| **PullQuote** | Magazine-italic quote + brackets | Quoting somebody, big moment |
| **SpeechBubble** | Comic-style bubble with tail | Reaction, character thought |
| **QuestionCard** | Big "?" card with question text | Setting up a Q&A moment |

## Trigger keywords

`"arrow pointing at"`, `"circle this"`, `"highlight"`, `"emphasize"`, `"pull quote"`, `"big quote"`, `"speech bubble"`, `"WHAT?!"`, `"question card"`, `"callout"`

## Golden rules

1. Most are full-frame overlays — pass `bg="transparent"` for ProRes 4444 alpha rendering
2. Arrow and Circle accept `%` coordinates (`fromX`, `fromY`, etc.) so they scale to any composition
3. All animations are `interpolate()` / `spring()` driven — frame-deterministic, no `useState`

## Anti-patterns

- **Don't** stack a HandDrawnArrow and a HighlightCircle on the same beat — they fight visually. One emphasis device per moment. If you must combine, stagger the entrances (`startFrame` 0 vs 14) so the eye reads them in order.
- **Don't** use HighlightCircle on text — the scribble pass is tuned for face/object sizes (≥150px). On small text it looks noisy. Use HandDrawnArrow with a label instead.
- **Don't** set `framesPerWord`-style timing on PullQuote — the quote text fades in as one block at frames 10–22. Splitting it into per-word entrances breaks the editorial feel.
- **Don't** put SpeechBubble at top-of-frame with `tail: "bl"` — the tail will dangle into empty space. Match tail direction to the subject location (`tail: "br"` if the speaker is bottom-right).
- **Don't** render QuestionCard on transparent bg expecting the card to disappear — the card itself is opaque (`cardColor` defaults to `#0a0a0a`). For real-footage overlay set `cardColor="rgba(0,0,0,0.85)"` or use `bg="transparent"` knowing the card will still cover its area.

## Composition Recipes

**Pointing at on-screen UI:**
```tsx
<Sequence durationInFrames={90}>
  <HandDrawnArrow
    label="settings live here"
    fromX={80} fromY={20}
    toX={62} toY={45}
    color="#fde047"
  />
</Sequence>
```

**Circle a face during a reaction shot:**
```tsx
<Sequence from={45} durationInFrames={60}>
  <HighlightCircle cx={48} cy={42} rxPct={14} ryPct={20} color="#ef4444" />
</Sequence>
```

**Big quote moment (full-frame card replaces video):**
```tsx
<Sequence from={120} durationInFrames={120}>
  <PullQuote text="Design is intelligence made visible" attribution="Alina Wheeler" />
</Sequence>
```

**Comic reaction over the talking head:**
```tsx
<Sequence from={30} durationInFrames={60}>
  <SpeechBubble text="WAIT WHAT" tail="bl" bg="transparent" />
</Sequence>
```

**Q&A intro card:**
```tsx
<Sequence durationInFrames={120}>
  <QuestionCard question="would you sell it for a million?" qMark="?" accent="#ec4899" />
</Sequence>
```

## Common Prop Overrides

```tsx
// Brand-color arrow
<HandDrawnArrow color="#7eb800" label="here" />

// Wider scribble for tall faces
<HighlightCircle rxPct={12} ryPct={20} />

// Smaller pull quote (no attribution)
<PullQuote text="small steps every day" attribution="" />

// Speech bubble with brand color
<SpeechBubble bgColor="#ff7a4d" textColor="#ffffff" />

// QuestionCard on white background (light mode)
<QuestionCard question="hmm" cardColor="#ffffff" textColor="#0a0a0a" accent="#ef4444" />
```

## Render Notes

- **1920×1080, 30fps** is the safe default. All components use `%` positioning so they fit 1080×1920 vertical too.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid — legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- `--mute` produces video with a silent AAC track. Premiere accepts that fine. If you need *no audio track at all* (rare), post-process with `ffmpeg -i in.mp4 -c:v copy -an out.mp4`.
- For transparent overlay over real footage in Premiere: render with `--codec prores --prores-profile 4444 --mute` and set the component's `bg="transparent"`.
- **Audio cue points** for sync with Premiere SFX:
  - HandDrawnArrow: draw completes at frame 22; pen-stroke whoosh on frame 6
  - HighlightCircle: first pass completes at frame 20, second pass at frame 28; double-circle scribble SFX on frame 14
  - PullQuote: brackets land at frame 14; text reveal complete at frame 22
  - SpeechBubble: pop at frame 8 (spring lands)
  - QuestionCard: card snaps at frame 12; "?" mark wobble lands at frame 16

## Pairing with other skills

- **HighlightCircle + WatchThisStamp** (`remotion-hooks`) — circle the subject, then drop the stamp on the side
- **PullQuote → BigQuote** (`remotion-quotes`) — callouts version is for short moments, quotes version is for held editorial cards
- **SpeechBubble + LikeBurst** (`remotion-social-ui`) — character reacts, hearts fly out
