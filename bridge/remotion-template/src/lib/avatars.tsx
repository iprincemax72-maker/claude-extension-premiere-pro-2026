/**
 * Avatar components — circle/square user pictures with initials, group
 * stacks, status dots. Designed for chat mocks, lower-thirds, leaderboards.
 *
 * Usage:
 *   <Avatar name="Jane Doe" color="#d97757" size={56} />
 *   <Avatar src="/path.jpg" size={56} />
 *   <AvatarStack names={["Jane Doe", "Bob"]} size={42} />
 */

import React, { type CSSProperties } from 'react';

// Pick a deterministic color from a fixed palette based on the name string
const AVATAR_PALETTE = [
  '#d97757', '#5eb6e8', '#6fbf8a', '#ffce4a', '#ff5e5b',
  '#8b6dd9', '#e89a4e', '#3a8a82', '#c456a8', '#6a8aff',
];
function _avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function _initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Single avatar ────────────────────────────────────────────────────
export const Avatar: React.FC<{
  name?: string;
  src?: string;
  size?: number;
  color?: string;
  square?: boolean;
  ring?: string;
  status?: 'online' | 'offline' | 'busy' | null;
  style?: CSSProperties;
}> = ({ name = '', src, size = 56, color, square = false, ring, status = null, style }) => {
  const bg = color || (name ? _avatarColor(name) : '#5b5b6e');
  const initials = name ? _initials(name) : '';
  const statusColor = status === 'online' ? '#28c840' : status === 'busy' ? '#ff3b30' : '#888';
  return (
    <div style={{
      position: 'relative',
      width: size, height: size,
      borderRadius: square ? size * 0.16 : '50%',
      overflow: 'visible',
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      ...style,
    }}>
      {src ? (
        <img src={src} alt={name} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          borderRadius: square ? size * 0.16 : '50%',
        }} />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: bg, color: '#fff',
          borderRadius: square ? size * 0.16 : '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 700,
          fontSize: size * 0.4,
          letterSpacing: -0.5,
        }}>{initials}</div>
      )}
      {status && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: size * 0.28, height: size * 0.28,
          borderRadius: '50%',
          background: statusColor,
          border: `${Math.max(2, size * 0.05)}px solid #1a1a1f`,
        }} />
      )}
    </div>
  );
};

// ─── Stacked avatars (like "X and 3 others" row) ──────────────────────
export const AvatarStack: React.FC<{
  names: string[];
  size?: number;
  overlap?: number;     // pixels each subsequent avatar shifts left
  ringColor?: string;   // matching bg so they look cut into each other
  max?: number;         // how many to show before "+N"
}> = ({ names, size = 42, overlap = 14, ringColor = '#1a1a1f', max = 5 }) => {
  const shown = names.slice(0, max);
  const remainder = names.length - shown.length;
  return (
    <div style={{ display: 'inline-flex' }}>
      {shown.map((n, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}>
          <Avatar name={n} size={size} ring={ringColor} />
        </div>
      ))}
      {remainder > 0 && (
        <div style={{
          marginLeft: -overlap,
          width: size, height: size, borderRadius: '50%',
          background: '#3a3a3e', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 700, fontSize: size * 0.35,
          boxShadow: `0 0 0 3px ${ringColor}`,
        }}>+{remainder}</div>
      )}
    </div>
  );
};

// ─── Talking-head face placeholder (a rectangle silhouette) ───────────
export const FacePlaceholder: React.FC<{
  width?: number; height?: number; color?: string; style?: CSSProperties;
}> = ({ width = 200, height = 240, color = '#5b5b6e', style }) => (
  <svg width={width} height={height} viewBox="0 0 200 240" style={{
    borderRadius: 12, background: 'rgba(255,255,255,0.04)', ...style,
  }}>
    <circle cx="100" cy="92" r="42" fill={color} />
    <path d="M30 240 C 30 160, 170 160, 170 240" fill={color} />
  </svg>
);
