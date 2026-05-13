/**
 * Chart components — animated data viz that Claude doesn't have to hand-roll
 * from scratch. Each chart accepts data + animation props.
 *
 * All charts use Remotion frame-based animation. Pass `frame` and a `start`
 * + `dur` for the reveal. After `dur`, the chart sits at its final state.
 *
 * Usage:
 *   const frame = useCurrentFrame();
 *   <BarChart frame={frame} start={5} dur={30}
 *             data={[{ label: 'Jan', value: 40 }, { label: 'Feb', value: 80 }]}
 *             color={p.accent} />
 */

import React from 'react';
import { interpolate } from 'remotion';
import { EASE } from './easings';

export type DataPoint = { label: string; value: number; color?: string };

// ─── Bar chart ────────────────────────────────────────────────────────
export const BarChart: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  labelColor?: string;
  showValues?: boolean;
  gap?: number;
}> = ({ frame, start = 0, dur = 30, data, width = 600, height = 320, color = '#d97757', labelColor = '#888', showValues = true, gap = 16 }) => {
  const maxV = Math.max(...data.map(d => d.value), 1);
  const barW = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg width={width} height={height + 40} viewBox={`0 0 ${width} ${height + 40}`}>
      {data.map((d, i) => {
        const itemStart = start + i * 3;
        const p = interpolate(frame, [itemStart, itemStart + dur], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
        });
        const fullH = (d.value / maxV) * height;
        const h = fullH * p;
        const x = i * (barW + gap);
        const y = height - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={d.color || color} rx={4} />
            {showValues && p > 0.6 && (
              <text x={x + barW / 2} y={y - 8} textAnchor="middle" fill={labelColor} fontSize="14" fontFamily="SF Pro Display,Inter,sans-serif" fontWeight="700">
                {Math.round(d.value * p)}
              </text>
            )}
            <text x={x + barW / 2} y={height + 22} textAnchor="middle" fill={labelColor} fontSize="13" fontFamily="SF Pro Display,Inter,sans-serif">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── Line chart (draws the path on) ───────────────────────────────────
export const LineChart: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  showDots?: boolean;
}> = ({ frame, start = 0, dur = 36, data, width = 600, height = 280, color = '#d97757', thickness = 4, showDots = true }) => {
  if (data.length < 2) return null;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const xStep = width / (data.length - 1);
  const points = data.map((d, i) => ({ x: i * xStep, y: height - (d.value / maxV) * height }));
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  // Compute path length proxy for draw-on
  const drawP = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  // Use SVG dasharray trick — actual length approximated by linear segments
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return (
    <svg width={width} height={height + 40} viewBox={`0 0 ${width} ${height + 40}`}>
      <path d={path} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={len} strokeDashoffset={len * (1 - drawP)} />
      {showDots && points.map((p, i) => {
        const dotP = interpolate(frame, [start + (i / points.length) * dur, start + (i / points.length) * dur + 8], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        return <circle key={i} cx={p.x} cy={p.y} r={6 * dotP} fill={color} />;
      })}
    </svg>
  );
};

// ─── Pie chart ────────────────────────────────────────────────────────
export const PieChart: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  data: DataPoint[];
  size?: number;
  colors?: string[];
}> = ({ frame, start = 0, dur = 36, data, size = 280, colors = ['#d97757', '#5eb6e8', '#6fbf8a', '#ffce4a', '#ff5e5b'] }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  const drawP = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  let accum = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const startAngle = (accum / total) * Math.PI * 2 - Math.PI / 2;
        accum += d.value;
        const endAngle  = (accum / total) * Math.PI * 2 - Math.PI / 2;
        const visEnd = startAngle + (endAngle - startAngle) * drawP;
        if (visEnd <= startAngle) return null;
        const large = visEnd - startAngle > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(visEnd);
        const y2 = cy + r * Math.sin(visEnd);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        return <path key={i} d={path} fill={d.color || colors[i % colors.length]} />;
      })}
    </svg>
  );
};

// ─── Donut chart (pie with hole) ─────────────────────────────────────
export const DonutChart: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  data: DataPoint[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerColor?: string;
  colors?: string[];
}> = ({ frame, start = 0, dur = 36, data, size = 280, thickness = 36, centerLabel, centerColor = '#fff', colors = ['#d97757', '#5eb6e8', '#6fbf8a', '#ffce4a', '#ff5e5b'] }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - thickness / 2 - 4;
  const drawP = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  let accum = 0;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const segLen = (d.value / total) * circumference;
        const offset = (accum / total) * circumference;
        accum += d.value;
        const visibleLen = segLen * drawP;
        return (
          <circle key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={d.color || colors[i % colors.length]}
            strokeWidth={thickness}
            strokeDasharray={`${visibleLen} ${circumference}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      {centerLabel && (
        <text x={cx} y={cy + 8} textAnchor="middle" fill={centerColor} fontSize={size * 0.18} fontFamily="SF Pro Display,Inter,sans-serif" fontWeight="800">
          {centerLabel}
        </text>
      )}
    </svg>
  );
};

// ─── Progress bar (linear) ────────────────────────────────────────────
export const ProgressLine: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  target?: number;       // 0..1
  width?: number;
  height?: number;
  bg?: string;
  fill?: string;
  showLabel?: boolean;
  labelColor?: string;
}> = ({ frame, start = 0, dur = 30, target = 0.78, width = 400, height = 16, bg = 'rgba(255,255,255,0.1)', fill = '#d97757', showLabel = true, labelColor = '#fff' }) => {
  const p = interpolate(frame, [start, start + dur], [0, target], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  return (
    <div style={{ width, height: height + (showLabel ? 28 : 0) }}>
      <div style={{ width, height, background: bg, borderRadius: height / 2, overflow: 'hidden' }}>
        <div style={{ width: `${p * 100}%`, height: '100%', background: fill, borderRadius: height / 2 }} />
      </div>
      {showLabel && (
        <div style={{ marginTop: 8, fontFamily: 'SF Pro Display,Inter,sans-serif', fontWeight: 700, fontSize: 18, color: labelColor }}>
          {Math.round(p * 100)}%
        </div>
      )}
    </div>
  );
};

// ─── Progress ring (circular) ─────────────────────────────────────────
export const ProgressRing: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  target?: number;       // 0..1
  size?: number;
  thickness?: number;
  bg?: string;
  fill?: string;
  centerLabel?: string;
  labelColor?: string;
}> = ({ frame, start = 0, dur = 30, target = 0.78, size = 200, thickness = 16, bg = 'rgba(255,255,255,0.1)', fill = '#d97757', centerLabel, labelColor = '#fff' }) => {
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const p = interpolate(frame, [start, start + dur], [0, target], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const label = centerLabel != null ? centerLabel : `${Math.round(p * 100)}%`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke={bg} strokeWidth={thickness} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={fill} strokeWidth={thickness} fill="none"
        strokeDasharray={`${c * p} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + size*0.07} textAnchor="middle" fill={labelColor}
        fontFamily="SF Pro Display,Inter,sans-serif" fontWeight="800" fontSize={size * 0.2}>{label}</text>
    </svg>
  );
};

// ─── Gauge / speedometer (half-circle) ────────────────────────────────
export const Gauge: React.FC<{
  frame: number;
  start?: number;
  dur?: number;
  target?: number;       // 0..1
  size?: number;
  thickness?: number;
  bg?: string;
  fill?: string;
  centerLabel?: string;
  labelColor?: string;
}> = ({ frame, start = 0, dur = 30, target = 0.78, size = 280, thickness = 24, bg = 'rgba(255,255,255,0.1)', fill = '#d97757', centerLabel, labelColor = '#fff' }) => {
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2 + 10;
  const halfC = Math.PI * r;
  const p = interpolate(frame, [start, start + dur], [0, target], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.expoOut,
  });
  const label = centerLabel != null ? centerLabel : `${Math.round(p * 100)}%`;
  return (
    <svg width={size} height={size * 0.6 + 20} viewBox={`0 0 ${size} ${size * 0.6 + 20}`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={bg} strokeWidth={thickness} fill="none" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={fill} strokeWidth={thickness} fill="none" strokeLinecap="round"
        strokeDasharray={`${halfC * p} ${halfC}`} />
      <text x={cx} y={cy - 14} textAnchor="middle" fill={labelColor}
        fontFamily="SF Pro Display,Inter,sans-serif" fontWeight="800" fontSize={size * 0.18}>{label}</text>
    </svg>
  );
};

// ─── Sparkline (tiny line chart, no labels) ───────────────────────────
export const Sparkline: React.FC<{
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
}> = ({ data, width = 160, height = 48, color = '#28c840', thickness = 2.5 }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const xStep = width / (data.length - 1);
  const path = data.map((v, i) => {
    const x = i * xStep;
    const y = height - ((v - min) / range) * height;
    return (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
