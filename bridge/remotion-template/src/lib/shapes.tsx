/**
 * Reusable shape components — drop-in JSX/SVG primitives so Claude doesn't
 * have to hand-roll an arrow or speech bubble each time.
 *
 * Usage:
 *   import { Arrow, SpeechBubble, Badge, Burst } from '../lib/shapes';
 *   <Arrow direction="right" color={p.accent} size={120} />
 *   <SpeechBubble color={p.fg} bg={p.surface}>Look!</SpeechBubble>
 *
 * Each component renders an absolutely-positioned SVG/div sized to its
 * `size` prop. Wrap in your own positioning container.
 */

import React, { type CSSProperties } from 'react';

// ─── Arrow ────────────────────────────────────────────────────────────
type ArrowProps = {
  direction?: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
  size?: number;
  color?: string;
  thickness?: number;
  style?: CSSProperties;
};
export const Arrow: React.FC<ArrowProps> = ({
  direction = 'right', size = 80, color = '#fff', thickness = 6, style,
}) => {
  const rotateMap: Record<NonNullable<ArrowProps['direction']>, number> = {
    'right': 0, 'down-right': 45, 'down': 90, 'down-left': 135,
    'left': 180, 'up-left': 225, 'up': 270, 'up-right': 315,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ transform: `rotate(${rotateMap[direction]}deg)`, ...style }}>
      <path d="M10 40 L62 40 M44 22 L62 40 L44 58" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

// ─── Star ─────────────────────────────────────────────────────────────
export const Star: React.FC<{ size?: number; color?: string; points?: number; style?: CSSProperties }> = ({
  size = 80, color = '#ffce4a', points = 5, style,
}) => {
  const cx = 50, cy = 50, outer = 40, inner = 18;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <polygon points={pts.join(' ')} fill={color} />
    </svg>
  );
};

// ─── Heart ────────────────────────────────────────────────────────────
export const Heart: React.FC<{ size?: number; color?: string; style?: CSSProperties }> = ({
  size = 80, color = '#ff5e5b', style,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <path
      d="M12 21s-7-4.35-7-10.5a4.5 4.5 0 0 1 8-2.83A4.5 4.5 0 0 1 19 10.5C19 16.65 12 21 12 21z"
      fill={color}
    />
  </svg>
);

// ─── Burst / starburst (sticker shape) ────────────────────────────────
export const Burst: React.FC<{ size?: number; color?: string; points?: number; style?: CSSProperties }> = ({
  size = 200, color = '#ff5e5b', points = 12, style,
}) => {
  const cx = 50, cy = 50, outer = 48, inner = 32;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <polygon points={pts.join(' ')} fill={color} />
    </svg>
  );
};

// ─── Speech bubble ────────────────────────────────────────────────────
type BubbleProps = {
  bg?: string;
  color?: string;
  tail?: 'left' | 'right' | 'bottom-left' | 'bottom-right' | 'none';
  radius?: number;
  padding?: string | number;
  style?: CSSProperties;
  children?: React.ReactNode;
};
export const SpeechBubble: React.FC<BubbleProps> = ({
  bg = '#fff', color = '#1a1a1c', tail = 'bottom-left',
  radius = 18, padding = '14px 22px', style, children,
}) => {
  const tailStyle: CSSProperties = {};
  if (tail !== 'none') {
    const tailSize = 14;
    tailStyle.position = 'relative';
  }
  const tailEl = tail === 'none' ? null : (
    <div style={{
      position: 'absolute',
      width: 0, height: 0,
      borderStyle: 'solid',
      borderWidth: tail.startsWith('bottom') ? '14px 14px 0 0' : '0 14px 14px 0',
      borderColor: tail.startsWith('bottom')
        ? `${bg} transparent transparent transparent`
        : `transparent ${bg} transparent transparent`,
      bottom: tail.startsWith('bottom') ? -10 : undefined,
      top: !tail.startsWith('bottom') ? -10 : undefined,
      left: tail.endsWith('left') ? 20 : undefined,
      right: tail.endsWith('right') ? 20 : undefined,
      transform: tail.endsWith('right') ? 'scaleX(-1)' : undefined,
    }} />
  );
  return (
    <div style={{
      position: 'relative',
      display: 'inline-block',
      background: bg,
      color,
      borderRadius: radius,
      padding,
      ...style,
    }}>
      {children}
      {tailEl}
    </div>
  );
};

// ─── Thought bubble ───────────────────────────────────────────────────
export const ThoughtBubble: React.FC<BubbleProps> = ({
  bg = '#fff', color = '#1a1a1c', radius = 36, padding = '20px 28px', style, children,
}) => (
  <div style={{ position: 'relative', display: 'inline-block', ...style }}>
    <div style={{
      background: bg, color, borderRadius: radius, padding,
    }}>{children}</div>
    <div style={{
      position: 'absolute', bottom: -10, left: 24,
      width: 18, height: 18, borderRadius: '50%', background: bg,
    }} />
    <div style={{
      position: 'absolute', bottom: -22, left: 16,
      width: 10, height: 10, borderRadius: '50%', background: bg,
    }} />
    <div style={{
      position: 'absolute', bottom: -32, left: 12,
      width: 6, height: 6, borderRadius: '50%', background: bg,
    }} />
  </div>
);

// ─── Sticker badge (rotated circle with bold text) ────────────────────
export const Badge: React.FC<{
  text: string; bg?: string; color?: string; size?: number; rotation?: number; style?: CSSProperties;
}> = ({ text, bg = '#ff5e5b', color = '#fff', size = 160, rotation = -12, style }) => (
  <div style={{
    width: size, height: size,
    background: bg, color,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    fontWeight: 900, fontSize: size * 0.18,
    letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center',
    transform: `rotate(${rotation}deg)`,
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
    padding: 8,
    ...style,
  }}>{text}</div>
);

// ─── Tape sticker (paper-tape strip on a slight angle) ────────────────
export const Tape: React.FC<{
  width?: number; height?: number; color?: string; rotation?: number; style?: CSSProperties;
}> = ({ width = 220, height = 36, color = '#ffe178', rotation = -4, style }) => (
  <div style={{
    width, height, background: color,
    transform: `rotate(${rotation}deg)`,
    boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)',
    ...style,
  }} />
);

// ─── Sticky note (square paper with shadow) ───────────────────────────
export const StickyNote: React.FC<{
  size?: number; color?: string; rotation?: number; style?: CSSProperties; children?: React.ReactNode;
}> = ({ size = 280, color = '#ffe178', rotation = -3, style, children }) => (
  <div style={{
    width: size, height: size, background: color,
    transform: `rotate(${rotation}deg)`,
    boxShadow: '0 18px 36px rgba(0,0,0,0.22)',
    padding: 22,
    fontFamily: '"Marker Felt","Comic Sans MS",cursive',
    fontSize: size * 0.09,
    color: '#3a3320',
    ...style,
  }}>{children}</div>
);

// ─── Blob (organic SVG blob — generative, seeded) ─────────────────────
export const Blob: React.FC<{ size?: number; color?: string; seed?: number; style?: CSSProperties }> = ({
  size = 200, color = '#d97757', seed = 1, style,
}) => {
  // 6-7 control points around a circle, slightly perturbed by seed.
  const points = 6;
  const r = 40;
  const cx = 50, cy = 50;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points; i++) {
    const a = (Math.PI * 2 / points) * i;
    const jitter = 0.7 + ((Math.sin(seed * (i + 1) * 1.7) + 1) / 2) * 0.6; // 0.7..1.3
    pts.push({ x: cx + Math.cos(a) * r * jitter, y: cy + Math.sin(a) * r * jitter });
  }
  // Build a smooth path via quadratic curves between midpoints
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (i === 0) {
      const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      d += `M ${m0.x} ${m0.y} `;
    }
    d += `Q ${p1.x} ${p1.y} ${mid.x} ${mid.y} `;
  }
  d += 'Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <path d={d} fill={color} />
    </svg>
  );
};

// ─── Circle (with optional ring / stroke) ─────────────────────────────
export const Ring: React.FC<{
  size?: number; color?: string; thickness?: number; style?: CSSProperties;
}> = ({ size = 100, color = '#fff', thickness = 4, style }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    border: `${thickness}px solid ${color}`,
    ...style,
  }} />
);

// ─── Rounded rect (card shape) ────────────────────────────────────────
export const RoundedRect: React.FC<{
  width?: number; height?: number; bg?: string; radius?: number; style?: CSSProperties; children?: React.ReactNode;
}> = ({ width = 400, height = 200, bg = '#1a1a1f', radius = 20, style, children }) => (
  <div style={{
    width, height, background: bg, borderRadius: radius,
    ...style,
  }}>{children}</div>
);

// ─── Underline draw (animated horizontal stroke under text) ───────────
export const Underline: React.FC<{
  width?: number; thickness?: number; color?: string; progress?: number; style?: CSSProperties;
}> = ({ width = 200, thickness = 4, color = '#ffe600', progress = 1, style }) => (
  <div style={{
    width: width * Math.max(0, Math.min(1, progress)),
    height: thickness, background: color, borderRadius: thickness,
    transition: 'width 0.2s ease-out',
    ...style,
  }} />
);

// ─── Scribble underline (hand-drawn wavy line, SVG path) ──────────────
export const Scribble: React.FC<{
  width?: number; color?: string; thickness?: number; style?: CSSProperties;
}> = ({ width = 220, color = '#ffd43d', thickness = 5, style }) => (
  <svg width={width} height={20} viewBox="0 0 220 20" style={style}>
    <path
      d="M5 14 Q 30 4, 55 12 T 105 12 T 155 12 T 205 12"
      stroke={color} strokeWidth={thickness} strokeLinecap="round" fill="none"
    />
  </svg>
);

// ─── Highlight bar (yellow marker behind text) ────────────────────────
export const HighlightBar: React.FC<{
  width?: number; height?: number; color?: string; rotation?: number; style?: CSSProperties;
}> = ({ width = 220, height = 24, color = '#ffe600', rotation = -1, style }) => (
  <div style={{
    width, height, background: color,
    transform: `rotate(${rotation}deg)`,
    opacity: 0.7,
    ...style,
  }} />
);

// ─── Phone frame (iPhone-ish chrome) ──────────────────────────────────
export const PhoneFrame: React.FC<{
  width?: number; height?: number; bg?: string; style?: CSSProperties; children?: React.ReactNode;
}> = ({ width = 360, height = 720, bg = '#000', style, children }) => (
  <div style={{
    width, height, background: bg,
    borderRadius: width * 0.12,
    border: '3px solid #1a1a1f',
    boxShadow: '0 30px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset',
    overflow: 'hidden',
    position: 'relative',
    ...style,
  }}>
    {/* Notch */}
    <div style={{
      position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: width * 0.35, height: 22,
      background: '#000',
      borderRadius: '0 0 14px 14px',
      zIndex: 2,
    }} />
    {children}
  </div>
);

// ─── Mac window frame (with traffic lights) ───────────────────────────
export const MacWindow: React.FC<{
  width?: number; height?: number; title?: string; style?: CSSProperties; children?: React.ReactNode;
}> = ({ width = 600, height = 400, title = '', style, children }) => (
  <div style={{
    width, height,
    background: '#1c1c1f',
    borderRadius: 12,
    boxShadow: '0 28px 60px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    ...style,
  }}>
    <div style={{
      height: 36, background: '#2a2a2e',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 14px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5e57' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
      {title && <div style={{
        flex: 1, textAlign: 'center', fontSize: 11, color: '#888',
        fontFamily: '"SF Pro Display","Inter",sans-serif',
      }}>{title}</div>}
    </div>
    <div style={{ height: 'calc(100% - 36px)', overflow: 'hidden' }}>{children}</div>
  </div>
);

// ─── Browser frame (chrome address bar style) ─────────────────────────
export const BrowserFrame: React.FC<{
  width?: number; height?: number; url?: string; style?: CSSProperties; children?: React.ReactNode;
}> = ({ width = 700, height = 440, url = 'example.com', style, children }) => (
  <div style={{
    width, height, background: '#fff',
    borderRadius: 10,
    boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
    overflow: 'hidden',
    ...style,
  }}>
    <div style={{
      height: 40, background: '#f1f1f4',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
      borderBottom: '1px solid #dcdce0',
    }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5e57' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
      <div style={{
        flex: 1, height: 26,
        background: '#fff', border: '1px solid #d4d4d8',
        borderRadius: 6, padding: '4px 12px',
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontSize: 11, color: '#5a5a60',
        display: 'flex', alignItems: 'center',
        marginLeft: 14,
      }}>{url}</div>
    </div>
    <div style={{ height: 'calc(100% - 40px)', overflow: 'hidden' }}>{children}</div>
  </div>
);

// ─── Terminal window (dark, monospace) ────────────────────────────────
export const TerminalWindow: React.FC<{
  width?: number; height?: number; style?: CSSProperties; children?: React.ReactNode;
}> = ({ width = 600, height = 360, style, children }) => (
  <div style={{
    width, height, background: '#0d0d10',
    borderRadius: 8,
    boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
    fontFamily: '"SF Mono","JetBrains Mono",Menlo,monospace',
    color: '#d8d4c8',
    padding: 20,
    fontSize: 14,
    ...style,
  }}>
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5e57' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
    </div>
    {children}
  </div>
);
