/**
 * More scene-to-scene transitions. Companion to lib/transitions.ts.
 *
 * Each returns { outStyle, inStyle } you spread onto each scene's wrapper
 * around the boundary frame `b`. Some also return additional layer styles
 * (e.g. cube flip needs a 3D container).
 *
 * Usage:
 *   const { outStyle, inStyle } = cubeFlipTransition(frame, { boundary: 60, dur: 14, direction: 'right' });
 *   return (
 *     <>
 *       {frame <  boundary + dur/2 && <div style={{ ...outStyle, perspective: 1200 }}><Scene1/></div>}
 *       {frame >= boundary - dur/2 && <div style={{ ...inStyle,  perspective: 1200 }}><Scene2/></div>}
 *     </>
 *   );
 */

import { interpolate } from 'remotion';
import { EASE } from './easings';

type TxOpts = { boundary: number; dur?: number };

// ─── Cube flip (two scenes appear glued to perpendicular cube faces) ──
export function cubeFlipTransition(
  frame: number,
  { boundary, dur = 14, direction = 'left' as 'left' | 'right' | 'up' | 'down' }: TxOpts & { direction?: 'left'|'right'|'up'|'down' }
) {
  const p = interpolate(frame, [boundary - dur / 2, boundary + dur / 2], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const axis = (direction === 'left' || direction === 'right') ? 'Y' : 'X';
  const sign = (direction === 'left' || direction === 'up') ? 1 : -1;
  const outA = p * 90 * sign;
  const inA  = (p - 1) * 90 * sign;
  return {
    outStyle: {
      transform: `rotate${axis}(${outA}deg)`,
      transformOrigin: '50% 50%',
      backfaceVisibility: 'hidden' as const,
    },
    inStyle: {
      transform: `rotate${axis}(${inA}deg)`,
      transformOrigin: '50% 50%',
      backfaceVisibility: 'hidden' as const,
    },
  };
}

// ─── Page curl — outgoing curls away to corner ────────────────────────
export function pageCurlTransition(
  frame: number,
  { boundary, dur = 18, corner = 'tr' as 'tl'|'tr'|'bl'|'br' }: TxOpts & { corner?: 'tl'|'tr'|'bl'|'br' }
) {
  const p = interpolate(frame, [boundary, boundary + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  // Use clip-path polygon shrinking from the corner.
  let clip;
  if (corner === 'tr') clip = `polygon(0 0, ${100 - p * 110}% 0, 0 ${100 - p * 110}%)`;
  else if (corner === 'tl') clip = `polygon(${p * 110}% 0, 100% 0, 100% ${100 - p * 110}%)`;
  else if (corner === 'br') clip = `polygon(0 0, 100% 0, 100% ${100 - p * 110}%, 0 100%, ${p * 110}% 100%)`;
  else clip = `polygon(0 0, 100% 0, 100% ${100 - p * 110}%, 100% 100%, 0 100%, 0 ${p * 110}%)`;
  return {
    outStyle: {
      clipPath: clip,
      WebkitClipPath: clip,
      filter: `drop-shadow(0 ${p * 24}px ${p * 32}px rgba(0,0,0,${p * 0.5}))`,
    },
    inStyle: {},   // incoming sits underneath, reveals as outgoing peels
  };
}

// ─── Liquid wipe — irregular flowing wipe via mask ────────────────────
export function liquidWipeTransition(
  frame: number,
  { boundary, dur = 22, color = '#1a1a1f' }: TxOpts & { color?: string }
) {
  // We use a colored sheet that sweeps left-to-right with a curvy edge.
  const half = dur / 2;
  const sheetP = interpolate(frame, [boundary - half, boundary + half], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.liquidFlow,
  });
  // 0..0.5 cover the screen; 0.5..1 retreat off the other side
  const x = sheetP < 0.5 ? sheetP * 200 - 100 : 100 + (sheetP - 0.5) * 200;
  const after = frame >= boundary;
  return {
    outStyle: { display: after ? 'none' : 'block' },
    inStyle:  { display: after ? 'block' : 'none' },
    sheetStyle: {
      position: 'absolute' as const,
      top: 0, bottom: 0,
      left: `${x - 50}%`,
      width: '100%',
      background: color,
      borderRadius: '50% 50% 0 0 / 30% 30% 0 0',
      transform: 'scaleY(1.2)',
      transformOrigin: 'bottom center',
      pointerEvents: 'none' as const,
      zIndex: 99,
    },
  };
}

// ─── Color wash — full-frame color flash that masks the cut ───────────
export function colorWashTransition(
  frame: number,
  { boundary, dur = 14, color = '#fff' }: TxOpts & { color?: string }
) {
  const half = dur / 2;
  const after = frame >= boundary;
  const p = interpolate(frame, [boundary - half, boundary, boundary + half], [0, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return {
    outStyle: { display: after ? 'none' : 'block' },
    inStyle:  { display: after ? 'block' : 'none' },
    washStyle: {
      position: 'absolute' as const,
      inset: 0,
      background: color,
      opacity: p,
      pointerEvents: 'none' as const,
      zIndex: 99,
    },
  };
}

// ─── Zoom-blur transition (zoom + radial blur sells the camera punch) ─
export function zoomBlurTransition(
  frame: number,
  { boundary, dur = 12 }: TxOpts
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
      transform: `scale(${1 + outP * 1.4})`,
      filter: `blur(${outP * 22}px) brightness(${1 + outP * 0.4})`,
      opacity: 1 - outP,
    },
    inStyle: {
      transform: `scale(${1.5 - inP * 0.5})`,
      filter: `blur(${(1 - inP) * 18}px)`,
      opacity: inP,
    },
  };
}

// ─── Camera shake transition — impact frame between two scenes ────────
export function impactShakeTransition(
  frame: number,
  { boundary, dur = 8 }: TxOpts
) {
  const after = frame >= boundary;
  if (frame < boundary - dur || frame > boundary + dur) {
    return { outStyle: { display: after ? 'none' : 'block' }, inStyle: { display: after ? 'block' : 'none' } };
  }
  const decay = 1 - Math.abs(frame - boundary) / dur;
  const sign = (frame * 17) % 2 < 1 ? 1 : -1;
  const intensity = 22 * decay;
  return {
    outStyle: {
      display: after ? 'none' : 'block',
      transform: `translate(${sign * intensity}px, ${-sign * intensity * 0.5}px)`,
    },
    inStyle: {
      display: after ? 'block' : 'none',
      transform: `translate(${-sign * intensity}px, ${sign * intensity * 0.5}px)`,
    },
  };
}

// ─── Slide & cover — incoming slides over outgoing ───────────────────
export function slideCoverTransition(
  frame: number,
  { boundary, dur = 14, direction = 'left' as 'left'|'right'|'up'|'down' }: TxOpts & { direction?: 'left'|'right'|'up'|'down' }
) {
  const p = interpolate(frame, [boundary, boundary + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const dist = direction === 'left' || direction === 'right' ? 1920 : 1080;
  const sign = direction === 'left' || direction === 'up' ? 1 : -1;
  const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
  return {
    outStyle: {},
    inStyle: {
      transform: `translate${axis}(${(1 - p) * dist * sign}px)`,
    },
  };
}

// ─── Crossfade (with optional blur cross) ────────────────────────────
export function crossfadeTransition(
  frame: number,
  { boundary, dur = 18, withBlur = false }: TxOpts & { withBlur?: boolean }
) {
  const outP = interpolate(frame, [boundary - dur / 2, boundary + dur / 2], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.standard,
  });
  const inP = interpolate(frame, [boundary - dur / 2, boundary + dur / 2], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.standard,
  });
  return {
    outStyle: { opacity: outP, filter: withBlur ? `blur(${(1 - outP) * 10}px)` : undefined },
    inStyle:  { opacity: inP,  filter: withBlur ? `blur(${(1 - inP) * 10}px)`  : undefined },
  };
}
