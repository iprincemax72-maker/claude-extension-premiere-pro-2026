/**
 * Scene-to-scene transitions — these are visual effects you apply on
 * the BOUNDARY between two scenes inside a Series or a sequenced
 * composition. Each returns CSS to apply to the outgoing and incoming
 * scene's wrapper.
 *
 * Typical usage (transition over 8 frames at boundary frame `b`):
 *
 *   const { outStyle, inStyle } = whipPanTransition(frame, { boundary: 60, dur: 8 });
 *   return (
 *     <>
 *       {frame < 60 + 4 && <Scene1 style={outStyle} />}
 *       {frame >= 60 - 4 && <Scene2 style={inStyle} />}
 *     </>
 *   );
 */

import { interpolate, random } from 'remotion';
import { EASE } from './easings';

type TxOpts = { boundary: number; dur?: number };

/**
 * Whip pan — outgoing flies off, motion blur peaks, incoming flies in.
 */
export function whipPanTransition(
  frame: number,
  { boundary, dur = 8, direction = 'left' as 'left' | 'right' }: TxOpts & { direction?: 'left' | 'right' }
) {
  const sign = direction === 'left' ? -1 : 1;
  const half = dur / 2;

  // Outgoing: 0 → -W*sign over first half
  const outP = interpolate(frame, [boundary - half, boundary], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.whip,
  });
  // Incoming: +W*sign → 0 over second half
  const inP = interpolate(frame, [boundary, boundary + half], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.whip,
  });

  const blurOut = Math.sin(outP * Math.PI) * 30;
  const blurIn = Math.sin((1 - inP) * Math.PI) * 30;

  return {
    outStyle: {
      transform: `translateX(${outP * 1920 * sign}px)`,
      filter: `blur(${blurOut}px)`,
    },
    inStyle: {
      transform: `translateX(${(1 - inP) * -1920 * sign}px)`,
      filter: `blur(${blurIn}px)`,
    },
  };
}

/**
 * Zoom punch — outgoing scales up & fades, incoming scales down from
 * larger size with a quick punch.
 */
export function zoomPunchTransition(
  frame: number,
  { boundary, dur = 10 }: TxOpts
) {
  const half = dur / 2;
  const outP = interpolate(frame, [boundary - half, boundary], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.tiktokPunch,
  });
  const inP = interpolate(frame, [boundary, boundary + half], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return {
    outStyle: {
      transform: `scale(${1 + outP * 0.5})`,
      opacity: 1 - outP,
    },
    inStyle: {
      transform: `scale(${1.5 - inP * 0.5})`,
      opacity: inP,
    },
  };
}

/**
 * Glitch cut — short burst of RGB-split jitter at the boundary, then
 * hard cut to the new scene.
 */
export function glitchCutTransition(
  frame: number,
  { boundary, dur = 6 }: TxOpts
) {
  const inGlitch = frame >= boundary - dur && frame < boundary + dur;
  const isAfter = frame >= boundary;
  const seed = `gx-${frame}`;
  const j = inGlitch ? (random(seed) - 0.5) * 30 : 0;
  const r = inGlitch ? (random(seed + 'r') - 0.5) * 20 : 0;
  const b = inGlitch ? (random(seed + 'b') - 0.5) * 20 : 0;
  return {
    outStyle: {
      display: isAfter ? 'none' : 'block',
      transform: `translateX(${j}px)`,
      filter: `drop-shadow(${r}px 0 0 #ff0044) drop-shadow(${b}px 0 0 #00ffe1)`,
    },
    inStyle: {
      display: isAfter ? 'block' : 'none',
      transform: `translateX(${j}px)`,
      filter: `drop-shadow(${r}px 0 0 #ff0044) drop-shadow(${b}px 0 0 #00ffe1)`,
    },
  };
}

/**
 * Iris wipe — circular reveal from the center.
 */
export function irisWipeTransition(
  frame: number,
  { boundary, dur = 18 }: TxOpts
) {
  const p = interpolate(frame, [boundary, boundary + dur], [0, 150], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return {
    outStyle: {
      clipPath: `circle(${150 - p}% at 50% 50%)`,
    },
    inStyle: {
      clipPath: `circle(${p}% at 50% 50%)`,
    },
  };
}

/**
 * Slide morph — outgoing slides one way, incoming slides the same way
 * (carries the eye). Subtle, premium feel.
 */
export function slideMorphTransition(
  frame: number,
  { boundary, dur = 14, direction = 'up' as 'up' | 'down' | 'left' | 'right' }: TxOpts & { direction?: 'up' | 'down' | 'left' | 'right' }
) {
  const p = interpolate(frame, [boundary - dur / 2, boundary + dur / 2], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const distance = direction === 'left' || direction === 'right' ? 1920 : 1080;
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
  return {
    outStyle: {
      transform: `translate${axis}(${p * distance * sign}px)`,
      opacity: 1 - p,
    },
    inStyle: {
      transform: `translate${axis}(${(1 - p) * -distance * sign}px)`,
      opacity: p,
    },
  };
}

/**
 * Push — outgoing physically pushes incoming. Both slide in lock-step.
 */
export function pushTransition(
  frame: number,
  { boundary, dur = 14, direction = 'left' as 'left' | 'right' | 'up' | 'down' }: TxOpts & { direction?: 'left' | 'right' | 'up' | 'down' }
) {
  const p = interpolate(frame, [boundary - dur / 2, boundary + dur / 2], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const distance = direction === 'left' || direction === 'right' ? 1920 : 1080;
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
  return {
    outStyle: { transform: `translate${axis}(${p * distance * sign}px)` },
    inStyle:  { transform: `translate${axis}(${(p - 1) * distance * sign * -1}px)` },
  };
}

/**
 * Flash cut — quick white flash at the boundary that masks a hard cut.
 * Returns a separate `flashStyle` to apply to a white overlay div.
 */
export function flashCutTransition(
  frame: number,
  { boundary, dur = 6 }: TxOpts
) {
  const isAfter = frame >= boundary;
  const flashP = interpolate(frame, [boundary - dur / 2, boundary, boundary + dur / 2], [0, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return {
    outStyle: { display: isAfter ? 'none' : 'block' },
    inStyle:  { display: isAfter ? 'block' : 'none' },
    flashStyle: {
      position: 'absolute' as const,
      inset: 0,
      background: '#fff',
      opacity: flashP,
      pointerEvents: 'none' as const,
      zIndex: 999,
    },
  };
}
