/**
 * Particle systems — confetti, sparks, smoke, snow, balloon-rise, etc.
 * Each particle effect is a self-contained component that takes `frame`
 * and renders absolutely-positioned dots / shapes.
 *
 * Usage:
 *   <Confetti frame={frame} start={20} count={80} />
 *   <Explosion frame={frame} start={5} cx="50%" cy="40%" />
 *   <Smoke frame={frame} cx="20%" cy="80%" />
 */

import React from 'react';
import { AbsoluteFill, random } from 'remotion';

type Pos = { cx?: string | number; cy?: string | number };

// ─── Confetti — colored squares falling from the top ──────────────────
export const Confetti: React.FC<{
  frame: number;
  start?: number;
  count?: number;
  colors?: string[];
  fallSpeed?: number;
  spread?: number;
}> = ({
  frame, start = 0, count = 80, colors = ['#ff3d8a', '#ffe600', '#5eb6e8', '#6b3df5', '#8ace00', '#ff5e5b'],
  fallSpeed = 4, spread = 100,
}) => {
  if (frame < start) return null;
  const t = frame - start;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`c-x-${i}`) * spread;
        const drift = (random(`c-d-${i}`) - 0.5) * 200;
        const delay = random(`c-de-${i}`) * 20;
        const speed = fallSpeed + random(`c-s-${i}`) * 3;
        const rotSpeed = (random(`c-r-${i}`) - 0.5) * 20;
        const color = colors[Math.floor(random(`c-c-${i}`) * colors.length)];
        const tt = Math.max(0, t - delay);
        const w = 8 + random(`c-w-${i}`) * 10;
        const h = 5 + random(`c-h-${i}`) * 10;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${x}%`, top: -20,
            width: w, height: h,
            background: color,
            transform: `translate(${(tt / 60) * drift}px, ${tt * speed}px) rotate(${tt * rotSpeed}deg)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ─── Explosion — burst outward from center ────────────────────────────
export const Explosion: React.FC<{
  frame: number;
  start?: number;
  count?: number;
  cx?: string | number;
  cy?: string | number;
  spread?: number;
  colors?: string[];
  dur?: number;
}> = ({
  frame, start = 0, count = 30, cx = '50%', cy = '50%',
  spread = 300, colors = ['#ff5e5b', '#ffe600', '#fff'], dur = 28,
}) => {
  if (frame < start) return null;
  const t = (frame - start) / dur;
  if (t > 1) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + random(`e-a-${i}`) * 0.4;
        const dist = spread * (0.5 + random(`e-d-${i}`) * 0.5) * t;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const size = 6 + random(`e-s-${i}`) * 10;
        const color = colors[Math.floor(random(`e-c-${i}`) * colors.length)];
        return (
          <div key={i} style={{
            position: 'absolute', left: cx, top: cy,
            width: size, height: size, borderRadius: '50%',
            background: color,
            transform: `translate(${x - size/2}px, ${y - size/2}px)`,
            opacity: 1 - t,
          }} />
        );
      })}
    </div>
  );
};

// ─── Smoke — soft puffs rising and dissipating ────────────────────────
export const Smoke: React.FC<{
  frame: number;
  count?: number;
  cx?: string | number;
  cy?: string | number;
  color?: string;
}> = ({ frame, count = 30, cx = '50%', cy = '90%', color = 'rgba(255,255,255,0.45)' }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {Array.from({ length: count }).map((_, i) => {
      const cycle = 90;
      const phase = (frame + i * 5) % cycle;
      const t = phase / cycle;
      const drift = (random(`sm-d-${i}`) - 0.5) * 80;
      const rise = t * 200;
      const size = 40 + random(`sm-s-${i}`) * 60;
      return (
        <div key={i} style={{
          position: 'absolute', left: cx, top: cy,
          width: size, height: size, borderRadius: '50%',
          background: color,
          transform: `translate(${drift - size/2}px, ${-rise}px) scale(${1 + t})`,
          opacity: (1 - t) * 0.6,
          filter: 'blur(8px)',
        }} />
      );
    })}
  </div>
);

// ─── Sparks — small fast streaks (for hits, impact) ───────────────────
export const Sparks: React.FC<{
  frame: number;
  start?: number;
  count?: number;
  cx?: string | number;
  cy?: string | number;
  color?: string;
  spread?: number;
  dur?: number;
}> = ({
  frame, start = 0, count = 20, cx = '50%', cy = '50%',
  color = '#ffd43d', spread = 200, dur = 14,
}) => {
  if (frame < start) return null;
  const t = (frame - start) / dur;
  if (t > 1) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + random(`sp-a-${i}`) * 0.8;
        const dist = spread * (0.3 + random(`sp-d-${i}`) * 0.7) * t;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const len = 12 + random(`sp-l-${i}`) * 16;
        return (
          <div key={i} style={{
            position: 'absolute', left: cx, top: cy,
            width: len, height: 2,
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transform: `translate(${x}px, ${y}px) rotate(${angle * 180 / Math.PI}deg)`,
            opacity: 1 - t,
          }} />
        );
      })}
    </div>
  );
};

// ─── Snow — soft falling flakes ───────────────────────────────────────
export const Snow: React.FC<{ frame: number; count?: number; color?: string }> = ({
  frame, count = 100, color = '#fff',
}) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {Array.from({ length: count }).map((_, i) => {
      const x = random(`sn-x-${i}`) * 100;
      const speed = 0.4 + random(`sn-v-${i}`) * 0.8;
      const yBase = random(`sn-y-${i}`) * 100;
      const y = (yBase + frame * speed) % 110;
      const wobble = Math.sin(frame * 0.05 + i) * 8;
      const size = 2 + random(`sn-s-${i}`) * 4;
      return (
        <div key={i} style={{
          position: 'absolute',
          left: `${x}%`, top: `${y}%`,
          width: size, height: size, borderRadius: '50%',
          background: color,
          transform: `translateX(${wobble}px)`,
          opacity: 0.6 + random(`sn-o-${i}`) * 0.4,
        }} />
      );
    })}
  </AbsoluteFill>
);

// ─── Balloons rising ─────────────────────────────────────────────────
export const Balloons: React.FC<{
  frame: number;
  count?: number;
  colors?: string[];
}> = ({ frame, count = 12, colors = ['#ff5e5b', '#ffe600', '#5eb6e8', '#28c840', '#ff3d8a'] }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {Array.from({ length: count }).map((_, i) => {
      const x = random(`b-x-${i}`) * 100;
      const speed = 0.6 + random(`b-v-${i}`) * 0.6;
      const yBase = random(`b-y-${i}`) * 100 + 110;
      const y = (yBase - frame * speed) % 140 - 20;
      const wobble = Math.sin(frame * 0.04 + i) * 14;
      const size = 36 + random(`b-s-${i}`) * 24;
      const color = colors[Math.floor(random(`b-c-${i}`) * colors.length)];
      return (
        <div key={i} style={{
          position: 'absolute',
          left: `${x}%`, top: `${y}%`,
          transform: `translateX(${wobble}px)`,
        }}>
          {/* Balloon */}
          <div style={{
            width: size, height: size * 1.2,
            background: color,
            borderRadius: '50% 50% 50% 50% / 55% 55% 45% 45%',
            position: 'relative',
            boxShadow: 'inset -6px -8px 16px rgba(0,0,0,0.15), 8px 8px 18px rgba(0,0,0,0.18)',
          }}>
            <div style={{
              position: 'absolute', top: '15%', left: '30%',
              width: 8, height: 14, background: 'rgba(255,255,255,0.4)',
              borderRadius: '50%',
              filter: 'blur(2px)',
            }} />
          </div>
          {/* String */}
          <div style={{
            width: 1, height: 60,
            background: 'rgba(0,0,0,0.3)',
            marginLeft: size / 2,
          }} />
        </div>
      );
    })}
  </AbsoluteFill>
);

// ─── Generic emitter — pass your own particle render function ─────────
export const Emitter: React.FC<{
  frame: number;
  count: number;
  render: (i: number, frame: number) => React.ReactNode;
}> = ({ frame, count, render }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {Array.from({ length: count }).map((_, i) => <React.Fragment key={i}>{render(i, frame)}</React.Fragment>)}
  </div>
);
