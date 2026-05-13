/**
 * Text on path — curved, arched, wavy, circular text. Drop in instead of
 * hand-rolling SVG <textPath> each time.
 *
 * Usage:
 *   <CircularText text="ON SALE NOW · ON SALE NOW · " radius={120}
 *                 color="#fff" fontSize={24} letterSpacing={4} spin={2} />
 *
 *   <ArchText text="HEADLINE" curve="up" radius={400} fontSize={140}
 *             color={p.fg} />
 *
 *   <WaveText text="going up and down" amplitude={20} wavelength={120}
 *             fontSize={56} color={p.accent} />
 */

import React, { type CSSProperties } from 'react';

// ─── Circular text (wraps around a circle) ────────────────────────────
export const CircularText: React.FC<{
  text: string;
  radius?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: number;
  spin?: number;          // degrees per frame — leave 0 for static
  frame?: number;         // pass useCurrentFrame() to animate spin
  reverse?: boolean;      // run the text counterclockwise
  startOffset?: number;   // 0..100 percent — where on the circle text begins
  style?: CSSProperties;
}> = ({
  text, radius = 100, fontSize = 24, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 700,
  letterSpacing = 2, spin = 0, frame = 0, reverse = false,
  startOffset = 0, style,
}) => {
  const size = radius * 2 + fontSize * 2;
  const rotation = spin * frame;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: `rotate(${rotation}deg)`, ...style }}>
      <defs>
        <path id={`tp-circle-${radius}`}
          d={reverse
            ? `M ${size/2 - radius},${size/2} a ${radius},${radius} 0 1,0 ${radius*2},0 a ${radius},${radius} 0 1,0 -${radius*2},0`
            : `M ${size/2 - radius},${size/2} a ${radius},${radius} 0 1,1 ${radius*2},0 a ${radius},${radius} 0 1,1 -${radius*2},0`
          } />
      </defs>
      <text fill={color} fontSize={fontSize} fontFamily={fontFamily}
        fontWeight={fontWeight} letterSpacing={letterSpacing}>
        <textPath href={`#tp-circle-${radius}`} startOffset={`${startOffset}%`}>{text}</textPath>
      </text>
    </svg>
  );
};

// ─── Arch text (curves up or down — sports stadium banner) ────────────
export const ArchText: React.FC<{
  text: string;
  width?: number;
  height?: number;
  curve?: 'up' | 'down';
  radius?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: number;
  style?: CSSProperties;
}> = ({
  text, width = 800, height = 240, curve = 'up', radius = 400,
  fontSize = 80, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 800,
  letterSpacing = 0, style,
}) => {
  const cx = width / 2;
  const cy = curve === 'up' ? height : 0;
  // Two arc endpoints on either side of the canvas at radius `radius`
  const dx = Math.min(width / 2 - 20, radius * 0.95);
  const angle = Math.asin(dx / radius);
  const yOff = radius * Math.cos(angle);
  const startX = cx - dx;
  const endX   = cx + dx;
  const yStart = cy + (curve === 'up' ? -yOff : yOff);
  const sweep = curve === 'up' ? 1 : 0;
  const path = `M ${startX} ${yStart} A ${radius} ${radius} 0 0 ${sweep} ${endX} ${yStart}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <defs><path id={`arch-${curve}-${radius}`} d={path} /></defs>
      <text fill={color} fontSize={fontSize} fontFamily={fontFamily}
        fontWeight={fontWeight} letterSpacing={letterSpacing} textAnchor="middle">
        <textPath href={`#arch-${curve}-${radius}`} startOffset="50%">{text}</textPath>
      </text>
    </svg>
  );
};

// ─── Wave text (sinusoidal undulation) ────────────────────────────────
export const WaveText: React.FC<{
  text: string;
  width?: number;
  height?: number;
  amplitude?: number;
  wavelength?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: number;
  phase?: number;     // pass frame * 0.1 to make it slither
  style?: CSSProperties;
}> = ({
  text, width = 800, height = 200, amplitude = 20, wavelength = 200,
  fontSize = 56, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 700,
  letterSpacing = 0, phase = 0, style,
}) => {
  const mid = height / 2;
  // Build a smooth wave path across the full width
  const segs = Math.ceil(width / 20);
  let d = `M 0 ${mid}`;
  for (let i = 1; i <= segs; i++) {
    const x = (i / segs) * width;
    const y = mid + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amplitude;
    d += ` L ${x} ${y}`;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <defs><path id={`wave-${amplitude}-${wavelength}`} d={d} /></defs>
      <text fill={color} fontSize={fontSize} fontFamily={fontFamily}
        fontWeight={fontWeight} letterSpacing={letterSpacing}>
        <textPath href={`#wave-${amplitude}-${wavelength}`} startOffset="0">{text}</textPath>
      </text>
    </svg>
  );
};

// ─── Spiral text (text spirals inward / outward) ──────────────────────
export const SpiralText: React.FC<{
  text: string;
  size?: number;
  turns?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: number;
  style?: CSSProperties;
}> = ({
  text, size = 400, turns = 3, fontSize = 22, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 700,
  letterSpacing = 2, style,
}) => {
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2 - 20;
  const segs = 200;
  let d = '';
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * turns * Math.PI * 2;
    const r = (i / segs) * maxR;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style}>
      <defs><path id={`spiral-${turns}-${size}`} d={d} /></defs>
      <text fill={color} fontSize={fontSize} fontFamily={fontFamily}
        fontWeight={fontWeight} letterSpacing={letterSpacing}>
        <textPath href={`#spiral-${turns}-${size}`} startOffset="0">{text}</textPath>
      </text>
    </svg>
  );
};

// ─── Generic text-on-path (pass your own SVG path d) ──────────────────
export const TextOnPath: React.FC<{
  text: string;
  pathD: string;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: number;
  startOffset?: number;  // 0..100 percent
  style?: CSSProperties;
}> = ({
  text, pathD, width = 800, height = 300, fontSize = 48, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 700,
  letterSpacing = 0, startOffset = 0, style,
}) => {
  const id = 'tp-' + Math.abs(pathD.length * 31).toString(36);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <defs><path id={id} d={pathD} /></defs>
      <text fill={color} fontSize={fontSize} fontFamily={fontFamily}
        fontWeight={fontWeight} letterSpacing={letterSpacing}>
        <textPath href={`#${id}`} startOffset={`${startOffset}%`}>{text}</textPath>
      </text>
    </svg>
  );
};

// ─── Kinetic per-letter wrap — wraps each letter in a span so callers
//      can apply per-letter transforms (3D rotation, scale on hover, etc.)
export const PerLetter: React.FC<{
  text: string;
  render: (letter: string, index: number, total: number) => CSSProperties;
  baseStyle?: CSSProperties;
}> = ({ text, render, baseStyle }) => {
  const total = text.length;
  return (
    <span style={baseStyle}>
      {text.split('').map((ch, i) => (
        <span key={i} style={{ display: 'inline-block', ...render(ch, i, total) }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
};

// ─── 3D-rotation text rig (each letter rotates on the Y axis on entry) ─
// Use it inside a Remotion component with the current frame for animation.
export const Rotate3DText: React.FC<{
  text: string;
  frame: number;
  start?: number;
  stagger?: number;     // frames between letters
  duration?: number;    // frames for each letter to land
  fontSize?: number;
  color?: string;
  fontWeight?: number | string;
  style?: CSSProperties;
}> = ({
  text, frame, start = 0, stagger = 3, duration = 14,
  fontSize = 100, color = '#fff', fontWeight = 800, style,
}) => (
  <PerLetter
    text={text}
    baseStyle={{
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontSize, fontWeight, color, letterSpacing: -2,
      perspective: '900px',
      ...style,
    }}
    render={(_ch, i) => {
      const t = (frame - start - i * stagger) / duration;
      const p = Math.max(0, Math.min(1, t));
      const eased = 1 - Math.pow(1 - p, 4); // expo-out
      return {
        transform: `rotateY(${(1 - eased) * 90}deg) translateZ(${(1 - eased) * 30}px)`,
        opacity: eased,
        transformOrigin: '50% 50%',
      };
    }}
  />
);
