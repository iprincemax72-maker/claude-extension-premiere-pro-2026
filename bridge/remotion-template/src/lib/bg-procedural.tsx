/**
 * Procedural backgrounds — generative patterns that change with frame.
 *
 *   <CheckerboardAnim frame={frame} speed={2} />
 *   <HalftoneWave frame={frame} color={p.accent} />
 *   <Voronoi frame={frame} count={20} color={p.accent} />
 *   <NoiseField frame={frame} />
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';

// ─── Checkerboard — animated, optionally scrolling/spinning ──────────
export const CheckerboardAnim: React.FC<{
  frame?: number;
  size?: number;
  a?: string;
  b?: string;
  speed?: number;        // px/frame scroll
  rotation?: number;
  perspective?: boolean;
}> = ({
  frame, size = 40, a = '#1a1a1f', b = '#fff',
  speed = 0, rotation = 0, perspective = false,
}) => {
  const f = frame ?? 0;
  const offset = (f * speed) % (size * 2);
  const styles: React.CSSProperties = {
    pointerEvents: 'none',
    backgroundImage: `
      linear-gradient(45deg, ${a} 25%, transparent 25%),
      linear-gradient(-45deg, ${a} 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, ${a} 75%),
      linear-gradient(-45deg, transparent 75%, ${a} 75%)
    `,
    backgroundSize: `${size}px ${size}px`,
    backgroundColor: b,
    backgroundPosition: `0 ${offset}px, ${size/2}px ${offset + size/2}px, ${size/2}px ${offset + size/2}px, 0 ${offset}px`,
  };
  if (rotation) styles.transform = `rotate(${rotation}deg) scale(1.5)`;
  if (perspective) {
    styles.perspective = '700px';
    styles.transform = `${styles.transform || ''} rotateX(60deg) scale(2)`;
    styles.transformOrigin = 'center bottom';
  }
  return <AbsoluteFill style={styles} />;
};

// ─── Voronoi cells (animated, deterministic per seed) ────────────────
// Draws colored cells whose centroids slowly drift. Pure CSS via radial
// gradients summed together — cheap and looks great.
export const Voronoi: React.FC<{
  frame: number;
  count?: number;
  color?: string;
  altColor?: string;
  speed?: number;
}> = ({ frame, count = 14, color = '#d97757', altColor = '#0d0d10', speed = 0.5 }) => {
  const stops = Array.from({ length: count }).map((_, i) => {
    const baseX = random(`v-x-${i}`) * 100;
    const baseY = random(`v-y-${i}`) * 100;
    const drift = Math.sin((frame + i * 20) * 0.01 * speed) * 6;
    const driftY = Math.cos((frame + i * 17) * 0.01 * speed) * 5;
    const x = baseX + drift;
    const y = baseY + driftY;
    const useAlt = i % 2 === 0;
    const c = useAlt ? altColor : color;
    return `radial-gradient(ellipse 30% 25% at ${x}% ${y}%, ${c} 0%, transparent 50%)`;
  });
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: stops.join(', '),
      filter: 'blur(30px)',
    }} />
  );
};

// ─── Halftone wave — animated dot grid where dot size varies by wave ─
export const HalftoneWave: React.FC<{
  frame: number;
  color?: string;
  spacing?: number;
  amplitude?: number;     // max dot size at peak
  speed?: number;
}> = ({ frame, color = '#d97757', spacing = 24, amplitude = 8, speed = 0.04 }) => {
  // Build SVG dots — bounded by viewport size. We'll generate enough for
  // a 1920x1080 frame (or larger via overflow).
  const cols = Math.ceil(2000 / spacing);
  const rows = Math.ceil(1200 / spacing);
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * spacing + spacing / 2;
      const y = j * spacing + spacing / 2;
      // Wave: distance from center + time
      const dx = x - 960, dy = y - 540;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const phase = dist * 0.01 - frame * speed;
      const r = (Math.sin(phase) + 1) / 2 * amplitude * 0.5;
      if (r < 0.3) continue;
      dots.push(<circle key={`${i}-${j}`} cx={x} cy={y} r={r} fill={color} />);
    }
  }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        {dots}
      </svg>
    </AbsoluteFill>
  );
};

// ─── Noise field — perlin-like animated noise tiles ─────────────────
// Uses SVG fractal-noise per frame; coarse, soft, organic.
export const NoiseField: React.FC<{
  frame: number;
  baseFreq?: number;
  opacity?: number;
  blend?: React.CSSProperties['mixBlendMode'];
}> = ({ frame, baseFreq = 0.5, opacity = 0.12, blend = 'overlay' }) => {
  const seed = Math.floor(frame / 4);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, mixBlendMode: blend }}>
      <svg width="100%" height="100%">
        <filter id={`nf-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency={baseFreq} numOctaves="3" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#nf-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ─── Stripe wave — diagonal stripes that slide ───────────────────────
export const StripeWave: React.FC<{
  frame?: number;
  a?: string;
  b?: string;
  width?: number;
  angle?: number;
  speed?: number;
  opacity?: number;
}> = ({ frame = 0, a = '#1a1a1f', b = '#0d0d10', width = 40, angle = 45, speed = 1, opacity = 1 }) => {
  const offset = (frame * speed) % (width * 2);
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none', opacity,
      background: `repeating-linear-gradient(${angle}deg, ${a} 0px, ${a} ${width}px, ${b} ${width}px, ${b} ${width*2}px)`,
      backgroundPosition: `${offset}px ${offset}px`,
    }} />
  );
};

// ─── Concentric pulse — expanding rings from center ──────────────────
export const ConcentricPulse: React.FC<{
  frame: number;
  color?: string;
  rings?: number;
  speed?: number;
  thickness?: number;
}> = ({ frame, color = '#d97757', rings = 5, speed = 1.2, thickness = 2 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {Array.from({ length: rings }).map((_, i) => {
      const phase = (frame * speed + i * 30) % 120;
      const r = phase * 12;
      const op = Math.max(0, 1 - phase / 120);
      return (
        <div key={i} style={{
          position: 'absolute',
          width: r, height: r,
          border: `${thickness}px solid ${color}`,
          borderRadius: '50%',
          opacity: op,
        }} />
      );
    })}
  </AbsoluteFill>
);

// ─── Topographic lines — contour map look ────────────────────────────
export const Topographic: React.FC<{
  frame?: number;
  color?: string;
  spacing?: number;
  opacity?: number;
}> = ({ frame = 0, color = '#d97757', spacing = 12, opacity = 0.3 }) => {
  const seed = Math.floor(frame / 6);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <svg width="100%" height="100%">
        <filter id={`topo-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed={seed} />
          <feColorMatrix type="matrix" values={`0 0 0 0 ${parseInt(color.slice(1,3),16)/255}  0 0 0 0 ${parseInt(color.slice(3,5),16)/255}  0 0 0 0 ${parseInt(color.slice(5,7),16)/255}  ${1/spacing} 0 0 0 0`} />
          <feComponentTransfer><feFuncA type="discrete" tableValues="0 1 0 1 0 1 0 1 0 1"/></feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter={`url(#topo-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ─── Plasma — animated colorful gradient based on multiple waves ──────
export const Plasma: React.FC<{
  frame: number;
  speed?: number;
  hueA?: number;
  hueB?: number;
}> = ({ frame, speed = 1, hueA = 200, hueB = 320 }) => {
  const t = frame * 0.01 * speed;
  const x1 = 30 + Math.sin(t) * 25;
  const y1 = 40 + Math.cos(t * 1.3) * 20;
  const x2 = 70 + Math.cos(t * 1.1) * 22;
  const y2 = 60 + Math.sin(t * 0.9) * 18;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: `
        radial-gradient(circle at ${x1}% ${y1}%, hsl(${hueA}, 70%, 50%) 0%, transparent 50%),
        radial-gradient(circle at ${x2}% ${y2}%, hsl(${hueB}, 70%, 55%) 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, hsl(${(hueA + hueB) / 2}, 60%, 45%) 0%, transparent 70%)
      `,
      filter: 'blur(50px) saturate(1.2)',
    }} />
  );
};
