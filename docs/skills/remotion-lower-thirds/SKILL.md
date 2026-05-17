---
name: remotion-lower-thirds
description: Five production-tested lower-third presets for Remotion. Use when the user asks for a "lower third", "name card", "name and title", "newsroom title", "name reveal", "speaker tag", or any overlay introducing a person/role at the bottom of the frame.
---

# Remotion Lower Thirds

Five production-tested lower-third components, verified visually against a mid-grey test frame and render-clean to mp4.

- [Source](./references/lower-thirds-source.tsx)
- [Catalog](./references/lower-thirds-catalog.md)

## The Five Lower Thirds

| Name | Vibe | When to use |
|------|------|-------------|
| **NewsBroadcast** | CNN-style, red bar | News, interview, formal |
| **MinimalBauhaus** | Thin accent line, tight Helvetica | Modern, minimal, brand-y |
| **RetroVhs** | Chromatic offset, mono font + scan-line border | Vintage, retro, "live from" |
| **EditorialItalic** | Magazine serif, yellow underline, word-by-word fade | Editorial, fashion, lifestyle |
| **GlitchLowerThird** | RGB-split + scrolling tear strips | Damaged feed, alt, edgy |

## Trigger keywords

`"lower third"`, `"name card"`, `"name and title"`, `"news lower third"`, `"chyron"`, `"speaker tag"`, `"introduce X"`, `"VERA DIXIE · CONTENT CREATOR"`

## Golden rules

1. Pass `bg="transparent"` for overlay use (renders to ProRes 4444 with alpha so it composites over real footage in Premiere)
2. Position is fixed bottom-left with **80px left / 120px bottom** safe-zone padding — standard for 1920×1080 broadcast title-safe
3. All animations are `useCurrentFrame()` + `interpolate()` / `spring()` — deterministic, no `useState`, no CSS transitions
4. Names render uppercase in NewsBroadcast / RetroVhs / GlitchLowerThird; mixed-case in MinimalBauhaus / EditorialItalic — match style to component

## Anti-patterns

- **Don't** put a NewsBroadcast lower-third on a casual vlog. The red bar reads as "breaking news" and feels jarring on personal content — use MinimalBauhaus or EditorialItalic for vlog/lifestyle.
- **Don't** stack two lower-thirds in the same shot (e.g. host + guest). Either swap them with a beat between, or use a different intro device for the guest (`SpeechBubble` from `remotion-callouts`).
- **Don't** use RetroVhs over actually old-feeling footage — the chromatic offset already implies "old camera." Doubled-up signal feels parodic.
- **Don't** render the **GlitchLowerThird** for longer than ~90 frames. The tear strips loop with `(frame * 13) % 80`, which becomes visually repetitive past ~3 seconds. Cap your `Sequence` duration.
- **Don't** position to top-of-frame by zeroing `LT_LEFT` / `LT_BOTTOM`. They're literal constants in the source — modify your *Sequence's* CSS positioning around the lower-third, or fork the component if you really need a different anchor.
- **Don't** use long names (>22 chars) on RetroVhs — its `rgba(0,0,0,0.65)` background block is sized for short titles. For long names, MinimalBauhaus scales much better.

## Composition Recipes

**Standard talking-head intro (host card, 3-second show):**
```tsx
<Sequence from={45} durationInFrames={90}>
  <NewsBroadcast name="Vera Dixie" role="Content Creator" />
</Sequence>
```

**Sequential host → guest (2-card flow):**
```tsx
<Sequence from={0} durationInFrames={90}>
  <MinimalBauhaus name="Ansh Dhakad" role="creator" accent="#10b981" />
</Sequence>
<Sequence from={90} durationInFrames={90}>
  <MinimalBauhaus name="Ada Lovelace" role="mathematician" accent="#a78bfa" />
</Sequence>
```

**Magazine-feature opener (longer hold for editorial weight):**
```tsx
<Sequence durationInFrames={150}>
  <EditorialItalic name="Joan Didion" role="essayist" accent="#fde047" />
</Sequence>
```

**Vintage call-out (capped at 60 frames to dodge tear-loop):**
```tsx
<Sequence durationInFrames={60}>
  <RetroVhs name="Channel 4" role="live" />
</Sequence>
```

**Damaged-feed alt aesthetic (capped at 90 frames):**
```tsx
<Sequence durationInFrames={80}>
  <GlitchLowerThird name="feed-A" role="signal lost" />
</Sequence>
```

## Common Prop Overrides

```tsx
// Brand-color NewsBroadcast (red → green)
<NewsBroadcast name="ANSH" role="DEV" accent="#16a34a" />

// MinimalBauhaus with longer accent line (custom width by passing wider name)
<MinimalBauhaus name="Maria Garcia Hernandez" role="director of photography" />

// EditorialItalic on a light background (invert textColor + accent)
<EditorialItalic name="Joan Didion" textColor="#0a0a0a" accent="#c026d3" bg="transparent" />

// GlitchLowerThird-style without scan-line border: there's no flag — fork the source
// and remove `borderLeft: '3px solid #ff2e63'` from the wrapper div.
```

## Render Notes

- **1920×1080, 30fps** is the canonical canvas. Lower-thirds are pixel-positioned with `LT_LEFT = 80`, `LT_BOTTOM = 120` — they will appear slightly off-anchor on non-1080p sizes. For 1080×1920 vertical, fork and use percentage positioning, or wrap in a Sequence with `style={{ transform: 'translateY(-200px)' }}` to push them up into a sensible vertical position.
- Render with `--mute` (`--audio-codec=no-audio` is an invalid Remotion flag; legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- `--mute` keeps a silent AAC track. Premiere accepts that. If you want **no audio track at all**, post-process with `ffmpeg -i in.mp4 -c:v copy -an out.mp4`.
- For transparent overlay over real footage: render with `--codec prores --prores-profile 4444 --mute` and keep `bg="transparent"`.
- **Audio cue points** for sync with Premiere SFX:
  - NewsBroadcast: bar slides into place at frame ~12 — "whoosh" SFX on frame 8
  - MinimalBauhaus: line completes at frame ~14; text rises at frames 14–22 — soft "tick" + reveal on 14
  - RetroVhs: glitch jitter ends frame 14; RGB offset settles by frame 24 — "VHS pop" / "tape-in" SFX on frame 0
  - EditorialItalic: words fade in every 3 frames; underline draws after — gentle paper-rustle on frame 0
  - GlitchLowerThird: glitch decays over 18 frames — "broken-signal pop" on frame 0, settles at 18

## Pairing with other skills

- **NewsBroadcast → BreakingBanner** (`remotion-banners`) — host card sets the speaker, banner reveals the story
- **MinimalBauhaus + CornerWatermark** (`remotion-social-ui`) — clean lower-third with discrete brand mark in opposite corner
- **EditorialItalic → PullQuote** (`remotion-callouts`) — author intro then their key quote
- **RetroVhs + NewsTicker** (`remotion-banners`, with a retro `labelColor`) — full retro-broadcast set
- **GlitchLowerThird + PlotTwistReveal** (`remotion-hooks`) — damaged-feed aesthetic across a mid-clip twist
