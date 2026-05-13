/**
 * Visual effect overlays — drop these into a composition for instant
 * production value. Each is a self-contained React component that
 * reads the current frame.
 *
 *   <AbsoluteFill style={{ background: p.bg }}>
 *     {... your scene ...}
 *     <FilmGrain opacity={0.12} />
 *     <Vignette strength={0.6} />
 *   </AbsoluteFill>
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';

/**
 * Film grain — moving noise overlay. Adds film-stock texture.
 * Set opacity ~0.08-0.18. Higher = grittier.
 */
export const FilmGrain: React.FC<{ opacity?: number; scale?: number }> = ({ opacity = 0.12, scale = 2 }) => {
  const frame = useCurrentFrame();
  // SVG noise — re-seeded every frame so it animates
  const seed = Math.floor(frame / 2); // changes every 2 frames
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} style={{ transform: `scale(${scale})` }} />
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Vignette — darkens the edges. `strength` 0..1.
 */
export const Vignette: React.FC<{ strength?: number; color?: string }> = ({ strength = 0.5, color = '#000' }) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    background: `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`,
    opacity: strength,
  }} />
);

/**
 * Chromatic aberration overlay — splits color channels slightly.
 * Place over a snapshot of the underlying content. For text effects
 * use the `glitch()` motion helper instead.
 */
export const ChromaticAberration: React.FC<{ intensity?: number }> = ({ intensity = 3 }) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    boxShadow: `${intensity}px 0 0 rgba(255,0,80,0.4), ${-intensity}px 0 0 rgba(0,180,255,0.4)`,
    mixBlendMode: 'screen',
  }} />
);

/**
 * VHS scanlines — horizontal interlaced lines for that retro look.
 */
export const Scanlines: React.FC<{ opacity?: number; lineHeight?: number }> = ({ opacity = 0.18, lineHeight = 3 }) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${opacity}) 0px, rgba(0,0,0,${opacity}) 1px, transparent 1px, transparent ${lineHeight}px)`,
    mixBlendMode: 'multiply',
  }} />
);

/**
 * Light leak — soft animated colored gradient that drifts across the
 * frame. Place at the top of a composition for film-stock feel.
 */
export const LightLeak: React.FC<{ color?: string; speed?: number }> = ({ color = '#ff7a3d', speed = 0.5 }) => {
  const frame = useCurrentFrame();
  const angle = (frame * speed) % 360;
  const x = 50 + Math.sin(frame * 0.01) * 30;
  const y = 50 + Math.cos(frame * 0.013) * 25;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 40% 30% at ${x}% ${y}%, ${color}aa 0%, transparent 60%)`,
      mixBlendMode: 'screen',
      opacity: 0.5,
      transform: `rotate(${angle}deg)`,
    }} />
  );
};

/**
 * Glow halo — soft glow behind a hero element. Pass position + color.
 */
export const GlowHalo: React.FC<{ color?: string; size?: number; x?: number; y?: number; pulse?: boolean }> = ({
  color = '#ff3d8a', size = 600, x = 50, y = 50, pulse: doPulse = true,
}) => {
  const frame = useCurrentFrame();
  const p = doPulse ? 1 + Math.sin(frame * 0.05) * 0.08 : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        width: size, height: size,
        marginLeft: -size / 2, marginTop: -size / 2,
        background: `radial-gradient(circle, ${color} 0%, transparent 60%)`,
        opacity: 0.55,
        filter: 'blur(40px)',
        transform: `scale(${p})`,
      }} />
    </AbsoluteFill>
  );
};

/**
 * Sparkle field — twinkling dots for coquette / magical / luxury feels.
 */
export const SparkleField: React.FC<{ count?: number; color?: string }> = ({ count = 40, color = '#fff' }) => {
  const frame = useCurrentFrame();
  const sparkles = Array.from({ length: count }).map((_, i) => {
    const x = random(`sx-${i}`) * 100;
    const y = random(`sy-${i}`) * 100;
    const offset = random(`so-${i}`) * 60;
    const phase = (frame + offset) % 60;
    const o = phase < 30 ? phase / 30 : 1 - (phase - 30) / 30;
    const size = 3 + random(`ss-${i}`) * 6;
    return (
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        width: size, height: size,
        background: color,
        borderRadius: '50%',
        opacity: o * 0.9,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }} />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{sparkles}</AbsoluteFill>;
};

/**
 * Gradient mesh — animated colorful background blob. Modern social bg.
 */
export const GradientMesh: React.FC<{ a?: string; b?: string; c?: string }> = ({
  a = '#ff3d8a', b = '#6b3df5', c = '#5eb6e8',
}) => {
  const frame = useCurrentFrame();
  const x1 = 20 + Math.sin(frame * 0.01) * 15;
  const y1 = 30 + Math.cos(frame * 0.013) * 20;
  const x2 = 70 + Math.cos(frame * 0.011) * 18;
  const y2 = 60 + Math.sin(frame * 0.009) * 15;
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

/**
 * Speed lines — manga / anime emphasis frames. Quick burst of radial
 * lines pointing inward.
 */
export const SpeedLines: React.FC<{ count?: number; color?: string }> = ({ count = 24, color = '#000' }) => {
  const lines = Array.from({ length: count }).map((_, i) => {
    const angle = (i / count) * 360;
    return (
      <div key={i} style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: 2, height: '60%',
        background: `linear-gradient(180deg, transparent 0%, ${color} 40%, ${color} 100%)`,
        transform: `translate(-50%, -100%) rotate(${angle}deg)`,
        transformOrigin: 'bottom center',
      }} />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{lines}</AbsoluteFill>;
};

/**
 * Grid background — Y2K / cyber / techy grid floor.
 */
export const Grid: React.FC<{ color?: string; size?: number; perspective?: boolean }> = ({
  color = '#5eb6e8', size = 60, perspective: persp = false,
}) => {
  const styles: CSSProperties = {
    pointerEvents: 'none',
    backgroundImage: `
      linear-gradient(${color}40 1px, transparent 1px),
      linear-gradient(90deg, ${color}40 1px, transparent 1px)
    `,
    backgroundSize: `${size}px ${size}px`,
  };
  if (persp) {
    styles.perspective = '600px';
    styles.transform = 'rotateX(60deg) scale(2)';
    styles.transformOrigin = 'center bottom';
  }
  return <AbsoluteFill style={styles} />;
};

/**
 * Confetti burst — for celebration moments. Returns scattered colored
 * squares that fall from the top with rotation.
 */
export const Confetti: React.FC<{ start?: number; count?: number; colors?: string[] }> = ({
  start = 0, count = 60, colors = ['#ff3d8a', '#ffe600', '#5eb6e8', '#6b3df5', '#8ace00'],
}) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const t = frame - start;
  const pieces = Array.from({ length: count }).map((_, i) => {
    const x = random(`c-x-${i}`) * 100;
    const xDrift = (random(`c-d-${i}`) - 0.5) * 200;
    const delay = random(`c-de-${i}`) * 20;
    const fallSpeed = 4 + random(`c-s-${i}`) * 3;
    const rotSpeed = (random(`c-r-${i}`) - 0.5) * 20;
    const color = colors[Math.floor(random(`c-c-${i}`) * colors.length)];
    const tt = Math.max(0, t - delay);
    const y = tt * fallSpeed;
    return (
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`, top: -20,
        width: 14, height: 14,
        background: color,
        transform: `translate(${(tt / 60) * xDrift}px, ${y}px) rotate(${tt * rotSpeed}deg)`,
      }} />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{pieces}</AbsoluteFill>;
};
