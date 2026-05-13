/**
 * Card design styles — common visual treatments for content containers.
 * Each is a styled wrapper. Pass children, optionally width/padding.
 *
 * Usage:
 *   <GlassCard width={500} padding={30}><h2>Hello</h2></GlassCard>
 *   <BrutalistCard accent={p.accent}>NEW</BrutalistCard>
 *   <PaperTear>Torn note feel</PaperTear>
 */

import React, { type CSSProperties } from 'react';

type BaseCardProps = {
  width?: number | string;
  height?: number | string;
  padding?: number | string;
  radius?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
};

// ─── Glassmorphism — translucent + backdrop blur ──────────────────────
export const GlassCard: React.FC<BaseCardProps & { tint?: string; border?: string }> = ({
  width = 'auto', height = 'auto', padding = 24, radius = 18,
  tint = 'rgba(255,255,255,0.08)', border = 'rgba(255,255,255,0.18)',
  style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: tint,
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: `1px solid ${border}`,
    boxShadow: '0 12px 36px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04) inset',
    ...style,
  }}>{children}</div>
);

// ─── Neumorphism — soft 3D from light + shadow ────────────────────────
export const NeumorphCard: React.FC<BaseCardProps & { bg?: string }> = ({
  width = 'auto', height = 'auto', padding = 24, radius = 22,
  bg = '#e8e4d8', style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    boxShadow: '12px 12px 24px rgba(0,0,0,0.12), -12px -12px 24px rgba(255,255,255,0.7)',
    ...style,
  }}>{children}</div>
);

// ─── Brutalist — hard black border, hard shadow, no rounding ──────────
export const BrutalistCard: React.FC<BaseCardProps & { bg?: string; color?: string; accent?: string }> = ({
  width = 'auto', height = 'auto', padding = 24, radius = 0,
  bg = '#fff', color = '#000', accent = '#ff3b30',
  style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg, color,
    border: `3px solid ${color}`,
    boxShadow: `8px 8px 0 ${accent}, 8px 8px 0 3px ${color}`,
    ...style,
  }}>{children}</div>
);

// ─── Paper-tear — torn-edge note feel using radial gradient mask ──────
export const PaperTear: React.FC<BaseCardProps & { bg?: string }> = ({
  width = 'auto', height = 'auto', padding = 32, radius = 6,
  bg = '#fdf6e3', style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    boxShadow: '0 18px 36px rgba(0,0,0,0.18)',
    backgroundImage: `
      radial-gradient(ellipse at 50% 0%, transparent 0, transparent 5px, ${bg} 6px),
      radial-gradient(ellipse at 50% 100%, transparent 0, transparent 5px, ${bg} 6px)
    `,
    backgroundSize: '20px 8px',
    backgroundPosition: 'top, bottom',
    backgroundRepeat: 'repeat-x',
    ...style,
  }}>{children}</div>
);

// ─── Polaroid — instant photo frame with bottom caption space ─────────
export const Polaroid: React.FC<BaseCardProps & { photoBg?: string; caption?: string }> = ({
  width = 300, height = 360, padding = 0, radius = 4,
  photoBg = '#222', caption = '',
  style, children,
}) => (
  <div style={{
    width, height, borderRadius: radius,
    background: '#fff',
    padding: '14px 14px 60px 14px',
    boxShadow: '0 22px 50px rgba(0,0,0,0.28)',
    fontFamily: '"Marker Felt","Comic Sans MS",cursive',
    color: '#3a3320',
    position: 'relative',
    ...style,
  }}>
    <div style={{
      width: '100%', height: 'calc(100% - 70px)',
      background: photoBg,
      overflow: 'hidden',
    }}>{children}</div>
    {caption && <div style={{
      position: 'absolute', bottom: 14, left: 0, right: 0,
      textAlign: 'center', fontSize: 18,
    }}>{caption}</div>}
  </div>
);

// ─── Editorial mag card — heavy borderless type w/ accent rule ────────
export const EditorialCard: React.FC<BaseCardProps & { bg?: string; accent?: string }> = ({
  width = 'auto', height = 'auto', padding = 36, radius = 0,
  bg = '#fafaf7', accent = '#ff3b30', style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    borderTop: `6px solid ${accent}`,
    fontFamily: '"Charter","Georgia",serif',
    ...style,
  }}>{children}</div>
);

// ─── Receipt — thermal-printer style narrow card ──────────────────────
export const Receipt: React.FC<BaseCardProps & { bg?: string }> = ({
  width = 320, height = 'auto', padding = 20, radius = 0,
  bg = '#f5efe0', style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    fontFamily: '"SF Mono","JetBrains Mono",Menlo,monospace',
    fontSize: 14,
    color: '#1a1a1c',
    boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
    // Tear-line at the bottom via clip-path zigzag
    clipPath: 'polygon(0% 0%, 100% 0%, 100% 98%, 95% 100%, 90% 98%, 85% 100%, 80% 98%, 75% 100%, 70% 98%, 65% 100%, 60% 98%, 55% 100%, 50% 98%, 45% 100%, 40% 98%, 35% 100%, 30% 98%, 25% 100%, 20% 98%, 15% 100%, 10% 98%, 5% 100%, 0% 98%)',
    ...style,
  }}>{children}</div>
);

// ─── Index card — lined notebook paper feel ───────────────────────────
export const IndexCard: React.FC<BaseCardProps & { lineColor?: string }> = ({
  width = 480, height = 320, padding = 24, radius = 6,
  lineColor = '#c9d4dc', style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: '#fafaf7',
    backgroundImage: `repeating-linear-gradient(180deg, transparent 0px, transparent 31px, ${lineColor} 32px)`,
    backgroundPositionY: 8,
    borderTop: '20px solid #ffd9d9',
    boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
    color: '#1a1a1c',
    fontFamily: '"Charter","Georgia",serif',
    fontSize: 22,
    lineHeight: '32px',
    ...style,
  }}>{children}</div>
);

// ─── Dark hero card — premium tech / product launch ───────────────────
export const HeroCard: React.FC<BaseCardProps & { bg?: string; glowColor?: string }> = ({
  width = 'auto', height = 'auto', padding = 36, radius = 28,
  bg = '#0d0d10', glowColor = '#d97757',
  style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 80px ${glowColor}33, 0 0 0 1px rgba(255,255,255,0.04) inset`,
    color: '#f2efe6',
    ...style,
  }}>{children}</div>
);

// ─── Coquette / soft card — pink, lace-feel, sparkle-ready ────────────
export const SoftCard: React.FC<BaseCardProps & { bg?: string; accent?: string }> = ({
  width = 'auto', height = 'auto', padding = 28, radius = 24,
  bg = '#fff', accent = '#ff8aa8',
  style, children,
}) => (
  <div style={{
    width, height, padding, borderRadius: radius,
    background: bg,
    boxShadow: `0 18px 40px ${accent}33, 0 0 0 1px ${accent}40 inset`,
    border: `2px solid ${accent}40`,
    ...style,
  }}>{children}</div>
);
