/**
 * Extra motion primitives — physics-y, organic, character animation feel.
 * Companion to motion.ts. Each helper returns the CURRENT value at the
 * current frame, just like the originals.
 *
 *   const { ty, scaleX, scaleY } = squashStretch(frame, { start: 0, dur: 30 });
 *   <div style={{ transform: `translateY(${ty}px) scale(${scaleX}, ${scaleY})` }}>
 */

import { interpolate, random } from 'remotion';
import { EASE } from './easings';

type RangeOpts = { start: number; dur: number };

// ─── ANTICIPATE — pull back before the launch (slingshot feel) ─────────
// Returns translate offset. Negative dir means pulls left/back; positive
// means pulls right/forward. Use for buttons that wind up before firing.
export function anticipate(
  frame: number,
  { start, dur = 24, anticipation = 8, peak = -50 }: RangeOpts & { anticipation?: number; peak?: number }
) {
  const a = start + anticipation;
  if (frame < start) return 0;
  if (frame < a) {
    // wind up
    const p = (frame - start) / anticipation;
    return -peak * Math.sin(p * Math.PI / 2);
  }
  // fire
  const p = Math.min(1, (frame - a) / (dur - anticipation));
  return -peak + peak * 4 * Math.pow(p, 0.5) * (1 - p) + peak * p;
}

// ─── RECOIL — kicks backward after an impact frame ────────────────────
// Use after a hard punch/zap to make the receiving thing visibly react.
export function recoil(
  frame: number,
  { start, dur = 20, peak = 24, direction = 1 }: RangeOpts & { peak?: number; direction?: number }
) {
  if (frame < start || frame > start + dur) return 0;
  const t = (frame - start) / dur;
  // Quick kick, then settle with damping
  return Math.sin(t * Math.PI * 3) * Math.exp(-t * 4) * peak * direction;
}

// ─── HOVER — infinite gentle up-down (no start/end) ───────────────────
export function hover(frame: number, { amount = 8, speed = 0.04, phase = 0 }: { amount?: number; speed?: number; phase?: number } = {}) {
  return Math.sin(frame * speed + phase) * amount;
}

// ─── PENDULUM — damped sinusoidal rotation (settles at 0) ─────────────
export function pendulum(
  frame: number,
  { start, dur = 60, angle = 12, decay = 3 }: RangeOpts & { angle?: number; decay?: number }
) {
  if (frame < start) return 0;
  const t = (frame - start) / dur;
  if (t > 1) return 0;
  return Math.sin(t * Math.PI * decay) * angle * Math.exp(-t * decay * 0.5);
}

// ─── SQUASH & STRETCH — cartoon impact / bounce shape ─────────────────
// Returns {scaleX, scaleY, ty}. Hits ground hard, squashes wide, bounces up.
export function squashStretch(
  frame: number,
  { start, dur = 24, peak = 40, squash = 0.3 }: RangeOpts & { peak?: number; squash?: number }
) {
  if (frame < start || frame > start + dur) return { scaleX: 1, scaleY: 1, ty: 0 };
  const t = (frame - start) / dur;
  // 0..0.5 falling, 0.5 impact, 0.5..1 bounce back
  if (t < 0.5) {
    const p = t * 2;
    return { scaleX: 1 + p * 0.1, scaleY: 1 - p * 0.1, ty: -peak * (1 - p) };
  }
  const p = (t - 0.5) * 2;
  // Impact moment around p=0
  const sq = Math.exp(-p * 6) * squash;
  return { scaleX: 1 + sq, scaleY: 1 - sq, ty: -peak * p * 0.3 };
}

// ─── TILT — 3D perspective tilt that follows a virtual mouse ──────────
// Returns {rotateX, rotateY} for a CSS transform. Use for cards that
// feel "alive" on a frame even without interaction.
export function tilt(
  frame: number,
  { strength = 6, speed = 0.02 }: { strength?: number; speed?: number } = {}
) {
  return {
    rotateY: Math.sin(frame * speed) * strength,
    rotateX: Math.cos(frame * speed * 0.7) * strength * 0.6,
  };
}

// ─── PATH FOLLOW — animate position along a quadratic bezier curve ────
// Returns {x, y} at the current point along the curve.
export function pathFollow(
  frame: number,
  { start, dur = 30, p0, p1, p2 }: RangeOpts & { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number } }
) {
  const t = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  // Quadratic bezier
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

// ─── SPRING CHAIN — staggered springs, each follows the previous ──────
// Returns the value at index `i` (0 = leader). Use for trailing tail of
// objects or sequential reveal that feels organic.
export function springChain(
  frame: number,
  { start, gap = 4, dur = 18, index }: { start: number; gap?: number; dur?: number; index: number }
) {
  const localStart = start + index * gap;
  return interpolate(frame, [localStart, localStart + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.spring,
  });
}

// ─── POPCORN — random staggered pop-in. Items appear in random order. ─
// Returns the opacity/scale for `index` given a deterministic seed.
export function popcorn(
  frame: number,
  { start, dur = 18, totalItems, index, seed = 'pop' }: { start: number; dur?: number; totalItems: number; index: number; seed?: string }
) {
  // Deterministic per-index delay based on seed
  const delay = random(`${seed}-${index}`) * (dur * 0.6);
  const localStart = start + delay;
  const p = interpolate(frame, [localStart, localStart + dur * 0.4], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.spring,
  });
  return { scale: p, opacity: Math.min(1, p * 1.5) };
}

// ─── EXPLODE-IN — pieces fly from off-screen to form the whole ────────
// Returns {x, y, rotate, opacity} for piece `index` of `total`.
// pieces start scattered at distance `radius`, converge to (0,0).
export function explodeIn(
  frame: number,
  { start, dur = 28, index, total, radius = 600, seed = 'ex' }:
  { start: number; dur?: number; index: number; total: number; radius?: number; seed?: string }
) {
  const angle = (index / total) * Math.PI * 2 + random(`${seed}-a-${index}`) * 0.6;
  const dist = radius * (0.7 + random(`${seed}-d-${index}`) * 0.6);
  const localStart = start + random(`${seed}-s-${index}`) * 4;
  const p = interpolate(frame, [localStart, localStart + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const remaining = 1 - p;
  return {
    x: Math.cos(angle) * dist * remaining,
    y: Math.sin(angle) * dist * remaining,
    rotate: remaining * 180 * (random(`${seed}-r-${index}`) - 0.5),
    opacity: p,
  };
}

// ─── EXPLODE-OUT — opposite: pieces fly away from the whole ───────────
export function explodeOut(
  frame: number,
  { start, dur = 24, index, total, radius = 600, seed = 'ox' }:
  { start: number; dur?: number; index: number; total: number; radius?: number; seed?: string }
) {
  const angle = (index / total) * Math.PI * 2 + random(`${seed}-a-${index}`) * 0.6;
  const dist = radius * (0.7 + random(`${seed}-d-${index}`) * 0.6);
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.tiktokPunch,
  });
  return {
    x: Math.cos(angle) * dist * p,
    y: Math.sin(angle) * dist * p,
    rotate: p * 180 * (random(`${seed}-r-${index}`) - 0.5),
    opacity: 1 - p,
  };
}

// ─── MELT DOWN — element drips down like wax ─────────────────────────
// Returns translateY + scaleY. Stretches vertically while sinking.
export function meltDown(
  frame: number,
  { start, dur = 36, peakStretch = 1.4, fall = 200 }:
  RangeOpts & { peakStretch?: number; fall?: number }
) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.drag,
  });
  return {
    ty: p * fall,
    scaleY: 1 + p * (peakStretch - 1),
    scaleX: 1 - p * 0.15,
    opacity: 1 - p * 0.7,
  };
}

// ─── FOLD OPEN — paper unfolds (3D rotateX from -90 to 0) ────────────
// Apply via CSS transform: perspective(900px) rotateX(${angle}deg).
export function foldOpen(
  frame: number,
  { start, dur = 26, axis = 'x' as 'x' | 'y' }: RangeOpts & { axis?: 'x' | 'y' }
) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return {
    rotate: (1 - p) * -90,
    opacity: Math.min(1, p * 2),
    axis,
  };
}

// ─── RISE AND SHINE — slow upward translate + gradual glow build ──────
// Returns {ty, glow} where `glow` is 0..1 to control box-shadow opacity.
export function riseAndShine(
  frame: number,
  { start, dur = 36, from = 80 }: RangeOpts & { from?: number }
) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.cinematic,
  });
  return {
    ty: (1 - p) * from,
    opacity: p,
    glow: Math.max(0, (p - 0.4) / 0.6),  // glow builds in second half
  };
}

// ─── DROP & CRACK — fall + impact spike (use with screen shake) ───────
// Returns {ty, scaleX, scaleY, impactFrame}. The `impactFrame` is true
// for ~1 frame at landing — use that frame to spawn cracks/particles.
export function dropAndCrack(
  frame: number,
  { start, dur = 24, from = -400 }: RangeOpts & { from?: number }
) {
  if (frame < start) return { ty: from, scaleX: 1, scaleY: 1, impactFrame: false };
  const t = (frame - start) / dur;
  if (t < 0.7) {
    // falling
    const fallP = t / 0.7;
    return {
      ty: from * (1 - fallP * fallP),   // accelerating
      scaleX: 1, scaleY: 1,
      impactFrame: false,
    };
  }
  if (t < 0.78) {
    // impact squash
    const impactP = (t - 0.7) / 0.08;
    return {
      ty: 0,
      scaleX: 1 + impactP * 0.4,
      scaleY: 1 - impactP * 0.3,
      impactFrame: t < 0.71,
    };
  }
  // recover
  const rp = (t - 0.78) / 0.22;
  return {
    ty: 0,
    scaleX: 1 + 0.4 * Math.exp(-rp * 6) * Math.cos(rp * 8),
    scaleY: 1 - 0.3 * Math.exp(-rp * 6) * Math.cos(rp * 8),
    impactFrame: false,
  };
}

// ─── MAGNETIC — element slides toward a target with overshoot ────────
// Returns interpolated {x, y} from `from` to `to`. Snaps tightly at end.
export function magnetic(
  frame: number,
  { start, dur = 22, from, to }: RangeOpts & { from: { x: number; y: number }; to: { x: number; y: number } }
) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.elastic,
  });
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
  };
}

// ─── STRETCH FLICK — squashes laterally, then springs back ────────────
// Use on a clicked button or punched target.
export function stretchFlick(
  frame: number,
  { start, dur = 18 }: RangeOpts
) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (p === 0 || p === 1) return { scaleX: 1, scaleY: 1 };
  // Impact at t=0..0.2, recover with bounce
  const phase = p * Math.PI;
  return {
    scaleX: 1 + Math.sin(phase * 3) * 0.15 * Math.exp(-p * 4),
    scaleY: 1 - Math.sin(phase * 3) * 0.15 * Math.exp(-p * 4),
  };
}

// ─── ATTENTION SHAKE — quick "look at me" wobble ─────────────────────
// Returns rotation angle. Use on icons / badges to draw the eye.
export function attentionShake(
  frame: number,
  { start, dur = 14, intensity = 8 }: RangeOpts & { intensity?: number }
) {
  if (frame < start || frame > start + dur) return 0;
  const t = (frame - start) / dur;
  return Math.sin(t * Math.PI * 4) * intensity * (1 - t);
}

// ─── HEARTBEAT — double pulse pattern ────────────────────────────────
// Returns scale around 1. BPM-driven for sync with music if needed.
export function heartbeat(frame: number, { bpm = 60, amount = 0.08 }: { bpm?: number; amount?: number } = {}) {
  const period = (60 / bpm) * 30;        // frames per beat (30fps)
  const t = (frame % period) / period;
  const beat1 = Math.max(0, 1 - Math.abs(t - 0.0) * 14);
  const beat2 = Math.max(0, 1 - Math.abs(t - 0.18) * 14) * 0.6;
  return 1 + (beat1 + beat2) * amount;
}

// ─── DRIFT — natural slow random walk (perlin-ish) ───────────────────
// Returns {x, y} drift offsets in pixels.
export function drift(frame: number, { amount = 12, speed = 0.005, seed = 'd' }: { amount?: number; speed?: number; seed?: string } = {}) {
  const t = frame * speed;
  // Smooth interpolation between random anchor points
  const xa = Math.floor(t);
  const xb = xa + 1;
  const xf = t - xa;
  const x0 = (random(`${seed}-x-${xa}`) - 0.5) * 2 * amount;
  const x1 = (random(`${seed}-x-${xb}`) - 0.5) * 2 * amount;
  const y0 = (random(`${seed}-y-${xa}`) - 0.5) * 2 * amount;
  const y1 = (random(`${seed}-y-${xb}`) - 0.5) * 2 * amount;
  // Smoothstep
  const s = xf * xf * (3 - 2 * xf);
  return { x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s };
}

// ─── REVEAL-FROM-BOTTOM — soft gradient mask wipe (no clip-path) ─────
// Returns a CSS mask-image that animates from hidden to visible.
export function gradientReveal(
  frame: number,
  { start, dur = 22, from = 'bottom' as 'top' | 'bottom' | 'left' | 'right' }: RangeOpts & { from?: 'top'|'bottom'|'left'|'right' }
) {
  const p = interpolate(frame, [start, start + dur], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const dir = { top: 'to bottom', bottom: 'to top', left: 'to right', right: 'to left' }[from];
  const mask = `linear-gradient(${dir}, #000 ${p}%, transparent ${p + 20}%)`;
  return { WebkitMaskImage: mask, maskImage: mask };
}

// ─── TYPE WITH CARET — typewriter that also exposes caret blink state ─
// Returns { text, caretVisible } so you can render the caret yourself.
export function typeOnWithCursor(
  frame: number,
  { start = 0, text, cps = 18, fps = 30, caretBlinkFrames = 15 }:
  { start?: number; text: string; cps?: number; fps?: number; caretBlinkFrames?: number }
) {
  const charsToShow = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  const visible = text.slice(0, Math.min(charsToShow, text.length));
  const isTyping = charsToShow < text.length;
  // Caret blinks while idle; stays solid while typing
  const caretVisible = isTyping || Math.floor(frame / caretBlinkFrames) % 2 === 0;
  return { text: visible, caretVisible, done: !isTyping };
}

// ─── ELASTIC BAND — overshoot + spring-back oscillation ──────────────
// Returns a single value 0..1 with elastic overshoot.
export function elastic(frame: number, { start, dur = 32 }: RangeOpts) {
  if (frame < start) return 0;
  const t = Math.min(1, (frame - start) / dur);
  // Elastic out formula
  const c4 = (2 * Math.PI) / 3;
  if (t === 0) return 0;
  if (t === 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// ─── ORBITAL — element circles around a center point ─────────────────
// Returns {x, y} offset from the center.
export function orbital(frame: number, { speed = 0.02, radius = 100, phase = 0, ellipseX = 1, ellipseY = 1 }: { speed?: number; radius?: number; phase?: number; ellipseX?: number; ellipseY?: number } = {}) {
  const angle = frame * speed + phase;
  return {
    x: Math.cos(angle) * radius * ellipseX,
    y: Math.sin(angle) * radius * ellipseY,
  };
}
