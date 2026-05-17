---
name: remotion-comparison
description: Five before/after and versus comparison components for Remotion — split-screen Before/After, Day 1 vs Day 30 transformation, Then vs Now nostalgia card, "What I expected vs what happened" panels, and a centered VS battle card. Use when the user asks for "before and after", "split screen", "Day 1 Day 30", "then vs now", "expected vs reality", "versus", or any side-by-side comparison.
---

# Remotion Comparison

Five side-by-side comparison cards for transformation, versus, or "this vs that" content.

## Components

- [Source](./references/comparison-source.tsx) — Drop-in TSX

| Name | Use |
|------|-----|
| **BeforeAfter** | Generic Before / After split, labels at top |
| **DayOneVsDayThirty** | Faded left vs punchy right, transformation arc |
| **ThenVsNow** | Vintage filter left, modern right, nostalgia card |
| **ExpectedVsHappened** | "What I expected ↔ what happened" playful panels |
| **VersusCard** | Centered "VS" between two big labels |

## When to Load

- "Before and after / before/after / split" → **BeforeAfter**
- "Day 1 vs Day 30 / transformation / progress" → **DayOneVsDayThirty**
- "Then vs now / nostalgia" → **ThenVsNow**
- "What I expected / expectation vs reality" → **ExpectedVsHappened**
- "Versus / VS / battle card / X vs Y" → **VersusCard**

## Golden Rules

1. Pass two text labels (and optionally two image URLs).
2. All animation is `useCurrentFrame()` + `interpolate()`/`spring()`.
3. Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid and will error).
