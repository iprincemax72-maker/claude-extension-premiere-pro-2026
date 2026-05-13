/**
 * Country flags as SVG components. Top ~25 by use. Each accepts `size`
 * (which is the WIDTH; height scales 2:3 unless the flag is square).
 *
 *   <FlagUS size={120} />
 *   <FlagJP size={80} />
 *
 * To add a new flag: copy the pattern. Each component is a self-contained
 * <svg viewBox="0 0 30 20"> with no external dependencies.
 */

import React, { type CSSProperties } from 'react';

type FlagProps = { size?: number; style?: CSSProperties };

// ─── US ──────────────────────────────────────────────────────────────
export const FlagUS: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.526} viewBox="0 0 7410 3900" style={style}>
    <rect width="7410" height="3900" fill="#b22234"/>
    {/* 6 white stripes */}
    {[0,1,2,3,4,5].map(i => (
      <rect key={i} y={300 * (1 + 2*i)} width="7410" height="300" fill="#fff"/>
    ))}
    {/* Blue canton */}
    <rect width="2964" height="2100" fill="#3c3b6e"/>
    {/* 50 stars (simplified — single dot grid) */}
    {Array.from({length: 50}).map((_, i) => {
      const row = i < 30 ? Math.floor(i / 6) : Math.floor((i - 30) / 5);
      const col = i < 30 ? i % 6 : (i - 30) % 5;
      const isOff = i >= 30;
      const cx = 247 + col * 494 + (isOff ? 247 : 0);
      const cy = 210 + row * 420 + (i < 30 ? 0 : 0);
      return <circle key={i} cx={cx} cy={cy} r="80" fill="#fff"/>;
    })}
  </svg>
);

// ─── UK ──────────────────────────────────────────────────────────────
export const FlagUK: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 60 30" style={style}>
    <rect width="60" height="30" fill="#012169"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" strokeWidth="4" clipPath="url(#t)"/>
    <path d="M30,0 L30,30 M0,15 L60,15" stroke="#fff" strokeWidth="10"/>
    <path d="M30,0 L30,30 M0,15 L60,15" stroke="#c8102e" strokeWidth="6"/>
  </svg>
);

// ─── Japan ───────────────────────────────────────────────────────────
export const FlagJP: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="20" fill="#fff"/>
    <circle cx="15" cy="10" r="6" fill="#bc002d"/>
  </svg>
);

// ─── France ──────────────────────────────────────────────────────────
export const FlagFR: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="10" height="20" fill="#002654"/>
    <rect x="10" width="10" height="20" fill="#fff"/>
    <rect x="20" width="10" height="20" fill="#ce1126"/>
  </svg>
);

// ─── Germany ─────────────────────────────────────────────────────────
export const FlagDE: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.6} viewBox="0 0 5 3" style={style}>
    <rect width="5" height="1" fill="#000"/>
    <rect y="1" width="5" height="1" fill="#dd0000"/>
    <rect y="2" width="5" height="1" fill="#ffce00"/>
  </svg>
);

// ─── Italy ───────────────────────────────────────────────────────────
export const FlagIT: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="10" height="20" fill="#009246"/>
    <rect x="10" width="10" height="20" fill="#fff"/>
    <rect x="20" width="10" height="20" fill="#ce2b37"/>
  </svg>
);

// ─── Spain ───────────────────────────────────────────────────────────
export const FlagES: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="20" fill="#aa151b"/>
    <rect y="5" width="30" height="10" fill="#f1bf00"/>
  </svg>
);

// ─── Canada ──────────────────────────────────────────────────────────
export const FlagCA: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 60 30" style={style}>
    <rect width="60" height="30" fill="#fff"/>
    <rect width="15" height="30" fill="#ff0000"/>
    <rect x="45" width="15" height="30" fill="#ff0000"/>
    {/* Stylized maple leaf as a star approximation */}
    <path d="M30 6 L33 12 L40 14 L34 16 L36 22 L30 18 L24 22 L26 16 L20 14 L27 12 Z" fill="#ff0000"/>
  </svg>
);

// ─── Australia ───────────────────────────────────────────────────────
export const FlagAU: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 60 30" style={style}>
    <rect width="60" height="30" fill="#00008b"/>
    {/* Union Jack canton (simplified) */}
    <rect width="30" height="15" fill="#00008b"/>
    <path d="M0,0 L30,15 M30,0 L0,15" stroke="#fff" strokeWidth="3"/>
    <path d="M15,0 L15,15 M0,7.5 L30,7.5" stroke="#fff" strokeWidth="5"/>
    <path d="M15,0 L15,15 M0,7.5 L30,7.5" stroke="#c8102e" strokeWidth="3"/>
    {/* Commonwealth star */}
    <circle cx="15" cy="22" r="2" fill="#fff"/>
    {/* Southern Cross dots */}
    <circle cx="48" cy="6" r="1.6" fill="#fff"/>
    <circle cx="52" cy="12" r="1.4" fill="#fff"/>
    <circle cx="44" cy="14" r="1.2" fill="#fff"/>
    <circle cx="50" cy="20" r="1.4" fill="#fff"/>
    <circle cx="46" cy="24" r="1.4" fill="#fff"/>
  </svg>
);

// ─── Brazil ──────────────────────────────────────────────────────────
export const FlagBR: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 30 21" style={style}>
    <rect width="30" height="21" fill="#009c3b"/>
    <polygon points="15,2.5 27.5,10.5 15,18.5 2.5,10.5" fill="#ffdf00"/>
    <circle cx="15" cy="10.5" r="4" fill="#002776"/>
  </svg>
);

// ─── India ───────────────────────────────────────────────────────────
export const FlagIN: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="6.67" fill="#ff9933"/>
    <rect y="6.67" width="30" height="6.67" fill="#fff"/>
    <rect y="13.34" width="30" height="6.66" fill="#138808"/>
    <circle cx="15" cy="10" r="2" fill="none" stroke="#000080" strokeWidth="0.3"/>
  </svg>
);

// ─── China ───────────────────────────────────────────────────────────
export const FlagCN: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="20" fill="#ee1c25"/>
    <polygon points="6,3 7,5.5 10,5.5 7.5,7 8.5,9.5 6,8 3.5,9.5 4.5,7 2,5.5 5,5.5" fill="#ffde00"/>
    <circle cx="10" cy="2.5" r="0.5" fill="#ffde00"/>
    <circle cx="12" cy="4.5" r="0.5" fill="#ffde00"/>
    <circle cx="12" cy="7" r="0.5" fill="#ffde00"/>
    <circle cx="10" cy="9" r="0.5" fill="#ffde00"/>
  </svg>
);

// ─── South Korea ─────────────────────────────────────────────────────
export const FlagKR: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="20" fill="#fff"/>
    <path d="M15,5 A5,5 0 0,1 15,15 A2.5,2.5 0 0,0 15,10 A2.5,2.5 0 0,1 15,5" fill="#cd2e3a"/>
    <path d="M15,5 A5,5 0 0,0 15,15 A2.5,2.5 0 0,1 15,10 A2.5,2.5 0 0,0 15,5" fill="#0047a0"/>
  </svg>
);

// ─── Mexico ──────────────────────────────────────────────────────────
export const FlagMX: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.571} viewBox="0 0 28 16" style={style}>
    <rect width="9.33" height="16" fill="#006847"/>
    <rect x="9.33" width="9.34" height="16" fill="#fff"/>
    <rect x="18.67" width="9.33" height="16" fill="#ce1126"/>
  </svg>
);

// ─── Netherlands ─────────────────────────────────────────────────────
export const FlagNL: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="6.67" fill="#ae1c28"/>
    <rect y="6.67" width="30" height="6.67" fill="#fff"/>
    <rect y="13.34" width="30" height="6.66" fill="#21468b"/>
  </svg>
);

// ─── Sweden ──────────────────────────────────────────────────────────
export const FlagSE: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.625} viewBox="0 0 16 10" style={style}>
    <rect width="16" height="10" fill="#006aa7"/>
    <rect x="5" width="2" height="10" fill="#fecc00"/>
    <rect y="4" width="16" height="2" fill="#fecc00"/>
  </svg>
);

// ─── Norway ──────────────────────────────────────────────────────────
export const FlagNO: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.727} viewBox="0 0 22 16" style={style}>
    <rect width="22" height="16" fill="#ef2b2d"/>
    <rect x="6" width="2" height="16" fill="#fff"/>
    <rect y="7" width="22" height="2" fill="#fff"/>
    <rect x="6.5" width="1" height="16" fill="#002868"/>
    <rect y="7.5" width="22" height="1" fill="#002868"/>
  </svg>
);

// ─── Russia ──────────────────────────────────────────────────────────
export const FlagRU: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="6.67" fill="#fff"/>
    <rect y="6.67" width="30" height="6.67" fill="#0039a6"/>
    <rect y="13.34" width="30" height="6.66" fill="#d52b1e"/>
  </svg>
);

// ─── Switzerland (square) ────────────────────────────────────────────
export const FlagCH: React.FC<FlagProps> = ({ size = 70, style }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={style}>
    <rect width="32" height="32" fill="#dc1f26"/>
    <rect x="13" y="6" width="6" height="20" fill="#fff"/>
    <rect x="6" y="13" width="20" height="6" fill="#fff"/>
  </svg>
);

// ─── Pride flag (rainbow) ────────────────────────────────────────────
export const FlagPride: React.FC<FlagProps> = ({ size = 90, style }) => {
  const colors = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004cff', '#732982'];
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 6 6" style={style}>
      {colors.map((c, i) => <rect key={i} y={i} width="6" height="1" fill={c}/>)}
    </svg>
  );
};

// ─── Trans flag ──────────────────────────────────────────────────────
export const FlagTrans: React.FC<FlagProps> = ({ size = 90, style }) => {
  const colors = ['#5bcefa', '#f5a9b8', '#fff', '#f5a9b8', '#5bcefa'];
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 5 5" style={style}>
      {colors.map((c, i) => <rect key={i} y={i} width="5" height="1" fill={c}/>)}
    </svg>
  );
};

// ─── EU flag ─────────────────────────────────────────────────────────
export const FlagEU: React.FC<FlagProps> = ({ size = 90, style }) => (
  <svg width={size} height={size * 0.667} viewBox="0 0 30 20" style={style}>
    <rect width="30" height="20" fill="#003399"/>
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const cx = 15 + Math.cos(angle) * 6;
      const cy = 10 + Math.sin(angle) * 5;
      return <circle key={i} cx={cx} cy={cy} r="0.7" fill="#ffcc00"/>;
    })}
  </svg>
);
