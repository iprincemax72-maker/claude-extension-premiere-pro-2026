---
name: remotion-stats
description: Four animated stat / infographic components for Remotion. Use when the user asks for "stats", "data reveal", "bar chart", "progress ring", "percentage", "comparison", "before vs after", "metric tiles", or any animated data visualization.
---

# Remotion Stats / Infographics

Four animated data-reveal components, render-verified to mp4.

- [Source](./references/stats-source.tsx)
- [Catalog](./references/stats-catalog.md)

## The Four Components

| Name | Use for | Animation |
|------|---------|-----------|
| **BarChartRace** | Multi-row horizontal bars filling in stagger — leaderboards, rankings | Each bar springs in 6 frames after the one above; bar fill + value count are synced (one spring drives both) |
| **ProgressRing** | Single percentage / metric with circular gauge — completion, score | Stroke-dashoffset counts up; big % counter eased with `1 - (1-p)^2.4` so it overshoots slightly |
| **ComparisonBars** | A vs B vertical bars side-by-side — before / after | A grows from frame 0, B grows from frame 6 (so the eye reads them in order); values count up with the bars |
| **StatCardGrid** | 3 tile dashboard — multi-metric reveal | Cards pop-scale stagger (8f apart); numbers eased-ramp count up after the card lands |

## Trigger keywords

`"bar chart"`, `"chart race"`, `"leaderboard"`, `"progress ring"`, `"completion"`, `"X percent"`, `"before and after"`, `"comparison"`, `"stat tiles"`, `"dashboard"`, `"metric reveal"`, `"animated number with chart"`

## Golden rules

1. All counters use `fontVariantNumeric: "tabular-nums"` — digits don't jump width as they animate (this is critical; non-tabular numbers shudder visibly on counter animations)
2. Counts use the eased ramp `1 - (1-p)^2.4` — overshoots slightly toward target then locks. Don't replace with linear interpolate or it'll feel mechanical
3. Default colors are brand-neutral (emerald / pink / purple / red) — override via the `color` prop on each data row
4. Data shape stays the same: `{label, value}` for the simple ones; `{label, value, color?}` for the chart components; `{value, suffix?, prefix?, label, color?}` for StatCardGrid

## Anti-patterns

- **Don't** feed BarChartRace > 8 rows. Past 8, each row's height shrinks below the readable threshold for short-form video. Split into two charts and use a Sequence pair.
- **Don't** use ProgressRing for values < 5%. The ring stub is barely visible and the eased ramp's overshoot becomes a percentage point or two of false reading. Use a single counter component instead (or take the value × 10 and label it differently).
- **Don't** put extreme value ratios in ComparisonBars (e.g. 12,000 vs 184,000). The small bar will read as zero. If the comparison spans an order of magnitude, render on a log scale by pre-transforming values (`Math.log10(v + 1)`) and stamp the *real* numbers on top.
- **Don't** use StatCardGrid for 4+ tiles. The layout is hardcoded to a flex row with `gap: 32` — at 4+ tiles each card narrows below where its 110px counter font fits comfortably. Use BarChartRace for 4+ rows of comparable metrics.
- **Don't** chain stat components back-to-back without a beat between. Two consecutive data reveals overwhelm — give the viewer 30–60 frames of body content (or a still hold of the previous result) between metric moments.

## Composition Recipes

**Leaderboard reveal (4 platforms):**
```tsx
<Sequence durationInFrames={120}>
  <BarChartRace
    data={[
      { label: "tiktok",    value: 1100000, color: "#22d3ee" },
      { label: "youtube",   value: 780000,  color: "#ef4444" },
      { label: "instagram", value: 540000,  color: "#ec4899" },
      { label: "x",         value: 220000,  color: "#a3a3a3" },
    ]}
  />
</Sequence>
```

**Single-metric completion ring:**
```tsx
<Sequence durationInFrames={90}>
  <ProgressRing target={87} label="completion" color="#10b981" />
</Sequence>
```

**Before/after dramatic reveal:**
```tsx
<Sequence durationInFrames={100}>
  <ComparisonBars
    a={{ label: "before", value: 1200, color: "#ef4444" }}
    b={{ label: "after",  value: 18400, color: "#10b981" }}
    unit=""
  />
</Sequence>
```

**Channel-health dashboard:**
```tsx
<Sequence durationInFrames={120}>
  <StatCardGrid
    stats={[
      { value: 14000, suffix: "+", label: "subscribers", color: "#22d3ee" },
      { value: 92,    suffix: "%", label: "retention",   color: "#10b981" },
      { value: 8,     suffix: " min", label: "watch time", color: "#fde047" },
    ]}
  />
</Sequence>
```

**Build then explain (recipe pair):**
```tsx
<Sequence durationInFrames={90}><ProgressRing target={73} label="rewatch rate" /></Sequence>
<Sequence from={90} durationInFrames={120}>
  <PullQuote text="That 73% is the highest in the cohort." accent="#10b981" />
</Sequence>
```

## Common Prop Overrides

```tsx
// BarChartRace forcing a higher max so the leader doesn't fill the row
<BarChartRace data={[...]} max={2000000} />

// ProgressRing slower count-up
<ProgressRing target={87} durationFrames={75} />

// Custom card background (e.g. for a light theme)
<StatCardGrid stats={[...]} bg="#f5f5f5" cardColor="#ffffff" textColor="#0a0a0a" />

// ComparisonBars with prefix unit ($)
<ComparisonBars
  a={{ label: "old plan", value: 29 }}
  b={{ label: "new plan", value: 9 }}
  unit=" /mo"
/>
```

## Render Notes

- **1920×1080, 30fps** is the natural canvas. The big number sizes (110–130px) are tuned for landscape. For 1080×1920 vertical, fork and drop counter font sizes by ~30% — the 130px % counter in ProgressRing is too tight at vertical width.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid — legal `--audio-codec` values are `pcm-16 | aac | mp3 | opus`).
- For transparent overlay (e.g. stat tiles over real footage): set `bg="transparent"` on the component and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points** for sync with Premiere SFX:
  - BarChartRace: each row lands at frame `i * 6 + 16` — drop a tick SFX per row
  - ProgressRing: counter completes at `durationFrames` (default 45); land a chime there
  - ComparisonBars: A lands ~frame 16, B lands ~frame 22 — quick double-thud
  - StatCardGrid: cards land at frames 0, 8, 16; counters complete at ~frame 35 — staccato card thuds + a chord on completion
- **Color contrast warning:** the default BarChartRace bg `#0a0a0a` plus `rgba(255,255,255,0.06)` track gives a near-invisible track on dark themes. If your subject is mid-tone, pass `bg="#1a1a1a"` so the track is visible before bars fill.

## Pairing with other skills

- **ProgressRing + RealTalkCaption** (`remotion-hooks`) — ring counts up, caption frames the implication
- **BarChartRace → PullQuote** (`remotion-callouts`) — chart reveal, quote explains
- **StatCardGrid + AlertStrip** (`remotion-banners`) — dashboard with a "system update" notification overlay
- **ComparisonBars + WatchThisStamp** (`remotion-hooks`) — stamp on the winner side after the bars land
