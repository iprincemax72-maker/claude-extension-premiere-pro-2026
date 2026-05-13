/**
 * Animation presets — named composed motions. Instead of writing 6 lines of
 * interpolate() for a hero entrance, call one preset that returns the
 * { transform, opacity, ... } CSS for the current frame.
 *
 * Each preset takes (frame, opts) and returns a CSSProperties object you
 * spread onto an element's style.
 *
 *   const heroStyle = PRESETS.heroEntrance(frame, { start: 0, dur: 24 });
 *   <div style={{ ...heroStyle, ...TYPE.titleHero, color: p.fg }}>HELLO</div>
 *
 * Why use these: consistency. Every "hero entrance" across renders looks
 * the same so the user's brand stays cohesive even on different prompts.
 */

import type { CSSProperties } from 'react';
import { interpolate, random } from 'remotion';
import { EASE } from './easings';

type RangeOpts = { start: number; dur: number };

function _clamp(v: number, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }

export const PRESETS = {
  // ─── HERO entrance — premium reveal: blur-in + slight scale + fade ──
  heroEntrance: (frame: number, { start = 0, dur = 24 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    return {
      opacity: p,
      filter: `blur(${(1 - p) * 16}px)`,
      transform: `scale(${0.94 + p * 0.06})`,
    };
  },

  // ─── SLAM — drops in fast, overshoots, settles ──────────────────────
  slam: (frame: number, { start = 0, dur = 18 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.elastic,
    });
    return {
      opacity: _clamp(p * 2),
      transform: `scale(${0.6 + p * 0.4}) rotate(${(1 - p) * -8}deg)`,
    };
  },

  // ─── POP — quick scale-in with bounce ───────────────────────────────
  pop: (frame: number, { start = 0, dur = 12 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.spring,
    });
    return {
      opacity: _clamp(p * 2),
      transform: `scale(${p})`,
    };
  },

  // ─── FADE UP — simple fade with slight upward slide ─────────────────
  fadeUp: (frame: number, { start = 0, dur = 18, from = 24 }: Partial<RangeOpts> & { from?: number } = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
    });
    return {
      opacity: p,
      transform: `translateY(${(1 - p) * (from ?? 24)}px)`,
    };
  },

  // ─── FADE DOWN — fade with downward slide ───────────────────────────
  fadeDown: (frame: number, { start = 0, dur = 18, from = 24 }: Partial<RangeOpts> & { from?: number } = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
    });
    return {
      opacity: p,
      transform: `translateY(${(p - 1) * (from ?? 24)}px)`,
    };
  },

  // ─── HOLD — element sits, optional subtle breathe ───────────────────
  hold: (frame: number, { breathe = 0.02, speed = 1.5 }: { breathe?: number; speed?: number } = {}): CSSProperties => {
    const s = 1 + Math.sin(frame * 0.01 * speed) * breathe;
    return { transform: `scale(${s})` };
  },

  // ─── EXIT FADE — fade out across the end of the clip ────────────────
  exitFade: (frame: number, { totalFrames, fadeOutFrames = 12 }: { totalFrames: number; fadeOutFrames?: number }): CSSProperties => ({
    opacity: interpolate(frame, [totalFrames - fadeOutFrames, totalFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
    }),
  }),

  // ─── EXIT FLY-OUT — exits via translate + fade ──────────────────────
  exitFlyOut: (frame: number, { totalFrames, dur = 14, direction = 'up' as 'up'|'down'|'left'|'right' }: { totalFrames: number; dur?: number; direction?: 'up'|'down'|'left'|'right' }): CSSProperties => {
    const p = interpolate(frame, [totalFrames - dur, totalFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    const dist = 80 * p;
    const tx = direction === 'left' ? -dist : direction === 'right' ? dist : 0;
    const ty = direction === 'up'   ? -dist : direction === 'down'  ? dist : 0;
    return {
      opacity: 1 - p,
      transform: `translate(${tx}px, ${ty}px)`,
    };
  },

  // ─── CALLOUT — drop, shake-settle, hold, then fly out at end ────────
  callout: (frame: number, { start = 0, dur = 14, totalFrames, exitDur = 10 }: { start?: number; dur?: number; totalFrames: number; exitDur?: number }): CSSProperties => {
    const inP = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.elastic,
    });
    const outP = interpolate(frame, [totalFrames - exitDur, totalFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
    });
    return {
      opacity: _clamp(inP * 2) * (1 - outP),
      transform: `translateY(${(1 - inP) * -40 + outP * 20}px) scale(${0.7 + inP * 0.3})`,
    };
  },

  // ─── HERO + EXIT — full life cycle. enter, hold, exit ───────────────
  enterHoldExit: (frame: number, opts: { start?: number; dur?: number; totalFrames: number; exitDur?: number } = { totalFrames: 90 }): CSSProperties => {
    const { start = 0, dur = 18, totalFrames, exitDur = 12 } = opts;
    const inP = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    const outP = interpolate(frame, [totalFrames - exitDur, totalFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
    });
    return {
      opacity: inP * (1 - outP),
      transform: `translateY(${(1 - inP) * 28 + outP * -16}px) scale(${0.96 + inP * 0.04})`,
    };
  },

  // ─── REVEAL — stripe wipes across, then content shows ───────────────
  reveal: (frame: number, { start = 0, dur = 18, from = 'left' as 'left'|'right'|'top'|'bottom' }: Partial<RangeOpts> & { from?: 'left'|'right'|'top'|'bottom' } = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [100, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    const inset =
      from === 'left'   ? `inset(0 0 0 ${p}%)` :
      from === 'right'  ? `inset(0 ${p}% 0 0)` :
      from === 'top'    ? `inset(${p}% 0 0 0)` :
                          `inset(0 0 ${p}% 0)`;
    return { clipPath: inset, WebkitClipPath: inset };
  },

  // ─── IRIS — circular reveal from center ─────────────────────────────
  iris: (frame: number, { start = 0, dur = 20 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 150], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    return { clipPath: `circle(${p}% at 50% 50%)`, WebkitClipPath: `circle(${p}% at 50% 50%)` };
  },

  // ─── PULSE — repeated heartbeat scale ───────────────────────────────
  pulse: (frame: number, { bpm = 70, amount = 0.05 }: { bpm?: number; amount?: number } = {}): CSSProperties => {
    const period = (60 / bpm) * 30; // frames per beat (at 30fps)
    const t = (frame % period) / period;
    // Double-beat shape: spike at 0.1, smaller at 0.35
    const beat = Math.max(0, Math.cos(t * Math.PI * 8)) * (1 - t);
    return { transform: `scale(${1 + beat * amount})` };
  },

  // ─── SHAKE — quick horizontal jitter (impact / emphasis) ────────────
  shake: (frame: number, { start = 0, dur = 8, intensity = 8 }: Partial<RangeOpts> & { intensity?: number } = {}): CSSProperties => {
    if (frame < start || frame > start + dur) return {};
    const decay = 1 - (frame - start) / dur;
    const x = (random(`shake-${frame}`) - 0.5) * 2 * intensity * decay;
    return { transform: `translateX(${x}px)` };
  },

  // ─── FLIP — 3D flip on Y axis (card turn) ───────────────────────────
  flip: (frame: number, { start = 0, dur = 22 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
    });
    return {
      transform: `perspective(900px) rotateY(${(1 - p) * -90}deg)`,
      opacity: _clamp(p * 2),
      transformOrigin: '50% 50%',
    };
  },

  // ─── STICKER SLAM — diagonal rotation drop with overshoot ───────────
  stickerSlam: (frame: number, { start = 0, dur = 16 }: Partial<RangeOpts> = {}): CSSProperties => {
    const p = interpolate(frame, [start, start + dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.elastic,
    });
    return {
      opacity: _clamp(p * 2),
      transform: `scale(${0.4 + p * 0.6}) rotate(${(1 - p) * -25}deg)`,
    };
  },

  // ─── KENBURNS — slow zoom + pan (for stills you want alive) ─────────
  kenBurns: (frame: number, { totalFrames, zoomFrom = 1.05, zoomTo = 1.18, panX = 30, panY = -20 }: { totalFrames: number; zoomFrom?: number; zoomTo?: number; panX?: number; panY?: number }): CSSProperties => {
    const p = frame / totalFrames;
    const scale = zoomFrom + (zoomTo - zoomFrom) * p;
    const x = panX * p;
    const y = panY * p;
    return { transform: `scale(${scale}) translate(${x}px, ${y}px)` };
  },

  // ─── PARALLAX — slower-than-foreground scroll for background layer ──
  parallax: (frame: number, { speed = 0.5, axis = 'y' as 'x'|'y' }: { speed?: number; axis?: 'x'|'y' } = {}): CSSProperties => ({
    transform: axis === 'y' ? `translateY(${frame * speed}px)` : `translateX(${frame * speed}px)`,
  }),
};
