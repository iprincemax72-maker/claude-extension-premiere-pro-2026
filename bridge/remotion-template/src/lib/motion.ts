/**
 * Reusable motion primitives — combine these instead of writing
 * interpolate() from scratch every component.
 *
 * Each helper returns the CURRENT VALUE at the current frame, so use
 * them inside a Remotion component:
 *
 *   const opacity = popIn(frame, { start: 5, dur: 12 });
 *   const ty = slideUp(frame, { start: 5, dur: 15, from: 40 });
 *
 * Then apply to the element's style.
 */

import { interpolate, useCurrentFrame, spring as remSpring, useVideoConfig } from 'remotion';
import { EASE } from './easings';

type RangeOpts = { start: number; dur: number };

// Fade + scale pop-in (0 → 1, slight overshoot)
export function popIn(frame: number, { start, dur }: RangeOpts) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.spring,
  });
}

// Smooth fade only
export function fadeIn(frame: number, { start, dur }: RangeOpts) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
  });
}

// Slide-in from below — returns translateY in px (positive = below origin)
export function slideUp(
  frame: number,
  { start, dur, from = 40 }: RangeOpts & { from?: number }
) {
  return interpolate(frame, [start, start + dur], [from, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
  });
}

// Slide-in horizontally — returns translateX
export function slideIn(
  frame: number,
  { start, dur, from = -60 }: RangeOpts & { from?: number }
) {
  return interpolate(frame, [start, start + dur], [from, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
  });
}

// Staggered reveal — for animating items in a list one-by-one.
// Returns the local progress for an item at `index` given a stagger gap.
export function staggered(
  frame: number,
  { start, dur, index, gap = 4 }: RangeOpts & { index: number; gap?: number }
) {
  const localStart = start + index * gap;
  return interpolate(frame, [localStart, localStart + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.snap,
  });
}

// Punchy scale (spring) — useful for hero logos and emoji.
// Returns the scale factor, e.g. 1 = full size.
export function springPop(frame: number, start: number, damping = 8) {
  // Hook-like usage outside a component requires you to pass fps via useVideoConfig
  // in the calling component. This pure-function variant uses a hard-coded fps,
  // which is fine for components that already run at the project's fps.
  return remSpring({ frame: frame - start, fps: 30, config: { damping } });
}

// Decay-out — fade + scale down. For exit animations.
export function fadeOut(frame: number, { start, dur }: RangeOpts) {
  return interpolate(frame, [start, start + dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
  });
}

// Shake — sinusoidal jitter, returns translateX in px.
// Use for emphasis on a single word, or earthquake effects.
export function shake(frame: number, intensity = 8, speed = 18) {
  return Math.sin(frame * speed * 0.1) * intensity;
}

// Pulse — breathing effect, returns scale around 1.
export function pulse(frame: number, amount = 0.04, speed = 6) {
  return 1 + Math.sin(frame * 0.1 * speed) * amount;
}

// Hook variant — convenience inside a Remotion component when you want
// spring with the right fps automatically.
export function useSpring(start: number, damping = 8) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return remSpring({ frame: frame - start, fps, config: { damping } });
}
