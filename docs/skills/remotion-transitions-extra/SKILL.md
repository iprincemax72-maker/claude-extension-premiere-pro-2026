---
name: remotion-transitions-extra
description: Five additional production-tested custom Remotion transitions — Iris Open, Page Tear, Camera Shake Cut, Color Wash, Hex Mosaic Flip. Use as an extension of `remotion-transitions` when you need a transition not in the base catalog.
---

# Remotion Custom Transitions — Extra Pack

Five additional **production-tested, visually verified** transitions that extend the `remotion-transitions` skill. Each was built against the same `TransitionPresentation` API contract, rendered against a Scene A → Scene B test harness, and frame-checked at t=0, mid, and end.

## Quick Reference

- [Transition Catalog (Extra)](./references/transition-catalog-extra.md) — Full source for all 5 transitions: Iris Open, Page Tear, Camera Shake Cut, Color Wash, Hex Mosaic Flip
- [Architecture Notes](./references/architecture.md) — How the entering wrap stacks on top of the exiting wrap, and the consequences for cover/reveal mechanics

## When to Load

- User wants a transition not in the base `remotion-transitions` catalog → load [transition-catalog-extra.md](./references/transition-catalog-extra.md)
- Building a NEW custom transition that involves a cover/reveal panel → load [architecture.md](./references/architecture.md) first

## The Five Transitions

| Name | Energy | Pair With | Best For |
|------|--------|-----------|----------|
| **Iris Open** | Low-medium | `linearTiming({ durationInFrames: 30-50 })` | Cinematic reveals, opening shots |
| **Page Tear** | Gritty / organic | `linearTiming({ durationInFrames: 35 })` | Editorial, magazine feel |
| **Camera Shake Cut** | Maximum impact | `linearTiming({ durationInFrames: 20-25 })` | Smash cut, action reveal |
| **Color Wash** | Medium | `linearTiming({ durationInFrames: 40 })` | Brand-color transitions, designed feel |
| **Hex Mosaic Flip** | Medium-high | `linearTiming({ durationInFrames: 45-55 })` | Tech / futuristic / data reveal |

## Golden Rules (same as base skill)

1. **Never use CSS transitions/animations** — all motion via `interpolate()` driven by `presentationProgress`
2. **Never use `useCurrentFrame()`** inside a transition component
3. Always return `{ component, props: {} }` — the `props` object must exist even if empty
4. **Create instances at module level** to keep them stable across re-renders
5. Pair with `linearTiming` for frame-perfect transitions

## Critical: Wrap Stacking Order

The entering wrap is **stacked on top** of the exiting wrap during the transition window. This means:
- A cover/panel rendered on the exiting wrap is **invisible** under the entering wrap
- A reveal mechanic (clip-path, mask, fading panel) must be placed on the **entering wrap**, starting in a state that hides the new scene (so the exiting scene below shows through) and ending in a state that reveals it

This is the single most common mistake when building custom transitions. See [architecture.md](./references/architecture.md) for the full breakdown.
