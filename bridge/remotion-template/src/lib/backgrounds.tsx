/**
 * Background components — drop-in fullscreen backdrops. Each accepts
 * optional color/seed params and renders as <AbsoluteFill>.
 *
 * Usage:
 *   <AbsoluteFill style={{ background: p.bg }}>
 *     <DotGrid color={p.muted} />
 *     ... your scene ...
 *   </AbsoluteFill>
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';

// ─── Dot grid ─────────────────────────────────────────────────────────
export const DotGrid: React.FC<{ color?: string; spacing?: number; size?: number; opacity?: number }> = ({
  color = '#fff', spacing = 32, size = 2, opacity = 0.25,
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    opacity,
    backgroundImage: `radial-gradient(${color} ${size}px, transparent ${size}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  }} />
);

// ─── Line grid ────────────────────────────────────────────────────────
export const LineGrid: React.FC<{ color?: string; spacing?: number; thickness?: number; opacity?: number; perspective?: boolean }> = ({
  color = '#fff', spacing = 60, thickness = 1, opacity = 0.18, perspective = false,
}) => {
  const styles: CSSProperties = {
    pointerEvents: 'none',
    opacity,
    backgroundImage: `
      linear-gradient(${color} ${thickness}px, transparent ${thickness}px),
      linear-gradient(90deg, ${color} ${thickness}px, transparent ${thickness}px)
    `,
    backgroundSize: `${spacing}px ${spacing}px`,
  };
  if (perspective) {
    styles.perspective = '600px';
    styles.transform = 'rotateX(60deg) scale(2)';
    styles.transformOrigin = 'center bottom';
  }
  return <AbsoluteFill style={styles} />;
};

// ─── Diagonal stripes ─────────────────────────────────────────────────
export const Stripes: React.FC<{ a?: string; b?: string; width?: number; angle?: number; opacity?: number }> = ({
  a = '#000', b = '#fff', width = 40, angle = 45, opacity = 0.1,
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none', opacity,
    background: `repeating-linear-gradient(${angle}deg, ${a} 0px, ${a} ${width}px, ${b} ${width}px, ${b} ${width*2}px)`,
  }} />
);

// ─── Halftone dots ────────────────────────────────────────────────────
export const Halftone: React.FC<{ color?: string; spacing?: number; opacity?: number }> = ({
  color = '#1a1a1c', spacing = 18, opacity = 0.18,
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none', opacity,
    backgroundImage: `radial-gradient(${color} 1.6px, transparent 1.6px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: '0 0, ' + (spacing/2) + 'px ' + (spacing/2) + 'px',
  }} />
);

// ─── Radial burst lines (sun-burst) ───────────────────────────────────
export const RadialBurst: React.FC<{ color?: string; spokes?: number; opacity?: number }> = ({
  color = '#ffe178', spokes = 24, opacity = 0.4,
}) => {
  const stops: string[] = [];
  const slice = 360 / spokes;
  for (let i = 0; i < spokes; i++) {
    const a = i * slice;
    const b = a + slice / 2;
    stops.push(`${color} ${a}deg`, `${color} ${b}deg`, `transparent ${b}deg`, `transparent ${a + slice}deg`);
  }
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none', opacity,
      background: `conic-gradient(${stops.join(', ')})`,
    }} />
  );
};

// ─── Gradient mesh (3 colored blobs that drift) ───────────────────────
export const GradientMesh: React.FC<{ a?: string; b?: string; c?: string; speed?: number }> = ({
  a = '#ff3d8a', b = '#6b3df5', c = '#5eb6e8', speed = 1,
}) => {
  const frame = useCurrentFrame();
  const t = frame * 0.01 * speed;
  const x1 = 20 + Math.sin(t) * 15;
  const y1 = 30 + Math.cos(t * 1.3) * 20;
  const x2 = 70 + Math.cos(t * 1.1) * 18;
  const y2 = 60 + Math.sin(t * 0.9) * 15;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: `
        radial-gradient(ellipse 60% 50% at ${x1}% ${y1}%, ${a}cc 0%, transparent 60%),
        radial-gradient(ellipse 50% 60% at ${x2}% ${y2}%, ${b}cc 0%, transparent 60%),
        radial-gradient(ellipse 70% 50% at 50% 100%, ${c}aa 0%, transparent 70%)
      `,
      filter: 'blur(20px)',
    }} />
  );
};

// ─── Aurora (vertical sweeping bands) ─────────────────────────────────
export const Aurora: React.FC<{ a?: string; b?: string; c?: string; speed?: number }> = ({
  a = '#3a1f5e', b = '#1a5573', c = '#6fbf8a', speed = 1,
}) => {
  const frame = useCurrentFrame();
  const t = frame * 0.005 * speed;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: `
        linear-gradient(${90 + Math.sin(t)*20}deg, ${a}, transparent 60%),
        linear-gradient(${110 + Math.cos(t*1.2)*15}deg, ${b}, transparent 70%),
        linear-gradient(${70 + Math.sin(t*0.8)*25}deg, ${c}, transparent 65%)
      `,
      filter: 'blur(40px)',
    }} />
  );
};

// ─── Animated noise (TV static) ───────────────────────────────────────
export const Static: React.FC<{ opacity?: number; intensity?: number }> = ({
  opacity = 0.06, intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 1);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">
        <filter id={`static-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${intensity} 0`} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#static-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ─── Vignette ────────────────────────────────────────────────────────
export const Vignette: React.FC<{ strength?: number; color?: string }> = ({
  strength = 0.5, color = '#000',
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    background: `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`,
    opacity: strength,
  }} />
);

// ─── Star field (animated parallax) ───────────────────────────────────
export const StarField: React.FC<{ count?: number; color?: string; speed?: number }> = ({
  count = 100, color = '#fff', speed = 1,
}) => {
  const frame = useCurrentFrame();
  const stars = Array.from({ length: count }).map((_, i) => {
    const x = random(`sx-${i}`) * 100;
    const baseY = random(`sy-${i}`) * 100;
    const drift = (frame * speed * 0.1) % 100;
    const y = (baseY + drift) % 100;
    const size = 0.5 + random(`ss-${i}`) * 2.5;
    const opacity = 0.3 + random(`so-${i}`) * 0.7;
    return (
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        width: size, height: size,
        background: color, borderRadius: '50%',
        opacity,
        boxShadow: `0 0 ${size * 3}px ${color}80`,
      }} />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{stars}</AbsoluteFill>;
};

// ─── Floating particles (drift slowly) ────────────────────────────────
export const Particles: React.FC<{ count?: number; color?: string; size?: number }> = ({
  count = 30, color = '#fff', size = 4,
}) => {
  const frame = useCurrentFrame();
  const items = Array.from({ length: count }).map((_, i) => {
    const x = random(`px-${i}`) * 100;
    const baseY = random(`py-${i}`) * 100;
    const speed = 0.05 + random(`pv-${i}`) * 0.1;
    const y = (baseY - frame * speed) % 100;
    const s = size * (0.4 + random(`ps-${i}`) * 0.8);
    return (
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`, top: `${y < 0 ? y + 100 : y}%`,
        width: s, height: s, background: color, borderRadius: '50%',
        opacity: 0.5 + random(`po-${i}`) * 0.4,
        filter: 'blur(1px)',
      }} />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{items}</AbsoluteFill>;
};

// ─── Light leak (animated colored beam) ───────────────────────────────
export const LightLeak: React.FC<{ color?: string; speed?: number; opacity?: number }> = ({
  color = '#ff7a3d', speed = 0.5, opacity = 0.5,
}) => {
  const frame = useCurrentFrame();
  const x = 50 + Math.sin(frame * 0.01 * speed) * 30;
  const y = 50 + Math.cos(frame * 0.013 * speed) * 25;
  const angle = (frame * speed * 0.5) % 360;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 40% 30% at ${x}% ${y}%, ${color}aa 0%, transparent 60%)`,
      mixBlendMode: 'screen',
      opacity,
      transform: `rotate(${angle}deg)`,
    }} />
  );
};

// ─── Iso grid (isometric grid like blueprint) ─────────────────────────
export const IsoGrid: React.FC<{ color?: string; spacing?: number; opacity?: number }> = ({
  color = '#5eb6e8', spacing = 40, opacity = 0.18,
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none', opacity,
    backgroundImage: `
      linear-gradient(30deg, ${color} 1px, transparent 1px),
      linear-gradient(150deg, ${color} 1px, transparent 1px),
      linear-gradient(90deg, ${color} 1px, transparent 1px)
    `,
    backgroundSize: `${spacing}px ${spacing * 0.866}px`,
  }} />
);
