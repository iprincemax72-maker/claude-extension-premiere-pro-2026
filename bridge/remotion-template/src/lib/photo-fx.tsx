/**
 * Photographic effects — lens flare, depth-of-field blur, double-exposure,
 * film burn, color grading layers. Drop in as <AbsoluteFill> overlays.
 *
 *   <LensFlare frame={frame} x="80%" y="30%" color="#ffd43d" />
 *   <DOFBlur strength={8} />
 *   <FilmBurn frame={frame} start={50} dur={20} />
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, random, interpolate } from 'remotion';
import { EASE } from './easings';

// ─── Lens flare — sun-glint streak with ghosts down a line ────────────
export const LensFlare: React.FC<{
  frame?: number;
  x?: string | number;
  y?: string | number;
  color?: string;
  intensity?: number;
  rotation?: number;
  style?: CSSProperties;
}> = ({
  frame = 0, x = '70%', y = '30%', color = '#fff5d0',
  intensity = 1, rotation = 0, style,
}) => {
  // Subtle breath so the flare feels real
  const breath = 1 + Math.sin(frame * 0.05) * 0.08;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', ...style }}>
      {/* Main hotspot */}
      <div style={{
        position: 'absolute', left: x, top: y,
        width: 400 * breath * intensity, height: 400 * breath * intensity,
        marginLeft: -200 * breath * intensity, marginTop: -200 * breath * intensity,
        background: `radial-gradient(circle, ${color} 0%, ${color}88 20%, transparent 50%)`,
        filter: 'blur(8px)',
        transform: `rotate(${rotation}deg)`,
      }} />
      {/* Horizontal streak */}
      <div style={{
        position: 'absolute', left: x, top: y,
        width: 800 * intensity, height: 6,
        marginLeft: -400 * intensity, marginTop: -3,
        background: `linear-gradient(90deg, transparent 0%, ${color}aa 50%, transparent 100%)`,
        filter: 'blur(2px)',
        transform: `rotate(${rotation}deg)`,
      }} />
      {/* Ghost spots along the diagonal toward center */}
      {[0.3, 0.55, 0.78].map((p, i) => {
        const cx = typeof x === 'string' ? parseFloat(x) / 100 : 0.7;
        const cy = typeof y === 'string' ? parseFloat(y) / 100 : 0.3;
        const gx = (cx + (0.5 - cx) * (1 + p)) * 100;
        const gy = (cy + (0.5 - cy) * (1 + p)) * 100;
        const size = (40 + i * 30) * intensity;
        return (
          <div key={i} style={{
            position: 'absolute', left: `${gx}%`, top: `${gy}%`,
            width: size, height: size,
            marginLeft: -size / 2, marginTop: -size / 2,
            background: `radial-gradient(circle, ${color}66 0%, transparent 60%)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ─── DOF blur — apply blur to "out of focus" layers ──────────────────
// Pass it as a wrapper. Children stay sharp at the configured aperture;
// content beyond `focalRange` from the focal layer blurs progressively.
// This is a wrap component: use multiple instances at different depths.
export const DOFBlur: React.FC<{
  strength?: number;        // px of blur
  children?: React.ReactNode;
  style?: CSSProperties;
}> = ({ strength = 6, children, style }) => (
  <div style={{ filter: `blur(${strength}px)`, ...style }}>{children}</div>
);

// ─── Tilt-shift — strong blur at top + bottom, sharp middle ──────────
export const TiltShift: React.FC<{
  intensity?: number;
  bandHeight?: number;     // px of the sharp middle band
}> = ({ intensity = 8, bandHeight = 200 }) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    backdropFilter: `blur(${intensity}px)`,
    WebkitBackdropFilter: `blur(${intensity}px)`,
    maskImage: `linear-gradient(180deg, #000 0%, transparent calc(50% - ${bandHeight/2}px), transparent calc(50% + ${bandHeight/2}px), #000 100%)`,
    WebkitMaskImage: `linear-gradient(180deg, #000 0%, transparent calc(50% - ${bandHeight/2}px), transparent calc(50% + ${bandHeight/2}px), #000 100%)`,
  }} />
);

// ─── Double exposure — two semi-transparent layers blended ───────────
// Use as: <DoubleExposure base={<imgA/>} overlay={<imgB/>} blend="screen" />
export const DoubleExposure: React.FC<{
  base: React.ReactNode;
  overlay: React.ReactNode;
  blend?: 'screen' | 'multiply' | 'overlay' | 'lighten' | 'darken' | 'difference';
  overlayOpacity?: number;
}> = ({ base, overlay, blend = 'screen', overlayOpacity = 0.7 }) => (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div style={{ position: 'absolute', inset: 0 }}>{base}</div>
    <div style={{
      position: 'absolute', inset: 0,
      mixBlendMode: blend,
      opacity: overlayOpacity,
    }}>{overlay}</div>
  </div>
);

// ─── Film burn — fiery orange flash sweeping across (Super-8 feel) ───
export const FilmBurn: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  intensity?: number;
}> = ({ frame, start = 0, dur = 24, intensity = 1 }) => {
  if (frame < start || frame > start + dur) return null;
  const p = (frame - start) / dur;
  // Edge of burn moves left to right
  const burnX = -20 + p * 140;
  const burnFade = Math.sin(p * Math.PI);   // 0 → 1 → 0
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: burnFade * intensity }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 40% 80% at ${burnX}% 50%, #ffcc44 0%, #ff6a1a 30%, #c41010 50%, transparent 70%)
        `,
        filter: 'blur(20px)',
      }} />
      {/* Sprinkled hot spots */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${burnX + (random(`fb-${i}`) - 0.5) * 30}%`,
          top: `${random(`fb-y-${i}`) * 100}%`,
          width: 80, height: 80,
          background: 'radial-gradient(circle, #ffd43d 0%, transparent 60%)',
          filter: 'blur(10px)',
          opacity: burnFade,
        }} />
      ))}
    </AbsoluteFill>
  );
};

// ─── Color grade — apply preset color filters ────────────────────────
// Wrap content with a CSS filter to bake in a "look". Use as an overlay
// when you want the filter applied to background layers only.
export const ColorGrade: React.FC<{
  preset?: 'tealOrange' | 'cool' | 'warm' | 'vintage' | 'noir' | 'cyber' | 'sepia';
  intensity?: number;        // 0..1
  style?: CSSProperties;
}> = ({ preset = 'tealOrange', intensity = 1, style }) => {
  const filters: Record<string, string> = {
    tealOrange: `hue-rotate(-12deg) saturate(${1 + intensity * 0.4}) contrast(${1 + intensity * 0.15})`,
    cool:       `hue-rotate(-20deg) saturate(${1 + intensity * 0.2}) brightness(${1 - intensity * 0.05})`,
    warm:       `hue-rotate(12deg)  saturate(${1 + intensity * 0.3}) brightness(${1 + intensity * 0.04})`,
    vintage:    `sepia(${intensity * 0.4}) contrast(${1 + intensity * 0.1}) brightness(${0.95 + intensity * 0.05})`,
    noir:       `grayscale(${intensity}) contrast(${1 + intensity * 0.3}) brightness(${1 - intensity * 0.05})`,
    cyber:      `hue-rotate(${intensity * 30}deg) saturate(${1 + intensity * 0.6}) contrast(${1 + intensity * 0.2})`,
    sepia:      `sepia(${intensity})`,
  };
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      backdropFilter: filters[preset] || filters.tealOrange,
      WebkitBackdropFilter: filters[preset] || filters.tealOrange,
      ...style,
    }} />
  );
};

// ─── Bloom — soft over-exposure glow on bright areas ─────────────────
// Wraps content and adds a blurred bright copy underneath via box-shadow.
export const Bloom: React.FC<{
  color?: string;
  intensity?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({ color = '#fff', intensity = 1, style, children }) => (
  <div style={{
    filter: `drop-shadow(0 0 ${20 * intensity}px ${color}) drop-shadow(0 0 ${50 * intensity}px ${color}80)`,
    ...style,
  }}>{children}</div>
);

// ─── Chromatic aberration (animated) ─────────────────────────────────
export const ChromaticAberrationAnim: React.FC<{
  frame: number;
  intensity?: number;
  speed?: number;
}> = ({ frame, intensity = 3, speed = 0.05 }) => {
  const wobble = Math.sin(frame * speed) * intensity;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none',
      boxShadow: `${wobble}px 0 0 rgba(255,0,80,0.5), ${-wobble}px 0 0 rgba(0,180,255,0.5)`,
      mixBlendMode: 'screen',
    }} />
  );
};

// ─── Vintage frame border — old-photo white frame ────────────────────
export const VintageBorder: React.FC<{
  thickness?: number;
  color?: string;
}> = ({ thickness = 20, color = '#fafaf2' }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{
      position: 'absolute', inset: 0,
      border: `${thickness}px solid ${color}`,
      boxShadow: `0 ${thickness/2}px ${thickness}px rgba(0,0,0,0.18) inset`,
    }} />
  </AbsoluteFill>
);

// ─── Dust motes — floating dust particles backlit by a light source ──
export const DustMotes: React.FC<{
  count?: number;
  color?: string;
  style?: CSSProperties;
}> = ({ count = 50, color = 'rgba(255,255,255,0.6)', style }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', ...style }}>
      {Array.from({ length: count }).map((_, i) => {
        const baseX = random(`dm-x-${i}`) * 100;
        const baseY = random(`dm-y-${i}`) * 100;
        const drift = Math.sin(frame * 0.01 + i) * 4;
        const driftY = Math.cos(frame * 0.013 + i) * 3;
        const size = 1 + random(`dm-s-${i}`) * 3;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${baseX + drift}%`, top: `${baseY + driftY}%`,
            width: size, height: size,
            background: color,
            borderRadius: '50%',
            opacity: 0.3 + random(`dm-o-${i}`) * 0.5,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ─── God rays — slanted light beams from one corner ──────────────────
export const GodRays: React.FC<{
  frame?: number;
  color?: string;
  intensity?: number;
  origin?: 'top-left' | 'top-right';
}> = ({ frame = 0, color = '#fff5d0', intensity = 0.4, origin = 'top-right' }) => {
  const angle = origin === 'top-right' ? -25 : 25;
  const driftX = Math.sin(frame * 0.01) * 4;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none', mixBlendMode: 'screen', opacity: intensity,
      background: `repeating-linear-gradient(${angle + driftX}deg, transparent 0px, transparent 40px, ${color}33 40px, ${color}33 80px, transparent 80px, transparent 120px)`,
      filter: 'blur(8px)',
    }} />
  );
};
