---
name: remotion-charts
description: Six animated data-viz chart components for Remotion — BarChart with growing bars, PieChart with sweep-fill, LineGraph with path-draw, DonutMetric with center counter, TrendArrow with rising line, and BarRace with reordering bars. Use when the user asks for a "chart", "bar chart", "pie chart", "line graph", "donut", "trend", "bar race", or "data visualization".
---

# Remotion Charts

Six animated chart components for video data viz. Each accepts a plain data array, renders frame-perfect, and reveals over a configurable duration.

## Quick Reference

- [Charts Catalog](./references/charts-catalog.md)
- [Source](./references/charts-source.tsx)

## The Six Charts

| Name | Best For | Mechanic |
|------|----------|----------|
| **BarChart** | Comparing 3-6 categories | Bars grow from bottom, labels above |
| **PieChart** | Share-of-total | Wedges sweep-fill clockwise |
| **LineGraph** | Trend over time | SVG path draws left-to-right |
| **DonutMetric** | Single % stat | Ring fills + center counter ticks |
| **TrendArrow** | Up/down callout | Arrow rises with % counter alongside |
| **BarRace** | "X vs Y over time" | Bars reorder and grow each frame |

## When to Load

- "Bar chart / category comparison / vertical bars" → **BarChart**
- "Pie chart / percentage breakdown / share" → **PieChart**
- "Line graph / trend line / time series" → **LineGraph**
- "Donut / single metric / completion ring" → **DonutMetric**
- "Trend arrow / up arrow / growth callout" → **TrendArrow**
- "Bar race / leaderboard / changing rank" → **BarRace**

## Golden Rules

1. Pass data as a plain `{label, value}[]` array.
2. All animation is `useCurrentFrame()`-driven, no `useState`.
3. Use `fontVariantNumeric: "tabular-nums"` on counters so digits don't jump.
4. Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
