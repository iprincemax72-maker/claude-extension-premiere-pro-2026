/**
 * Audio-style visualizations — purely visual (no real audio analysis,
 * just simulated). Useful for podcast clips, music player mocks, etc.
 *
 *   <WaveformBars frame={frame} count={32} color={p.accent} />
 *   <Waveform frame={frame} width={600} height={80} />
 *   <VinylRecord frame={frame} size={300} />
 *   <CassetteTape frame={frame} />
 */

import React, { type CSSProperties } from 'react';
import { random } from 'remotion';

// ─── Equalizer bars (vertical bars bouncing) ──────────────────────────
export const WaveformBars: React.FC<{
  frame: number;
  count?: number;
  color?: string;
  width?: number;
  height?: number;
  gap?: number;
  minHeight?: number;
  style?: CSSProperties;
}> = ({
  frame, count = 32, color = '#d97757', width = 480, height = 120,
  gap = 4, minHeight = 0.15, style,
}) => {
  const barWidth = (width - gap * (count - 1)) / count;
  return (
    <div style={{
      width, height, display: 'flex', alignItems: 'center', gap,
      ...style,
    }}>
      {Array.from({ length: count }).map((_, i) => {
        const seed = i * 0.7 + frame * 0.09;
        const energy = (Math.sin(seed) * 0.5 + Math.sin(seed * 1.7) * 0.3 + Math.sin(seed * 2.3) * 0.2 + 1) / 2;
        const h = Math.max(minHeight, energy) * height;
        return (
          <div key={i} style={{
            width: barWidth, height: h,
            background: color,
            borderRadius: barWidth / 2,
          }} />
        );
      })}
    </div>
  );
};

// ─── Mirrored equalizer (bars extending up and down from center) ──────
export const WaveformBarsMirrored: React.FC<{
  frame: number;
  count?: number;
  color?: string;
  width?: number;
  height?: number;
  gap?: number;
  style?: CSSProperties;
}> = ({ frame, count = 40, color = '#d97757', width = 480, height = 100, gap = 3, style }) => {
  const barW = (width - gap * (count - 1)) / count;
  const mid = height / 2;
  return (
    <div style={{ width, height, position: 'relative', ...style }}>
      {Array.from({ length: count }).map((_, i) => {
        const seed = i * 0.6 + frame * 0.1;
        const energy = (Math.sin(seed) * 0.5 + Math.sin(seed * 1.9) * 0.3 + 1) / 2;
        const h = energy * mid * 0.95;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: i * (barW + gap),
            top: mid - h,
            width: barW, height: h * 2,
            background: color,
            borderRadius: barW / 2,
          }} />
        );
      })}
    </div>
  );
};

// ─── Continuous wave line (sinusoidal) ────────────────────────────────
export const Waveform: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  amplitude?: number;
  wavelength?: number;
  speed?: number;
  style?: CSSProperties;
}> = ({
  frame, width = 600, height = 80, color = '#d97757', thickness = 3,
  amplitude = 0.4, wavelength = 80, speed = 0.1, style,
}) => {
  const mid = height / 2;
  const segs = Math.ceil(width / 6);
  let d = `M 0 ${mid}`;
  for (let i = 1; i <= segs; i++) {
    const x = (i / segs) * width;
    const phase = (x / wavelength) * Math.PI * 2 + frame * speed;
    const energy = (Math.sin(phase) * 0.5 + Math.sin(phase * 1.7) * 0.3) * amplitude;
    const y = mid + energy * mid;
    d += ` L ${x} ${y}`;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" />
    </svg>
  );
};

// ─── Vinyl record (spinning disk with label) ──────────────────────────
export const VinylRecord: React.FC<{
  frame: number;
  size?: number;
  labelColor?: string;
  labelText?: string;
  speed?: number;          // degrees per frame
  style?: CSSProperties;
}> = ({
  frame, size = 300, labelColor = '#d97757', labelText = '',
  speed = 4, style,
}) => {
  const rotation = frame * speed;
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 30%, #2a2a2e 0%, #0a0a0c 70%)',
      transform: `rotate(${rotation}deg)`,
      position: 'relative',
      boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
      ...style,
    }}>
      {/* Grooves */}
      {[0.95, 0.85, 0.75, 0.65, 0.55].map((scale, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.06)',
          transform: `scale(${scale})`,
        }} />
      ))}
      {/* Center label */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: size * 0.32, height: size * 0.32,
        background: labelColor,
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontWeight: 800,
        fontSize: size * 0.06,
        textAlign: 'center',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
      }}>{labelText}</div>
      {/* Center hole */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: size * 0.04, height: size * 0.04,
        background: '#0a0a0c',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
      }} />
    </div>
  );
};

// ─── Cassette tape (with spinning reels) ──────────────────────────────
export const CassetteTape: React.FC<{
  frame: number;
  width?: number;
  bg?: string;
  labelColor?: string;
  labelText?: string;
  style?: CSSProperties;
}> = ({ frame, width = 420, bg = '#d97757', labelColor = '#fff', labelText = 'MIXTAPE', style }) => {
  const height = width * 0.62;
  const reelSize = width * 0.18;
  const rotation = frame * 5;
  return (
    <div style={{
      width, height, background: bg,
      borderRadius: 14,
      position: 'relative',
      boxShadow: '0 20px 50px rgba(0,0,0,0.3), 0 0 0 2px rgba(0,0,0,0.1) inset',
      ...style,
    }}>
      {/* Label band */}
      <div style={{
        position: 'absolute',
        left: '10%', right: '10%', top: '12%',
        height: '36%',
        background: labelColor, color: bg,
        borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontWeight: 900,
        fontSize: width * 0.06,
        letterSpacing: -1,
      }}>{labelText}</div>
      {/* Reels */}
      {['25%', '75%'].map((left, i) => (
        <div key={i} style={{
          position: 'absolute',
          left, top: '70%',
          width: reelSize, height: reelSize,
          background: '#1a1a1c',
          borderRadius: '50%',
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          boxShadow: '0 0 0 4px rgba(0,0,0,0.2)',
        }}>
          {/* Reel teeth */}
          {Array.from({ length: 6 }).map((_, j) => (
            <div key={j} style={{
              position: 'absolute',
              left: '50%', top: '50%',
              width: 4, height: '40%',
              background: 'rgba(255,255,255,0.08)',
              transformOrigin: 'top center',
              transform: `translate(-50%, 0) rotate(${j * 60}deg)`,
            }} />
          ))}
        </div>
      ))}
    </div>
  );
};

// ─── Now-Playing pill (album art + title + scrolling text vibe) ───────
export const NowPlaying: React.FC<{
  title?: string;
  artist?: string;
  frame?: number;
  artColor?: string;
  bg?: string;
  color?: string;
  width?: number;
  style?: CSSProperties;
}> = ({
  title = 'Song title', artist = 'Artist',
  frame = 0, artColor = '#d97757', bg = '#1a1a1f', color = '#fff',
  width = 380, style,
}) => (
  <div style={{
    width, background: bg, color,
    borderRadius: 14, padding: 10,
    display: 'flex', alignItems: 'center', gap: 12,
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    boxShadow: '0 18px 40px rgba(0,0,0,0.3)',
    ...style,
  }}>
    {/* Album art (spinning) */}
    <div style={{
      width: 60, height: 60, borderRadius: 10,
      background: `linear-gradient(135deg, ${artColor}, #6b3df5)`,
      flexShrink: 0,
      transform: `rotate(${frame * 1}deg)`,
    }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{artist}</div>
    </div>
    {/* Equalizer */}
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 24 }}>
      {[0, 1, 2, 3].map(i => {
        const seed = i * 0.7 + frame * 0.12;
        const energy = (Math.sin(seed) * 0.5 + Math.sin(seed * 1.7) * 0.3 + 1) / 2;
        const h = Math.max(0.15, energy) * 24;
        return <div key={i} style={{ width: 3, height: h, background: artColor, borderRadius: 1.5 }} />;
      })}
    </div>
  </div>
);
