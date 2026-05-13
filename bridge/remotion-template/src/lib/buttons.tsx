/**
 * Button components — CTA buttons, app store badges, soft buttons.
 * Most are pure visual mocks (they don't navigate); pass label + style.
 *
 *   <CTAButton label="Get started" color="#d97757" />
 *   <AppStoreBadge platform="apple" />
 *   <GhostButton label="Learn more" />
 */

import React, { type CSSProperties } from 'react';

// ─── Primary CTA button — gradient pill with shadow ───────────────────
export const CTAButton: React.FC<{
  label: string;
  color?: string;
  color2?: string;
  textColor?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
  style?: CSSProperties;
}> = ({
  label, color = '#d97757', color2, textColor = '#fff',
  size = 'md', icon, style,
}) => {
  const sizeMap = {
    sm: { padding: '8px 16px', fontSize: 14, gap: 6 },
    md: { padding: '12px 24px', fontSize: 16, gap: 8 },
    lg: { padding: '16px 32px', fontSize: 19, gap: 10 },
    xl: { padding: '20px 44px', fontSize: 24, gap: 12 },
  }[size];
  const grad = color2 ? `linear-gradient(135deg, ${color2} 0%, ${color} 100%)` : color;
  return (
    <button style={{
      ...sizeMap,
      background: grad,
      color: textColor,
      border: 'none',
      borderRadius: 100,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 700,
      letterSpacing: -0.2,
      cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center',
      boxShadow: `0 8px 24px ${color}55, 0 1px 0 rgba(255,255,255,0.25) inset`,
      ...style,
    }}>
      {icon}
      {label}
    </button>
  );
};

// ─── Ghost button — transparent with thin border ──────────────────────
export const GhostButton: React.FC<{
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
}> = ({ label, color = 'currentColor', size = 'md', style }) => {
  const sizeMap = {
    sm: { padding: '6px 14px', fontSize: 13 },
    md: { padding: '10px 20px', fontSize: 15 },
    lg: { padding: '14px 28px', fontSize: 17 },
  }[size];
  return (
    <button style={{
      ...sizeMap,
      background: 'transparent',
      color, border: `2px solid ${color}`,
      borderRadius: 100,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 600,
      cursor: 'pointer',
      ...style,
    }}>{label}</button>
  );
};

// ─── Soft button (low-key, no shadow) ────────────────────────────────
export const SoftButton: React.FC<{
  label: string;
  bg?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
}> = ({ label, bg = 'rgba(255,255,255,0.08)', color = '#fff', size = 'md', style }) => {
  const sizeMap = {
    sm: { padding: '6px 14px', fontSize: 13 },
    md: { padding: '10px 20px', fontSize: 15 },
    lg: { padding: '14px 28px', fontSize: 17 },
  }[size];
  return (
    <button style={{
      ...sizeMap, background: bg, color,
      border: 'none', borderRadius: 12,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 600,
      cursor: 'pointer',
      ...style,
    }}>{label}</button>
  );
};

// ─── Subscribe button (YouTube style — red pill) ─────────────────────
export const SubscribeButton: React.FC<{
  label?: string;
  subscribed?: boolean;
  style?: CSSProperties;
}> = ({ label, subscribed = false, style }) => {
  const text = label || (subscribed ? 'Subscribed' : 'Subscribe');
  return (
    <button style={{
      padding: '11px 22px',
      background: subscribed ? '#272727' : '#cc0000',
      color: subscribed ? '#aaa' : '#fff',
      border: 'none',
      borderRadius: 6,
      fontFamily: 'Roboto,"SF Pro Display",sans-serif',
      fontWeight: 700,
      fontSize: 15,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      cursor: 'pointer',
      ...style,
    }}>{text}</button>
  );
};

// ─── App Store badge ─────────────────────────────────────────────────
export const AppStoreBadge: React.FC<{
  platform?: 'apple' | 'google';
  style?: CSSProperties;
}> = ({ platform = 'apple', style }) => {
  if (platform === 'apple') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: '#000', color: '#fff',
        padding: '8px 18px',
        borderRadius: 10,
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        ...style,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <div>
          <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.3 }}>Download on the</div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>App Store</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: '#000', color: '#fff',
      padding: '8px 18px',
      borderRadius: 10,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      ...style,
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24">
        <path fill="#34a853" d="M3 20l9-9V3z"/>
        <path fill="#ea4335" d="M3 3l13 8.5L12 14z"/>
        <path fill="#fbbc04" d="M16 11.5L21 14l-4.5 2.5z"/>
        <path fill="#4285f4" d="M3 21l9-9 4 2.5L3 21z"/>
      </svg>
      <div>
        <div style={{ fontSize: 10, opacity: 0.8 }}>GET IT ON</div>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>Google Play</div>
      </div>
    </div>
  );
};

// ─── Toggle switch ───────────────────────────────────────────────────
export const Toggle: React.FC<{
  on?: boolean;
  size?: number;
  onColor?: string;
  offColor?: string;
  style?: CSSProperties;
}> = ({ on = true, size = 32, onColor = '#28c840', offColor = '#3a3a3e', style }) => (
  <div style={{
    width: size * 1.85, height: size,
    background: on ? onColor : offColor,
    borderRadius: size / 2,
    position: 'relative',
    transition: 'background 0.3s',
    ...style,
  }}>
    <div style={{
      position: 'absolute',
      width: size - 6, height: size - 6,
      background: '#fff',
      borderRadius: '50%',
      top: 3,
      left: on ? size * 0.85 + 3 : 3,
      transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
    }} />
  </div>
);

// ─── Chip / pill (like a tag) ─────────────────────────────────────────
export const Chip: React.FC<{
  label: string;
  bg?: string;
  color?: string;
  border?: string;
  size?: 'sm' | 'md';
  removable?: boolean;
  style?: CSSProperties;
}> = ({ label, bg = 'rgba(255,255,255,0.06)', color = '#fff', border, size = 'md', removable = false, style }) => {
  const sizeMap = {
    sm: { padding: '3px 9px', fontSize: 12 },
    md: { padding: '5px 12px', fontSize: 13 },
  }[size];
  return (
    <span style={{
      ...sizeMap,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: bg, color,
      border: border ? `1px solid ${border}` : 'none',
      borderRadius: 100,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 500,
      ...style,
    }}>
      {label}
      {removable && <span style={{ opacity: 0.6 }}>×</span>}
    </span>
  );
};
