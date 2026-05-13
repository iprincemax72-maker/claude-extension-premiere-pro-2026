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

import { interpolate, useCurrentFrame, spring as remSpring, useVideoConfig, random } from 'remotion';
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

// ─── TRENDING 2025-2026 KINETIC PRIMITIVES ───

/**
 * Word-by-word pop — TikTok caption style. Each word punches in on its
 * own beat with optional random rotation for organic feel.
 *
 *   words.map((w, i) => {
 *     const { scale, opacity, rotate } = wordPop(frame, { start: 5, index: i, gap: 4 });
 *     return <span style={{ display:'inline-block', transform:`scale(${scale}) rotate(${rotate}deg)`, opacity }}>{w} </span>;
 *   })
 */
export function wordPop(
  frame: number,
  { start, index, gap = 4, jitter = 0 }: { start: number; index: number; gap?: number; jitter?: number }
) {
  const localStart = start + index * gap;
  const p = interpolate(frame, [localStart, localStart + 8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.tiktokPunch,
  });
  const rotateSeed = jitter ? (random(`wp-${index}`) - 0.5) * 2 * jitter : 0;
  return {
    scale: 0.6 + p * 0.4,
    opacity: p,
    rotate: rotateSeed * (1 - p), // tilts in, settles upright
  };
}

/**
 * Typewriter — returns the visible substring of `text` at the current frame.
 * `cps` = characters per second.
 *
 *   const visible = typewriter(frame, { text: "Hello world", start: 0, cps: 18 });
 *   <span>{visible}<Caret /></span>
 */
export function typewriter(
  frame: number,
  { text, start, cps = 16, fps = 30 }: { text: string; start: number; cps?: number; fps?: number }
) {
  const charsToShow = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  return text.slice(0, Math.min(charsToShow, text.length));
}

/**
 * Highlighter — yellow bar slides in BEHIND text. Returns the bar's
 * scaleX (0 → 1) so you can use it as `transform: scaleX(...)` with
 * `transformOrigin: 'left'`.
 */
export function highlighter(frame: number, { start, dur = 10 }: RangeOpts) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
}

/**
 * Glitch — returns RGB-split offsets and brief jitter. Use sparingly,
 * usually 6-12 frames for an impact moment.
 *
 *   const g = glitch(frame, { start: 30, dur: 8 });
 *   // Apply three copies of the element with these offsets:
 *   //   red layer:  translate(${g.rx}px, 0)
 *   //   green:      translate(0, 0)
 *   //   blue:       translate(${g.bx}px, 0)
 *   //   container:  translate(${g.jitterX}px, ${g.jitterY}px)
 */
export function glitch(
  frame: number,
  { start, dur = 8, intensity = 12 }: RangeOpts & { intensity?: number }
) {
  const active = frame >= start && frame < start + dur;
  if (!active) return { rx: 0, bx: 0, jitterX: 0, jitterY: 0, active: false };
  const seed = `glitch-${frame}`;
  const a = random(seed);
  const b = random(seed + '-2');
  const c = random(seed + '-3');
  const d = random(seed + '-4');
  return {
    rx: (a - 0.5) * 2 * intensity,
    bx: (b - 0.5) * 2 * intensity,
    jitterX: (c - 0.5) * 2 * (intensity * 0.5),
    jitterY: (d - 0.5) * 2 * (intensity * 0.5),
    active: true,
  };
}

/**
 * Whip-pan — fast directional translate + motion blur. Returns translateX
 * and blur(px). Use across a scene boundary: first 4 frames whip out,
 * next 4 whip in.
 */
export function whipPan(
  frame: number,
  { start, dur = 8, direction = 'left' as 'left' | 'right', distance = 1920 }: RangeOpts & { direction?: 'left' | 'right'; distance?: number }
) {
  const sign = direction === 'left' ? -1 : 1;
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.whip,
  });
  // Use a sine curve so blur peaks mid-pan
  const blurAmt = Math.sin(p * Math.PI) * 24;
  return { tx: p * distance * sign, blur: blurAmt };
}

/**
 * Zoom-punch — quick scale spike (1 → 1.15 → 1) over ~10 frames.
 * For beat-sync moments, "wait what" reveals, emphasis hits.
 */
export function zoomPunch(
  frame: number,
  { start, dur = 10, peak = 1.15 }: RangeOpts & { peak?: number }
) {
  const half = dur / 2;
  if (frame < start || frame > start + dur) return 1;
  const t = frame - start;
  const up = interpolate(t, [0, half], [1, peak], { easing: EASE.tiktokPunch });
  const down = interpolate(t, [half, dur], [peak, 1], { easing: EASE.expoOut });
  return t < half ? up : down;
}

/**
 * Breathe — slow scale oscillation, much slower than `pulse`. For idle
 * hero shots, "alive" feel on a logo or a face.
 */
export function breathe(frame: number, amount = 0.02, speed = 1.5) {
  return 1 + Math.sin(frame * 0.01 * speed) * amount;
}

/**
 * Wiggle — perlin-ish rotation jitter using Remotion `random`.
 * Returns degrees. Smoothed by sampling 4 octaves.
 */
export function wiggle(frame: number, intensity = 3, speed = 0.05) {
  const t = frame * speed;
  const a = (random(`w-${Math.floor(t)}`) - 0.5);
  const b = (random(`w-${Math.floor(t) + 1}`) - 0.5);
  const f = t - Math.floor(t);
  return (a * (1 - f) + b * f) * 2 * intensity;
}

/**
 * Screen shake — translate + slight rotate for impact frames.
 * Apply to the whole frame's container.
 */
export function screenShake(
  frame: number,
  { start, dur = 8, intensity = 12 }: RangeOpts & { intensity?: number }
) {
  if (frame < start || frame > start + dur) return { tx: 0, ty: 0, rot: 0 };
  const p = 1 - (frame - start) / dur; // decay
  const a = random(`ss-${frame}`);
  const b = random(`ss-${frame}-2`);
  const c = random(`ss-${frame}-3`);
  return {
    tx: (a - 0.5) * 2 * intensity * p,
    ty: (b - 0.5) * 2 * intensity * p,
    rot: (c - 0.5) * 2 * 1.2 * p,
  };
}

/**
 * Swipe-reveal — masks a directional reveal of content. Returns a CSS
 * clip-path inset string so you can apply it to a container.
 *
 *   <div style={{ clipPath: swipeReveal(frame, { start: 10, dur: 14, from: 'right' }) }}>
 */
export function swipeReveal(
  frame: number,
  { start, dur = 14, from = 'left' as 'left' | 'right' | 'top' | 'bottom' }: RangeOpts & { from?: 'left' | 'right' | 'top' | 'bottom' }
) {
  const p = interpolate(frame, [start, start + dur], [100, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  switch (from) {
    case 'left':   return `inset(0 0 0 ${p}%)`;
    case 'right':  return `inset(0 ${p}% 0 0)`;
    case 'top':    return `inset(${p}% 0 0 0)`;
    case 'bottom': return `inset(0 0 ${p}% 0)`;
  }
}

/**
 * Iris wipe — circular reveal. Returns clip-path: circle(...).
 */
export function irisWipe(
  frame: number,
  { start, dur = 18, expanding = true }: RangeOpts & { expanding?: boolean }
) {
  const from = expanding ? 0 : 150;
  const to = expanding ? 150 : 0;
  const r = interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return `circle(${r}% at 50% 50%)`;
}

/**
 * Drop-and-settle — element drops from above, overshoots, settles.
 * Returns translateY + scale.
 */
export function dropAndSettle(
  frame: number,
  { start, dur = 24, from = -200 }: RangeOpts & { from?: number }
) {
  const tyP = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.elastic,
  });
  return {
    ty: from + (0 - from) * tyP,
    scale: 0.9 + 0.1 * tyP,
  };
}

/**
 * Blur-in — fade combined with blur reduction. Premium product reveal.
 */
export function blurIn(frame: number, { start, dur = 18 }: RangeOpts) {
  const p = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return { opacity: p, blur: (1 - p) * 24 };
}

/**
 * Beat pulse — scale spike at every `interval` frames. For BPM-synced
 * elements when the prompt asks for "beat", "pulse", "sync".
 *
 *   const s = beatPulse(frame, { bpm: 120, fps: 30 });
 */
export function beatPulse(
  frame: number,
  { bpm = 120, fps = 30, amount = 0.06 }: { bpm?: number; fps?: number; amount?: number }
) {
  const interval = (60 / bpm) * fps;
  const phase = (frame % interval) / interval; // 0..1
  // Quick spike at the start, decay over the beat
  const spike = Math.max(0, 1 - phase * 3);
  return 1 + spike * amount;
}

/**
 * Kerning expand — letter-spacing animates wide → tight on entry.
 * Returns the letterSpacing in px to apply.
 */
export function kerningIn(frame: number, { start, dur = 18, from = 30, to = 0 }: RangeOpts & { from?: number; to?: number }) {
  return interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
}

/**
 * Counter — animates a number 0 → target with easing. Use for stats,
 * dollar amounts, percentages. Returns the formatted display string.
 */
export function counter(
  frame: number,
  { start, dur = 30, to, prefix = '', suffix = '', decimals = 0 }: { start: number; dur?: number; to: number; prefix?: string; suffix?: string; decimals?: number }
) {
  const v = interpolate(frame, [start, start + dur], [0, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return `${prefix}${v.toFixed(decimals)}${suffix}`;
}
