/**
 * Icon set — common pictograms as React SVG components so Claude doesn't
 * re-draw paths each time. Every icon accepts size, color, and style.
 *
 * Usage:
 *   <IconHeart color={p.accent} size={48} />
 *   <IconCheck color="#28c840" size={32} />
 *
 * Animated variants (heart pulse, bell ring) are in motion.ts via wiggle()/
 * pulse() — wrap an icon and apply the transform there.
 */

import React, { type CSSProperties } from 'react';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean | string;
  style?: CSSProperties;
};

const baseSvg = (size: number, style?: CSSProperties): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  style,
});

// ─── Status icons ─────────────────────────────────────────────────────
export const IconCheck: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const IconX: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

export const IconMinus: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/>
  </svg>
);

export const IconCircleCheck: React.FC<IconProps> = ({ size = 24, color = '#28c840', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
  </svg>
);

export const IconCircleX: React.FC<IconProps> = ({ size = 24, color = '#ff3b30', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
  </svg>
);

export const IconWarning: React.FC<IconProps> = ({ size = 24, color = '#ffce4a', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export const IconInfo: React.FC<IconProps> = ({ size = 24, color = '#5eb6e8', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

// ─── Social / engagement ──────────────────────────────────────────────
export const IconHeart: React.FC<IconProps> = ({ size = 24, color = '#ff5e5b', fill = true, strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill={fill ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

export const IconStar: React.FC<IconProps> = ({ size = 24, color = '#ffce4a', fill = true, strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill={fill ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

export const IconThumbsUp: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
  </svg>
);

export const IconShare: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);

export const IconBookmark: React.FC<IconProps> = ({ size = 24, color = 'currentColor', fill = false, strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill={fill ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);

export const IconBell: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

export const IconChat: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

// ─── Media / playback ─────────────────────────────────────────────────
export const IconPlay: React.FC<IconProps> = ({ size = 24, color = 'currentColor', style }) => (
  <svg {...baseSvg(size, style)} fill={color}>
    <polygon points="6 4 20 12 6 20 6 4"/>
  </svg>
);

export const IconPause: React.FC<IconProps> = ({ size = 24, color = 'currentColor', style }) => (
  <svg {...baseSvg(size, style)} fill={color}>
    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
  </svg>
);

export const IconSkipForward: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
  </svg>
);

export const IconVolumeOn: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);

export const IconVolumeMute: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
);

// ─── Trends / arrows ──────────────────────────────────────────────────
export const IconTrendUp: React.FC<IconProps> = ({ size = 24, color = '#28c840', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);

export const IconTrendDown: React.FC<IconProps> = ({ size = 24, color = '#ff3b30', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
  </svg>
);

export const IconArrowUp: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
  </svg>
);

// ─── Tools / objects ──────────────────────────────────────────────────
export const IconCamera: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);

export const IconVideo: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

export const IconImage: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

export const IconMic: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

export const IconClock: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

export const IconCalendar: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

export const IconUser: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

export const IconDollar: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2.5, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

export const IconLightbulb: React.FC<IconProps> = ({ size = 24, color = '#ffce4a', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
  </svg>
);

export const IconFire: React.FC<IconProps> = ({ size = 24, color = '#ff5e5b', fill = true, style }) => (
  <svg {...baseSvg(size, style)} fill={fill ? color : 'none'} stroke={color} strokeWidth={2} strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>
);

export const IconSparkle: React.FC<IconProps> = ({ size = 24, color = '#ffd43d', fill = true, style }) => (
  <svg {...baseSvg(size, style)} fill={fill ? color : 'none'} stroke={color} strokeWidth={2} strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 17l.7 1.7L7 19l-1.3.4L5 21l-.7-1.6L3 19l1.3-.3L5 17z"/><path d="M19 16l.9 2.4L22 19l-2.1.6L19 22l-.9-2.4L16 19l2.1-.6L19 16z"/>
  </svg>
);

// ─── App / system ─────────────────────────────────────────────────────
export const IconSearch: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const IconSettings: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export const IconHome: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export const IconLock: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export const IconRocket: React.FC<IconProps> = ({ size = 24, color = '#ff5e5b', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>
);

export const IconTrophy: React.FC<IconProps> = ({ size = 24, color = '#ffce4a', strokeWidth = 2, style }) => (
  <svg {...baseSvg(size, style)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);

// Re-export grouped (so Claude can `import * as Icons from '../lib/icons'`).
