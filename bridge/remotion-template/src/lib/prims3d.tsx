/**
 * Mock-3D primitives — pseudo-3D shapes built from CSS / SVG that don't
 * need a 3D engine. Cube, sphere, cylinder, pyramid, isometric box.
 * Pass `frame` for rotation animation.
 *
 *   <Cube3D frame={frame} size={200} color={p.accent} />
 *   <ShadedSphere frame={frame} size={300} color={p.accent} />
 *   <IsoCube size={140} color={p.accent} />
 */

import React, { type CSSProperties } from 'react';

// ─── 3D cube (CSS transform-based) ────────────────────────────────────
export const Cube3D: React.FC<{
  frame?: number;
  size?: number;
  color?: string;
  rotation?: number;       // degrees per frame
  staticAngle?: { x?: number; y?: number; z?: number };  // when frame is omitted
  style?: CSSProperties;
}> = ({
  frame = 0, size = 200, color = '#d97757', rotation = 1,
  staticAngle, style,
}) => {
  const ax = staticAngle?.x ?? frame * rotation * 0.7;
  const ay = staticAngle?.y ?? frame * rotation;
  const az = staticAngle?.z ?? 0;
  const half = size / 2;
  const faces: { transform: string; brightness: number }[] = [
    { transform: `translateZ(${half}px)`, brightness: 1.0 },
    { transform: `rotateY(180deg) translateZ(${half}px)`, brightness: 0.6 },
    { transform: `rotateY(90deg)  translateZ(${half}px)`, brightness: 0.8 },
    { transform: `rotateY(-90deg) translateZ(${half}px)`, brightness: 0.8 },
    { transform: `rotateX(90deg)  translateZ(${half}px)`, brightness: 1.2 },
    { transform: `rotateX(-90deg) translateZ(${half}px)`, brightness: 0.5 },
  ];
  return (
    <div style={{
      width: size, height: size,
      perspective: '900px',
      ...style,
    }}>
      <div style={{
        width: size, height: size,
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: `rotateX(${ax}deg) rotateY(${ay}deg) rotateZ(${az}deg)`,
      }}>
        {faces.map((f, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: size, height: size,
            background: color,
            filter: `brightness(${f.brightness})`,
            transform: f.transform,
            opacity: 0.95,
          }} />
        ))}
      </div>
    </div>
  );
};

// ─── Shaded sphere — SVG with radial gradient ─────────────────────────
export const ShadedSphere: React.FC<{
  frame?: number;
  size?: number;
  color?: string;
  highlight?: string;
  shadow?: string;
  style?: CSSProperties;
}> = ({
  frame = 0, size = 200, color = '#d97757',
  highlight = '#fff', shadow = '#000', style,
}) => {
  // Light source orbits subtly
  const lx = 30 + Math.sin(frame * 0.02) * 8;
  const ly = 25 + Math.cos(frame * 0.02) * 5;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <defs>
        <radialGradient id={`sphere-${size}-${color}`} cx={`${lx}%`} cy={`${ly}%`}>
          <stop offset="0%" stopColor={highlight} stopOpacity="0.9"/>
          <stop offset="35%" stopColor={color} stopOpacity="1"/>
          <stop offset="90%" stopColor={shadow} stopOpacity="0.95"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#sphere-${size}-${color})`} />
      {/* Subtle floor shadow */}
      <ellipse cx="50" cy="98" rx="35" ry="4" fill="rgba(0,0,0,0.25)" />
    </svg>
  );
};

// ─── Cylinder (top ellipse + body + shading) ─────────────────────────
export const Cylinder: React.FC<{
  width?: number;
  height?: number;
  color?: string;
  shadow?: string;
  highlight?: string;
  style?: CSSProperties;
}> = ({
  width = 160, height = 220, color = '#d97757',
  shadow = '#7a3d20', highlight = '#fff', style,
}) => {
  const ellipseHeight = width * 0.25;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <defs>
        <linearGradient id={`cyl-body-${color}`} x1="0%" x2="100%">
          <stop offset="0%" stopColor={shadow}/>
          <stop offset="20%" stopColor={color}/>
          <stop offset="55%" stopColor={highlight} stopOpacity="0.25"/>
          <stop offset="55%" stopColor={color}/>
          <stop offset="100%" stopColor={shadow}/>
        </linearGradient>
      </defs>
      {/* Body */}
      <rect x="0" y={ellipseHeight / 2} width={width} height={height - ellipseHeight}
        fill={`url(#cyl-body-${color})`} />
      {/* Bottom ellipse curve */}
      <ellipse cx={width/2} cy={height - ellipseHeight/2}
        rx={width/2} ry={ellipseHeight/2} fill={shadow}/>
      {/* Top ellipse — lit */}
      <ellipse cx={width/2} cy={ellipseHeight/2}
        rx={width/2} ry={ellipseHeight/2} fill={color}
        stroke={shadow} strokeWidth="1.5"/>
      {/* Top highlight */}
      <ellipse cx={width/2 - 10} cy={ellipseHeight/2 - 4}
        rx={width/3} ry={ellipseHeight/3} fill={highlight} opacity="0.3"/>
    </svg>
  );
};

// ─── Pyramid (3 visible triangular faces) ─────────────────────────────
export const Pyramid: React.FC<{
  frame?: number;
  size?: number;
  color?: string;
  rotation?: number;
  style?: CSSProperties;
}> = ({ frame = 0, size = 200, color = '#d97757', rotation = 1, style }) => {
  // Animated by hand: lighten the front face based on rotation
  const ay = (frame * rotation) % 360;
  const lightFront = Math.cos(ay * Math.PI / 180);
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style}>
      {/* Back face (darker) */}
      <polygon points={`${half},${size * 0.1} ${size * 0.85},${size * 0.85} ${size * 0.15},${size * 0.85}`}
        fill={color} filter={`brightness(${0.5 + lightFront * 0.2})`} />
      {/* Right side */}
      <polygon points={`${half},${size * 0.1} ${size * 0.85},${size * 0.85} ${half},${size * 0.7}`}
        fill={color} filter={`brightness(${0.7 + lightFront * 0.2})`} />
      {/* Left side */}
      <polygon points={`${half},${size * 0.1} ${size * 0.15},${size * 0.85} ${half},${size * 0.7}`}
        fill={color} filter={`brightness(${0.9 - lightFront * 0.1})`} />
    </svg>
  );
};

// ─── Isometric cube — flat 2D depiction of a 3D box ──────────────────
export const IsoCube: React.FC<{
  size?: number;
  color?: string;
  topColor?: string;
  leftColor?: string;
  rightColor?: string;
  style?: CSSProperties;
}> = ({
  size = 160, color = '#d97757',
  topColor, leftColor, rightColor, style,
}) => {
  const top   = topColor   || color;
  const left  = leftColor  || _darken(color, 0.18);
  const right = rightColor || _darken(color, 0.32);
  // Iso projection — width = size, height = size * 1.155
  const w = size, h = size * 1.155;
  const cx = w / 2, cy = h / 2;
  const offX = w * 0.5, offY = h * 0.289;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={style}>
      {/* Top */}
      <polygon points={`${cx},${cy - offY * 2} ${cx + offX},${cy - offY} ${cx},${cy} ${cx - offX},${cy - offY}`} fill={top}/>
      {/* Left */}
      <polygon points={`${cx - offX},${cy - offY} ${cx},${cy} ${cx},${h - offY * 0.001} ${cx - offX},${cy + offY}`} fill={left}/>
      {/* Right */}
      <polygon points={`${cx},${cy} ${cx + offX},${cy - offY} ${cx + offX},${cy + offY} ${cx},${h - offY * 0.001}`} fill={right}/>
    </svg>
  );
};

// Tiny hex-color darken helper.
function _darken(hex: string, amt: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = Math.max(0, parseInt(h.slice(0, 2), 16) * (1 - amt));
  const g = Math.max(0, parseInt(h.slice(2, 4), 16) * (1 - amt));
  const b = Math.max(0, parseInt(h.slice(4, 6), 16) * (1 - amt));
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ─── Isometric stack — multiple iso-cubes stacked at offsets ─────────
export const IsoStack: React.FC<{
  size?: number;
  color?: string;
  count?: number;
  offset?: number;
  style?: CSSProperties;
}> = ({ size = 120, color = '#d97757', count = 4, offset = 30, style }) => (
  <div style={{ position: 'relative', width: size, height: size * 1.155 + offset * (count - 1), ...style }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        position: 'absolute',
        bottom: i * offset,
        left: 0, right: 0,
      }}>
        <IsoCube size={size} color={color} />
      </div>
    ))}
  </div>
);

// ─── 3D card (flip-flop on a button-press feel) ──────────────────────
export const Card3D: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  bg?: string;
  rotation?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({ frame, width = 320, height = 200, bg = '#1a1a1f', rotation = 1, style, children }) => {
  const ay = frame * rotation;
  return (
    <div style={{ perspective: '1000px', width, height, ...style }}>
      <div style={{
        width, height,
        background: bg,
        borderRadius: 16,
        transform: `rotateY(${ay}deg)`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        transformStyle: 'preserve-3d',
      }}>{children}</div>
    </div>
  );
};
