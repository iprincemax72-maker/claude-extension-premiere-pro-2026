/**
 * Loaders / spinners / progress states — common UI loading patterns.
 * Pass `frame` to drive the animation.
 *
 *   <Spinner frame={frame} color={p.accent} size={48} />
 *   <DotTyping frame={frame} />     // "..." 3-dot typing indicator
 *   <Skeleton width={400} height={20} frame={frame} />
 */

import React, { type CSSProperties } from 'react';

// ─── Circular spinner (rotating arc) ──────────────────────────────────
export const Spinner: React.FC<{
  frame: number;
  size?: number;
  color?: string;
  thickness?: number;
  speed?: number;     // degrees per frame
  style?: CSSProperties;
}> = ({ frame, size = 48, color = '#d97757', thickness = 4, speed = 12, style }) => {
  const r = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: `rotate(${frame * speed}deg)`, ...style }}>
      <circle
        cx={size/2} cy={size/2} r={r}
        stroke={color} strokeWidth={thickness} fill="none"
        strokeDasharray={`${circumference * 0.25} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  );
};

// ─── Three dots typing indicator ──────────────────────────────────────
export const DotTyping: React.FC<{
  frame: number;
  color?: string;
  size?: number;
  gap?: number;
  speed?: number;
  style?: CSSProperties;
}> = ({ frame, color = '#888', size = 8, gap = 6, speed = 0.18, style }) => (
  <div style={{ display: 'inline-flex', gap, alignItems: 'center', ...style }}>
    {[0, 1, 2].map(i => {
      const phase = Math.sin(frame * speed - i * 0.6);
      const y = -phase * 4;
      const op = 0.4 + (phase + 1) / 2 * 0.6;
      return (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: color, opacity: op,
          transform: `translateY(${y}px)`,
        }} />
      );
    })}
  </div>
);

// ─── Pulsing dots (alternating brightness, no bounce) ─────────────────
export const PulseDots: React.FC<{
  frame: number;
  count?: number;
  color?: string;
  size?: number;
  gap?: number;
  style?: CSSProperties;
}> = ({ frame, count = 3, color = '#d97757', size = 12, gap = 10, style }) => (
  <div style={{ display: 'inline-flex', gap, ...style }}>
    {Array.from({ length: count }).map((_, i) => {
      const phase = (frame * 0.08 + i / count) % 1;
      const scale = 0.5 + Math.abs(Math.sin(phase * Math.PI)) * 0.5;
      return (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: color,
          transform: `scale(${scale})`,
        }} />
      );
    })}
  </div>
);

// ─── Bar loader (3 vertical bars bouncing — equalizer style) ──────────
export const BarLoader: React.FC<{
  frame: number;
  bars?: number;
  color?: string;
  width?: number;
  height?: number;
  gap?: number;
  style?: CSSProperties;
}> = ({ frame, bars = 4, color = '#d97757', width = 6, height = 28, gap = 4, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap, height, ...style }}>
    {Array.from({ length: bars }).map((_, i) => {
      const phase = (frame * 0.12 + i * 0.3) % (Math.PI * 2);
      const h = (Math.abs(Math.sin(phase)) * 0.7 + 0.3) * height;
      return (
        <div key={i} style={{
          width, height: h,
          background: color, borderRadius: width / 2,
          transition: 'height 0.05s linear',
        }} />
      );
    })}
  </div>
);

// ─── Skeleton block (shimmer-loading rectangle) ───────────────────────
export const Skeleton: React.FC<{
  frame: number;
  width?: number | string;
  height?: number | string;
  radius?: number;
  bg?: string;
  shimmer?: string;
  style?: CSSProperties;
}> = ({ frame, width = '100%', height = 16, radius = 6, bg = 'rgba(255,255,255,0.06)', shimmer = 'rgba(255,255,255,0.16)', style }) => {
  const x = ((frame * 6) % 200) - 100;
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: bg,
      overflow: 'hidden', position: 'relative',
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(90deg, transparent 0%, ${shimmer} 50%, transparent 100%)`,
        transform: `translateX(${x}%)`,
      }} />
    </div>
  );
};

// ─── Card skeleton — composed (avatar circle + 2 text lines) ──────────
export const SkeletonCard: React.FC<{
  frame: number;
  width?: number | string;
  style?: CSSProperties;
}> = ({ frame, width = 360, style }) => (
  <div style={{ width, display: 'flex', gap: 12, alignItems: 'center', ...style }}>
    <Skeleton frame={frame} width={48} height={48} radius={24} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton frame={frame} width="70%" height={14} />
      <Skeleton frame={frame} width="40%" height={12} />
    </div>
  </div>
);

// ─── Filling progress bar (auto-fills based on frame) ─────────────────
export const ProgressFill: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  target?: number;        // 0..1
  width?: number | string;
  height?: number;
  bg?: string;
  fill?: string;
  radius?: number;
  style?: CSSProperties;
}> = ({ frame, start = 0, dur = 60, target = 1, width = 320, height = 8, bg = 'rgba(255,255,255,0.08)', fill = '#d97757', radius = 4, style }) => {
  const p = Math.max(0, Math.min(target, (frame - start) / dur * target));
  return (
    <div style={{ width, height, background: bg, borderRadius: radius, overflow: 'hidden', ...style }}>
      <div style={{
        width: `${p * 100}%`, height: '100%',
        background: fill, borderRadius: radius,
      }} />
    </div>
  );
};

// ─── Indeterminate progress bar (sliding stripe) ──────────────────────
export const IndeterminateBar: React.FC<{
  frame: number;
  width?: number | string;
  height?: number;
  bg?: string;
  fill?: string;
  radius?: number;
  speed?: number;
  style?: CSSProperties;
}> = ({ frame, width = 320, height = 4, bg = 'rgba(255,255,255,0.06)', fill = '#d97757', radius = 2, speed = 2, style }) => {
  const x = ((frame * speed) % 130) - 30;
  return (
    <div style={{ width, height, background: bg, borderRadius: radius, overflow: 'hidden', position: 'relative', ...style }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${x}%`, width: '30%',
        background: fill, borderRadius: radius,
      }} />
    </div>
  );
};
