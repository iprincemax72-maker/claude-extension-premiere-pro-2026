/**
 * Layout primitives — common compositions you can drop into a frame.
 * Mostly small React components that return absolute-positioned wrappers.
 *
 *   <BentoGrid cols={3} rows={2} gap={20} palette={p}>
 *     <BentoCell><MyContent/></BentoCell>
 *     ...
 *   </BentoGrid>
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill } from 'remotion';
import type { Palette } from './palettes';

/**
 * Bento grid — uniform card layout that's everywhere in product launch
 * graphics (Apple, Linear, Vercel). Use 2-4 cells for vertical, 6-9 for
 * horizontal product launch montages.
 */
export const BentoGrid: React.FC<{
  cols?: number; rows?: number; gap?: number; padding?: number;
  palette: Palette; children: React.ReactNode;
}> = ({ cols = 3, rows = 2, gap = 20, padding = 60, palette, children }) => (
  <AbsoluteFill style={{
    background: palette.bg,
    padding,
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap,
  }}>
    {children}
  </AbsoluteFill>
);

export const BentoCell: React.FC<{ palette?: Palette; style?: CSSProperties; children?: React.ReactNode; span?: { col?: number; row?: number } }> = ({
  palette, style, children, span,
}) => (
  <div style={{
    background: palette?.surface ?? '#1a1a1f',
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    gridColumn: span?.col ? `span ${span.col}` : undefined,
    gridRow: span?.row ? `span ${span.row}` : undefined,
    ...style,
  }}>
    {children}
  </div>
);

/**
 * Split screen — two halves, vertical or horizontal. For comparison /
 * "this vs that" videos.
 */
export const Split: React.FC<{
  vertical?: boolean; gap?: number;
  left?: React.ReactNode; right?: React.ReactNode;
}> = ({ vertical = true, gap = 0, left, right }) => (
  <AbsoluteFill style={{
    display: 'flex',
    flexDirection: vertical ? 'row' : 'column',
    gap,
  }}>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{left}</div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{right}</div>
  </AbsoluteFill>
);

/**
 * Lower-third — bottom-left or bottom-right name/title card. Standard
 * for talking-head clips and podcast highlights.
 */
export const LowerThird: React.FC<{
  palette: Palette;
  name: string; subtitle?: string;
  position?: 'left' | 'right';
  style?: CSSProperties;
}> = ({ palette, name, subtitle, position = 'left', style }) => (
  <div style={{
    position: 'absolute',
    bottom: 80,
    left: position === 'left' ? 60 : undefined,
    right: position === 'right' ? 60 : undefined,
    background: palette.surface,
    color: palette.fg,
    padding: '20px 32px',
    borderLeft: `6px solid ${palette.accent}`,
    borderRadius: 4,
    boxShadow: `0 12px 40px ${palette.shadow}`,
    ...style,
  }}>
    <div style={{
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 800,
      fontSize: 42,
      letterSpacing: -1,
    }}>{name}</div>
    {subtitle && <div style={{
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 500,
      fontSize: 22,
      color: palette.muted,
      marginTop: 4,
      letterSpacing: 0.4,
    }}>{subtitle}</div>}
  </div>
);

/**
 * Picture-in-picture frame — small bordered window for an inset clip
 * (talking head + b-roll combo).
 */
export const Pip: React.FC<{
  position?: 'tl' | 'tr' | 'bl' | 'br';
  size?: number;
  palette?: Palette;
  children?: React.ReactNode;
}> = ({ position = 'br', size = 320, palette, children }) => {
  const pos: CSSProperties = position === 'tl' ? { top: 60, left: 60 }
                          : position === 'tr' ? { top: 60, right: 60 }
                          : position === 'bl' ? { bottom: 60, left: 60 }
                          :                     { bottom: 60, right: 60 };
  return (
    <div style={{
      position: 'absolute',
      width: size, height: size,
      borderRadius: 24,
      overflow: 'hidden',
      border: `3px solid ${palette?.fg ?? '#fff'}`,
      boxShadow: `0 16px 50px ${palette?.shadow ?? 'rgba(0,0,0,0.5)'}`,
      ...pos,
    }}>
      {children}
    </div>
  );
};

/**
 * Card stack with depth — for "swipeable" cards visual, app showcase,
 * Tinder-style stacks. Each card sits behind the next with slight offset.
 */
export const CardStack: React.FC<{
  palette: Palette;
  cards: React.ReactNode[];
  offset?: number;
}> = ({ palette, cards, offset = 24 }) => (
  <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {cards.map((c, i) => (
      <div key={i} style={{
        position: 'absolute',
        width: 600, height: 800,
        background: palette.surface,
        borderRadius: 36,
        boxShadow: `0 24px 60px ${palette.shadow}`,
        transform: `translate(${i * offset}px, ${i * offset}px) rotate(${i * 1.5}deg)`,
        zIndex: cards.length - i,
        overflow: 'hidden',
      }}>{c}</div>
    ))}
  </AbsoluteFill>
);

/**
 * Sticky badge — circular sticker that sits in a corner, often rotating.
 * Use for "NEW", "LIVE", "SALE", etc.
 */
export const StickyBadge: React.FC<{
  text: string;
  palette: Palette;
  position?: 'tl' | 'tr' | 'bl' | 'br';
  rotation?: number;
  size?: number;
}> = ({ text, palette, position = 'tr', rotation = -12, size = 200 }) => {
  const pos: CSSProperties = position === 'tl' ? { top: 80, left: 80 }
                          : position === 'tr' ? { top: 80, right: 80 }
                          : position === 'bl' ? { bottom: 80, left: 80 }
                          :                     { bottom: 80, right: 80 };
  return (
    <div style={{
      position: 'absolute',
      width: size, height: size,
      background: palette.accent,
      color: palette.bg,
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 900,
      fontSize: size * 0.18,
      letterSpacing: 1,
      textTransform: 'uppercase',
      transform: `rotate(${rotation}deg)`,
      boxShadow: `0 10px 30px ${palette.shadow}`,
      ...pos,
    }}>{text}</div>
  );
};

/**
 * Progress bar — top-of-screen progress indicator. For "X of Y",
 * countdowns, tutorial steps.
 */
export const ProgressBar: React.FC<{
  progress: number; // 0..1
  palette: Palette;
  position?: 'top' | 'bottom';
  height?: number;
}> = ({ progress, palette, position = 'top', height = 8 }) => (
  <div style={{
    position: 'absolute',
    left: 0, right: 0,
    [position]: 0,
    height,
    background: palette.surface,
    overflow: 'hidden',
  }}>
    <div style={{
      width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
      height: '100%',
      background: palette.accent,
      transition: 'width 0.1s linear',
    }} />
  </div>
);

/**
 * Caption box — bottom-third caption strip with safe-zone padding.
 * Use as wrapper for word-by-word captions on vertical video.
 */
export const CaptionBox: React.FC<{
  position?: 'top' | 'center' | 'bottom';
  width?: string; // CSS width
  children?: React.ReactNode;
  style?: CSSProperties;
}> = ({ position = 'bottom', width = '90%', children, style }) => {
  const pos: CSSProperties =
    position === 'top'    ? { top: 200 } :
    position === 'center' ? { top: '50%', transform: 'translateY(-50%)' } :
                            { bottom: 280 };
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      marginLeft: '-45%',
      width,
      textAlign: 'center',
      ...pos,
      ...style,
    }}>{children}</div>
  );
};
