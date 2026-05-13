/**
 * Hand-drawn / sketchy motion + decorative SVG. Frame-by-frame jitter
 * simulates "drawn" feel — like the camera is shaking, the lines wobble.
 * Plus decorative scribbles, asterisks, doodle arrows, sketch frames.
 *
 *   <ScribbleUnderline frame={frame} width={300} color={p.accent} />
 *   <Asterisk frame={frame} size={60} />
 *   <SketchArrow frame={frame} from={{x:0,y:0}} to={{x:200,y:80}} />
 *   <SketchFrame frame={frame} width={400} height={200} />
 */

import React, { type CSSProperties } from 'react';
import { random } from 'remotion';

// ─── Jitter helper — returns a deterministic-per-frame offset ────────
// "Hand-drawn" effect: pick a new offset every Nth frame so the element
// visibly wobbles like it's redrawn each cel. Default 3 frames per redraw.
export function sketchJitter(frame: number, { amount = 2, seed = 'j', step = 3 }: { amount?: number; seed?: string; step?: number } = {}) {
  const f = Math.floor(frame / step);
  return {
    x: (random(`${seed}-x-${f}`) - 0.5) * 2 * amount,
    y: (random(`${seed}-y-${f}`) - 0.5) * 2 * amount,
    rotate: (random(`${seed}-r-${f}`) - 0.5) * 2 * (amount * 0.4),
  };
}

// ─── ScribbleUnderline — wavy hand-drawn line under text ─────────────
export const ScribbleUnderline: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  seed?: string;
  jitterStep?: number;
  style?: CSSProperties;
}> = ({
  frame, width = 240, height = 24, color = '#ffd43d', thickness = 4,
  seed = 'scribble', jitterStep = 3, style,
}) => {
  const f = Math.floor(frame / jitterStep);
  const segs = 8;
  const pts: string[] = [];
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * width;
    const yBase = height / 2;
    const yJit = (random(`${seed}-${f}-${i}`) - 0.5) * 6;
    pts.push(`${x},${yBase + yJit}`);
  }
  // Smooth bezier-ish path through the points
  let d = `M ${pts[0]}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].split(',').map(Number);
    const cur  = pts[i].split(',').map(Number);
    const cx = (prev[0] + cur[0]) / 2;
    d += ` Q ${cx} ${prev[1]} ${cur[0]} ${cur[1]}`;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" />
    </svg>
  );
};

// ─── Scribble (closed-loop wobbly scribble around something) ─────────
export const Scribble: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  amplitude?: number;
  style?: CSSProperties;
}> = ({ frame, width = 200, height = 60, color = '#ffd43d', thickness = 4, amplitude = 8, style }) => {
  const f = Math.floor(frame / 3);
  const segs = 24;
  const cx = width / 2, cy = height / 2;
  const rx = width / 2 - 6, ry = height / 2 - 6;
  let d = '';
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const jit = (random(`sc-${f}-${i}`) - 0.5) * amplitude;
    const x = cx + Math.cos(a) * (rx + jit);
    const y = cy + Math.sin(a) * (ry + jit);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" />
    </svg>
  );
};

// ─── Asterisk (decorative spinning star) ─────────────────────────────
export const Asterisk: React.FC<{
  frame?: number;
  size?: number;
  color?: string;
  arms?: number;
  thickness?: number;
  spin?: number;
  style?: CSSProperties;
}> = ({ frame = 0, size = 60, color = '#ff5e5b', arms = 6, thickness = 6, spin = 2, style }) => {
  const rotation = frame * spin;
  const half = size / 2;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI;
    const x1 = half + Math.cos(a) * (half - 4);
    const y1 = half + Math.sin(a) * (half - 4);
    const x2 = half - Math.cos(a) * (half - 4);
    const y2 = half - Math.sin(a) * (half - 4);
    lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={thickness} strokeLinecap="round" />);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: `rotate(${rotation}deg)`, ...style }}>
      {lines}
    </svg>
  );
};

// ─── PlusSign — decorative + (motion graphics motif) ─────────────────
export const PlusSign: React.FC<{
  size?: number;
  color?: string;
  thickness?: number;
  style?: CSSProperties;
}> = ({ size = 40, color = '#ff5e5b', thickness = 6, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth={thickness} strokeLinecap="round" />
    <line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={thickness} strokeLinecap="round" />
  </svg>
);

// ─── SketchArrow — hand-drawn arrow from A to B (with hand-jitter) ───
export const SketchArrow: React.FC<{
  frame?: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  thickness?: number;
  width?: number;
  height?: number;
  jitter?: boolean;
  style?: CSSProperties;
}> = ({
  frame = 0, from, to, color = '#fff', thickness = 4,
  width = 400, height = 200, jitter = true, style,
}) => {
  const f = Math.floor(frame / 3);
  const j = jitter ? 2 : 0;
  const segs = 6;
  // Build a slightly curvy path from `from` to `to`
  let d = `M ${from.x + (random(`a-${f}-0`) - 0.5) * j} ${from.y + (random(`a-${f}-y0`) - 0.5) * j}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = from.x + (to.x - from.x) * t + (random(`a-${f}-${i}`) - 0.5) * j * 2;
    const y = from.y + (to.y - from.y) * t + (random(`a-${f}-y${i}`) - 0.5) * j * 2;
    d += ` L ${x} ${y}`;
  }
  // Arrowhead: two short lines back from the endpoint
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLen = 18;
  const hx1 = to.x - Math.cos(angle - Math.PI / 6) * headLen;
  const hy1 = to.y - Math.sin(angle - Math.PI / 6) * headLen;
  const hx2 = to.x - Math.cos(angle + Math.PI / 6) * headLen;
  const hy2 = to.y - Math.sin(angle + Math.PI / 6) * headLen;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={to.x} y1={to.y} x2={hx1} y2={hy1} stroke={color} strokeWidth={thickness} strokeLinecap="round" />
      <line x1={to.x} y1={to.y} x2={hx2} y2={hy2} stroke={color} strokeWidth={thickness} strokeLinecap="round" />
    </svg>
  );
};

// ─── SketchFrame — wobbly hand-drawn rectangle border ────────────────
export const SketchFrame: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  padding?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({
  frame, width = 400, height = 200, color = '#fff', thickness = 4,
  padding = 20, style, children,
}) => {
  const f = Math.floor(frame / 3);
  // 4 sides with mid-jitter on each
  const j = 4;
  const tl = `${padding + (random(`f-${f}-tl-x`) - 0.5) * j},${padding + (random(`f-${f}-tl-y`) - 0.5) * j}`;
  const tr = `${width - padding + (random(`f-${f}-tr-x`) - 0.5) * j},${padding + (random(`f-${f}-tr-y`) - 0.5) * j}`;
  const br = `${width - padding + (random(`f-${f}-br-x`) - 0.5) * j},${height - padding + (random(`f-${f}-br-y`) - 0.5) * j}`;
  const bl = `${padding + (random(`f-${f}-bl-x`) - 0.5) * j},${height - padding + (random(`f-${f}-bl-y`) - 0.5) * j}`;
  const d = `M ${tl} L ${tr} L ${br} L ${bl} Z`;
  return (
    <div style={{ position: 'relative', width, height, ...style }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={d} stroke={color} strokeWidth={thickness} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'relative', padding }}>{children}</div>
    </div>
  );
};

// ─── Doodle dots (3 hand-placed dots — for emphasis or "..." pause) ──
export const DoodleDots: React.FC<{
  size?: number;
  color?: string;
  count?: number;
  spacing?: number;
  style?: CSSProperties;
}> = ({ size = 10, color = '#fff', count = 3, spacing = 16, style }) => (
  <div style={{ display: 'inline-flex', gap: spacing, ...style }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        width: size, height: size,
        background: color,
        borderRadius: '50%',
        transform: `translateY(${(random('d-' + i) - 0.5) * 4}px)`,
      }} />
    ))}
  </div>
);

// ─── HandCircled (wobbly circle around an element) ───────────────────
export const HandCircled: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({ frame, width = 200, height = 100, color = '#ff5e5b', thickness = 4, style, children }) => (
  <div style={{ position: 'relative', display: 'inline-block', padding: 12, ...style }}>
    {children}
    <Scribble frame={frame} width={width} height={height} color={color} thickness={thickness}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
  </div>
);

// ─── Sketchy element wrapper — apply frame-by-frame jitter to children
export const Sketchy: React.FC<{
  frame: number;
  amount?: number;
  step?: number;
  seed?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({ frame, amount = 2, step = 3, seed = 'sketchy', style, children }) => {
  const j = sketchJitter(frame, { amount, step, seed });
  return (
    <div style={{
      transform: `translate(${j.x}px, ${j.y}px) rotate(${j.rotate}deg)`,
      ...style,
    }}>{children}</div>
  );
};

// ─── Doodle star — hand-drawn lopsided five-point star ───────────────
export const DoodleStar: React.FC<{
  size?: number;
  color?: string;
  thickness?: number;
  filled?: boolean;
  rotation?: number;
  style?: CSSProperties;
}> = ({ size = 50, color = '#ffd43d', thickness = 4, filled = false, rotation = -8, style }) => {
  const cx = 25, cy = 25;
  const outer = 22, inner = 9;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    // Slight intentional asymmetry for hand-drawn feel
    const jx = (random(`star-${i}`) - 0.5) * 3;
    const jy = (random(`star-${i}-y`) - 0.5) * 3;
    pts.push(`${cx + r * Math.cos(a) + jx},${cy + r * Math.sin(a) + jy}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 50 50"
      style={{ transform: `rotate(${rotation}deg)`, ...style }}>
      <polygon points={pts.join(' ')} fill={filled ? color : 'none'} stroke={color} strokeWidth={thickness} strokeLinejoin="round" />
    </svg>
  );
};

// ─── Sparkle/twinkle motif (4-point) ─────────────────────────────────
export const TwinkleMark: React.FC<{
  size?: number;
  color?: string;
  style?: CSSProperties;
}> = ({ size = 30, color = '#ffd43d', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <path d="M12 3 L13.5 10 L20 12 L13.5 14 L12 21 L10.5 14 L4 12 L10.5 10 Z" fill={color} />
  </svg>
);
