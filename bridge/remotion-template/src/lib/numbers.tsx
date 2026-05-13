/**
 * Number components — animated counters with proper formatting. Extends
 * the basic counter() in motion.ts with currency, %, K/M/B abbreviation,
 * comma separators, decimal control.
 *
 *   <CountUp frame={frame} to={1234567} format="commas" prefix="$" />
 *   <CountUp frame={frame} to={42.7}    format="percent" />
 *   <CountUp frame={frame} to={1240000} format="abbrev" />
 */

import React, { type CSSProperties } from 'react';
import { interpolate } from 'remotion';
import { EASE } from './easings';

type Format = 'plain' | 'commas' | 'percent' | 'abbrev' | 'currency' | 'time-mmss';

function _abbrev(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9)  return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(abs >= 1e7  ? 0 : 1) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(abs >= 1e4  ? 0 : 1) + 'K';
  return Math.round(n).toString();
}
function _commas(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function _mmss(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n: number, format: Format, decimals: number = 0, prefix = '', suffix = ''): string {
  let body: string;
  switch (format) {
    case 'commas':   body = _commas(n, decimals); break;
    case 'percent':  body = (n).toFixed(decimals) + '%'; break;
    case 'abbrev':   body = _abbrev(n); break;
    case 'currency': body = '$' + _commas(n, decimals); break;
    case 'time-mmss':body = _mmss(n); break;
    default:         body = n.toFixed(decimals);
  }
  return prefix + body + suffix;
}

// ─── CountUp — animated counter that lands on `to` ────────────────────
export const CountUp: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  from?: number;
  to: number;
  format?: Format;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: CSSProperties;
  className?: string;
}> = ({
  frame, start = 0, dur = 30, from = 0, to, format = 'plain', decimals = 0,
  prefix = '', suffix = '', style, className,
}) => {
  const v = interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return <span style={style} className={className}>{formatNumber(v, format, decimals, prefix, suffix)}</span>;
};

// ─── CountUpFlip — odometer-style digit flip ──────────────────────────
// Each digit slides vertically as it changes. Looks like an old odometer.
export const CountUpFlip: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  to: number;
  digits?: number;          // pad with leading zeros up to this many digits
  digitWidth?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  style?: CSSProperties;
}> = ({
  frame, start = 0, dur = 30, to, digits = 0,
  digitWidth = 32, fontSize = 60, color = '#fff',
  fontFamily = '"SF Pro Display","Inter",sans-serif', fontWeight = 800,
  style,
}) => {
  const v = interpolate(frame, [start, start + dur], [0, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const str = digits > 0
    ? String(Math.floor(v)).padStart(digits, '0')
    : String(Math.floor(v));
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 0,
      fontFamily, fontSize, fontWeight, color,
      lineHeight: fontSize + 'px',
      ...style,
    }}>
      {str.split('').map((ch, i) => {
        const isDigit = /[0-9]/.test(ch);
        if (!isDigit) return <span key={i} style={{ width: digitWidth * 0.4 }}>{ch}</span>;
        const d = parseInt(ch, 10);
        return (
          <span key={i} style={{
            display: 'inline-block',
            width: digitWidth,
            height: fontSize,
            overflow: 'hidden',
            position: 'relative',
            textAlign: 'center',
          }}>
            <div style={{
              transform: `translateY(-${d * fontSize}px)`,
              transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              {[0,1,2,3,4,5,6,7,8,9].map(n => (
                <div key={n} style={{ height: fontSize, lineHeight: fontSize + 'px' }}>{n}</div>
              ))}
            </div>
          </span>
        );
      })}
    </div>
  );
};

// ─── BigStat — kicker label + big animated number + suffix ────────────
export const BigStat: React.FC<{
  frame: number;
  label?: string;
  to: number;
  format?: Format;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  labelColor?: string;
  fontSize?: number;
  labelSize?: number;
  start?: number;
  dur?: number;
  style?: CSSProperties;
}> = ({
  frame, label, to, format = 'plain', decimals = 0, prefix = '', suffix = '',
  color = '#fff', labelColor = '#888', fontSize = 160, labelSize = 18,
  start = 0, dur = 30, style,
}) => {
  const v = interpolate(frame, [start, start + dur], [0, to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const labelOp = interpolate(frame, [start - 4, start + 6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={style}>
      {label && <div style={{
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontSize: labelSize, fontWeight: 600,
        letterSpacing: 1.5, textTransform: 'uppercase',
        color: labelColor, marginBottom: 10, opacity: labelOp,
      }}>{label}</div>}
      <div style={{
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontSize, fontWeight: 800, letterSpacing: -4,
        lineHeight: 1, color,
      }}>{formatNumber(v, format, decimals, prefix, suffix)}</div>
    </div>
  );
};

// ─── Price tag — rotated price with leading "$" ───────────────────────
export const PriceTag: React.FC<{
  amount: number;
  decimals?: number;
  bg?: string;
  color?: string;
  rotation?: number;
  size?: number;
  style?: CSSProperties;
}> = ({ amount, decimals = 0, bg = '#ff5e5b', color = '#fff', rotation = -8, size = 90, style }) => (
  <div style={{
    display: 'inline-block',
    background: bg, color,
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    fontWeight: 900, fontSize: size,
    padding: '12px 28px',
    borderRadius: 12,
    transform: `rotate(${rotation}deg)`,
    boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
    letterSpacing: -2,
    ...style,
  }}>${_commas(amount, decimals)}</div>
);

// ─── Delta arrow + number (gain/loss indicator) ──────────────────────
export const DeltaBadge: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
  gainColor?: string;
  lossColor?: string;
  size?: number;
  style?: CSSProperties;
}> = ({ value, decimals = 1, suffix = '%', gainColor = '#28c840', lossColor = '#ff3b30', size = 28, style }) => {
  const positive = value >= 0;
  const color = positive ? gainColor : lossColor;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      color,
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      fontWeight: 700, fontSize: size,
      ...style,
    }}>
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill={color}>
        {positive
          ? <path d="M12 4l8 12H4z"/>
          : <path d="M12 20L4 8h16z"/>}
      </svg>
      {Math.abs(value).toFixed(decimals)}{suffix}
    </span>
  );
};
