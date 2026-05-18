---
name: remotion-charts
description: Six animated data-viz chart components for Remotion — BarChart with growing bars, PieChart with sweep-fill, LineGraph with path-draw, DonutMetric with center counter, TrendArrow with rising line, and BarRace with reordering bars. Use when the user asks for a "chart", "bar chart", "pie chart", "line graph", "donut", "trend", "bar race", or "data visualization".
---

# Remotion Charts

Six animated chart components for video data viz. Each accepts a plain data array, renders frame-perfect, and reveals over a configurable duration.

## Quick Reference

- [Source](./references/charts-source.tsx)
- [Catalog](./references/charts-catalog.md)

## The Six Charts

| Name | Best For | Mechanic | Data shape |
|------|----------|----------|------------|
| **BarChart** | Comparing 3–6 categories | Bars grow from bottom, labels above | `{label, value}[]` |
| **PieChart** | Share-of-total | Wedges sweep-fill clockwise | `{label, value, color?}[]` |
| **LineGraph** | Trend over time | SVG path draws left-to-right | `{label, value}[]` (label is the x-axis tick, value is the y) |
| **DonutMetric** | Single % stat | Ring fills + center counter ticks | `{value, label?}` |
| **TrendArrow** | Up/down callout | Arrow rises with % counter alongside | `{ value: number, label?: string, direction?: "up" \| "down" }` |
| **BarRace** | "X vs Y over time" | Bars reorder and grow between snapshots | `frames: {label, value}[][]` (array of snapshots, one per step) + `framesPerStep` |

## When to Load

- "Bar chart / category comparison / vertical bars" → **BarChart**
- "Pie chart / percentage breakdown / share" → **PieChart**
- "Line graph / trend line / time series" → **LineGraph**
- "Donut / single metric / completion ring" → **DonutMetric**
- "Trend arrow / up arrow / growth callout" → **TrendArrow**
- "Bar race / leaderboard / changing rank" → **BarRace**

## Golden Rules

1. Pass data as a plain `{label, value}[]` array (or the per-component shape).
2. All animation is `useCurrentFrame()`-driven, no `useState`.
3. Use `fontVariantNumeric: "tabular-nums"` on counters so digits don't jump width.
4. Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
5. **Be deliberate about the reveal duration.** Charts at 70–80 frames (~2.5s) read fast and feel snappy. Pushing past 120 frames makes them feel slow and "loading."

## Anti-patterns

- **Don't** feed BarChart > 6 categories. Past 6 the X-axis labels become unreadable and bars get pencil-thin. Switch to BarRace (handles 4–8 rows comfortably) or BarChartRace from `remotion-stats` (8 row cap).
- **Don't** put more than 5 wedges in PieChart. Past 5 wedges, the slice-labels overlap. For 6+ categories use BarChart.
- **Don't** use LineGraph with < 4 data points. With only 2–3 points the path-draw looks more like a connect-the-dots than a trend. Use TrendArrow for "we went up by X%" callouts on tiny data.
- **Don't** use DonutMetric for negative numbers. The ring fill assumes 0–100. For "we lost 12%" use TrendArrow with `value={12} direction="down"`.
- **Don't** use TrendArrow alone as a hero — it's a callout. Stack it on top of body content (the talking-head, the screen recording, the BarChart) so the trend is contextualized.
- **Don't** use BarRace with stable rankings (rows that don't change order). The whole point is the reordering. Stable data → use BarChart.
- **Don't** put data labels with line breaks. The current code measures text width assuming single-line — multi-line labels overflow the column.

## Composition Recipes

**Quarterly revenue breakdown:**
```tsx
<Sequence durationInFrames={80}>
  <BarChart data={[
    { label: "Q1", value: 124 },
    { label: "Q2", value: 158 },
    { label: "Q3", value: 142 },
    { label: "Q4", value: 201 },
  ]} />
</Sequence>
```

**Market share pie:**
```tsx
<Sequence durationInFrames={90}>
  <PieChart data={[
    { label: "iOS",     value: 56, color: "#22d3ee" },
    { label: "Android", value: 38, color: "#10b981" },
    { label: "Other",   value: 6,  color: "#a3a3a3" },
  ]} />
</Sequence>
```

**12-month traffic trend:**
```tsx
<Sequence durationInFrames={90}>
  <LineGraph
    title="Monthly visits"
    data={[
      { label: "Jan", value: 12 }, { label: "Feb", value: 14 },
      { label: "Mar", value: 18 }, { label: "Apr", value: 22 },
      { label: "May", value: 21 }, { label: "Jun", value: 28 },
      { label: "Jul", value: 35 }, { label: "Aug", value: 38 },
      { label: "Sep", value: 42 }, { label: "Oct", value: 48 },
      { label: "Nov", value: 53 }, { label: "Dec", value: 62 },
    ]}
  />
</Sequence>
```

**Completion ring (single big metric):**
```tsx
<Sequence durationInFrames={80}>
  <DonutMetric value={87} label="completion" />
</Sequence>
```

**Growth callout overlay (TrendArrow on top of footage):**
```tsx
<AbsoluteFill>
  <YourFootage />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <TrendArrow value={42} label="MoM" direction="up" />
  </AbsoluteFill>
</AbsoluteFill>
```

**Platform leaderboard race (multi-snapshot — the bars REORDER between snapshots):**
```tsx
<Sequence durationInFrames={120}>
  <BarRace
    frames={[
      // Q1 snapshot
      [
        { label: "YouTube",   value: 800 },
        { label: "TikTok",    value: 600 },
        { label: "Instagram", value: 540 },
        { label: "X",         value: 220 },
      ],
      // Q2 snapshot — TikTok overtakes
      [
        { label: "TikTok",    value: 920 },
        { label: "YouTube",   value: 850 },
        { label: "Instagram", value: 580 },
        { label: "X",         value: 240 },
      ],
      // Q3 snapshot — TikTok pulls away
      [
        { label: "TikTok",    value: 1100 },
        { label: "YouTube",   value: 780 },
        { label: "Instagram", value: 540 },
        { label: "X",         value: 220 },
      ],
    ]}
    framesPerStep={40}
  />
</Sequence>
```

If you only have a single snapshot (no reordering happens), use `BarChart` instead — BarRace's value-add is animating BETWEEN snapshots.

## Common Prop Overrides

```tsx
// Brand color per bar
<BarChart data={[
  { label: "Q1", value: 124, color: "#ff7a4d" },
  { label: "Q2", value: 158, color: "#10b981" },
]} />

// LineGraph with custom title (no separate y-axis-label prop)
<LineGraph title="Sessions" data={[...]} />

// DonutMetric without label (just the number)
<DonutMetric value={92} />

// TrendArrow downtrend — use positive value + direction="down"
<TrendArrow value={12} label="this week" direction="down" />
```

## Render Notes

- **1920×1080, 30fps** is the canonical canvas. Charts have absolute font sizes — for vertical 1080×1920, drop label font sizes by ~30% and increase chart container padding (fork source).
- Render with `--mute`.
- For overlay use (chart over real footage): set `bg="transparent"` on the component and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - BarChart: each bar lands at frame `i * 6 + 22` → percussive tick per bar
  - PieChart: sweep completes at duration's end → soft pad sustains, "ding" at completion
  - LineGraph: path draw completes at ~70% of duration → "drawing" SFX, settle chime
  - DonutMetric: counter completes near end → "ding"
  - TrendArrow: arrow lands at ~40% of duration → "whoosh + impact"
  - BarRace: snapshots interpolate continuously, no discrete reorder events. With default `framesPerStep=30`, adjacent snapshots are 30f apart — place a tonal beat at each snapshot boundary (frame 0, 30, 60, …) for "X overtook Y" emphasis

## Pairing with other skills

- **BarChart + PullQuote** (`remotion-callouts`) — chart reveal + key takeaway quote
- **DonutMetric + RealTalkCaption** (`remotion-hooks`) — metric + voiceover-aligned caption
- **TrendArrow + AnimatedGradient** (`remotion-backgrounds`) — growth callout over a mesh-color hero
- **BarRace + ChapterBumper** (`remotion-stingers`) — chapter title introducing the leaderboard
- **PieChart → ComparisonBars** (`remotion-stats`) — share breakdown then deep-dive on two of the slices
- **LineGraph + AlertStrip** (`remotion-banners`) — trend with a "growth alert" top-strip
