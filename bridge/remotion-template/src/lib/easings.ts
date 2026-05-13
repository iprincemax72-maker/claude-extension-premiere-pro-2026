/**
 * Named easing curves — vocabulary for motion.
 *
 * Use these named easings instead of inventing your own cubic-bezier
 * values. Each one has a *vibe* described in the comment. Pick the one
 * that matches what the prompt asks for.
 *
 * Usage in a Remotion component:
 *   import { Easing } from 'remotion';
 *   import { EASE } from '../lib/easings';
 *   const opacity = interpolate(frame, [0, 30], [0, 1], { easing: EASE.snap });
 */

import { Easing } from 'remotion';

export const EASE = {
  // Material-design "standard" — safe default, smooth start and end
  standard: Easing.bezier(0.4, 0, 0.2, 1),

  // Apple-style ease-out — fast start, gentle landing. Good for content reveals.
  hero: Easing.bezier(0.16, 1, 0.3, 1),

  // Snappy — bounces in fast, no overshoot, feels confident. Use for text/UI pop-ins.
  snap: Easing.bezier(0.25, 0.46, 0.45, 0.94),

  // Spring overshoot — playful bounce, lands above target then settles. Logos, emoji.
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),

  // Strong overshoot — even more bounce. Comedy, kids content.
  bouncy: Easing.bezier(0.68, -0.55, 0.265, 1.55),

  // Whip — extreme ease-in followed by extreme ease-out. Mid-motion punch.
  whip: Easing.bezier(0.7, 0, 0.3, 1),

  // Linear — for camera-pan / sweep effects where constant speed matters
  linear: Easing.linear,

  // Anticipation — pulls slightly backward before going forward.
  anticipate: Easing.bezier(0.36, 0, 0.66, -0.56),

  // Cinematic — slow start, slow end, smooth middle. Premium feel.
  cinematic: Easing.bezier(0.65, 0, 0.35, 1),
};

// Standard durations (in frames at 30fps). Use these instead of magic numbers.
// At 60fps, double them.
export const FRAMES = {
  micro:  6,    // 0.2s — emoji bounce
  short:  9,    // 0.3s — punchy text drop
  base:   15,   // 0.5s — most things
  medium: 24,   // 0.8s — hero reveal
  long:   36,   // 1.2s — slow cinematic
  hold:   45,   // 1.5s — pause holds
};
