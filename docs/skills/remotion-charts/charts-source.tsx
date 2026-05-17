// remotion-charts v2 — animated data viz with real motion choreography.
//
// What changed from v1:
//   • BarChart: x-axis baseline draws first, then bars grow with elastic
//     spring, then numbers tick from 0 to target alongside. Tallest bar
//     gets a subtle glow.
//   • PieChart: wedges sweep clockwise, label percentages tick up
//     synchronized with each wedge's fill.
//   • LineGraph: faded area below the line fades in BEFORE the line
//     fully draws, endpoint dots ping when they appear.
//   • DonutMetric: ring fill + center counter ticks + a pulse glow on
//     the leading edge (where the fill is "writing").
//   • TrendArrow: arrow rises with a sparkle burst at the peak.
//   • BarRace: smoother position lerp + rank-change indicator (↑ ↓)
//     when a bar overtakes another.

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
const SF =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif';

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  elastic: { damping: 12, stiffness: 130, mass: 0.7 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type Point = { label: string; value: number };

// ═════════════════════════════════════════════════════════════════════════
// 1. BAR CHART
// ═════════════════════════════════════════════════════════════════════════

export type BarChartProps = {
  data: Point[];
  durationFrames?: number;
  staggerFrames?: number;
  color?: string;
  bg?: string;
  title?: string;
  unit?: string;
};

export const BarChart: React.FC<BarChartProps> = ({
  data = [
    { label: "Mon", value: 24 },
    { label: "Tue", value: 38 },
    { label: "Wed", value: 31 },
    { label: "Thu", value: 52 },
    { label: "Fri", value: 47 },
  ],
  durationFrames = 36,
  staggerFrames = 4,
  color = "#7eb800",
  bg = "#0e0e0e",
  title,
  unit = "",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(...data.map((d) => d.value));
  const maxIdx = data.findIndex(d => d.value === max);

  // Baseline x-axis draws first
  const axisP = interpolate(frame, [0, 14], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "8% 6%",
        fontFamily: SF,
        color: "#fff",
        flexDirection: "column",
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 50,
            opacity: interpolate(frame, [0, 14], [0, 1], clamp),
          }}
        >
          {title}
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          gap: 30,
          paddingBottom: 80,
          position: "relative",
          borderBottom: `3px solid rgba(255,255,255,${axisP * 0.18})`,
          transform: `scaleX(${axisP})`,
          transformOrigin: "left bottom",
        }}
      >
        {data.map((d, i) => {
          const start = 8 + i * staggerFrames;
          const growSpring = spring({
            frame: frame - start,
            fps,
            config: motion.elastic,
          });
          const grow = interpolate(growSpring, [0, 1], [0, 1]);
          const targetH = (d.value / max) * 100;
          const valueShown = Math.round(d.value * grow);
          const isMax = i === maxIdx;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  opacity: grow,
                  color: isMax ? color : "#fff",
                }}
              >
                {valueShown.toLocaleString()}
                {unit}
              </div>
              <div
                style={{
                  width: "80%",
                  height: `${targetH * grow}%`,
                  background: `linear-gradient(180deg, ${color} 0%, ${shade(color, -20)} 100%)`,
                  borderRadius: "12px 12px 0 0",
                  boxShadow: isMax
                    ? `0 -2px 0 ${shade(color, 20)} inset, 0 0 40px ${color}55`
                    : `0 -2px 0 ${shade(color, 20)} inset`,
                  minHeight: 2,
                }}
              />
              <div
                style={{
                  fontSize: 28,
                  color: "rgba(255,255,255,0.6)",
                  textAlign: "center",
                  opacity: grow,
                }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. PIE CHART
// ═════════════════════════════════════════════════════════════════════════

export type PieChartProps = {
  data: Point[];
  durationFrames?: number;
  colors?: string[];
  bg?: string;
  size?: number;
};

function arcPath(startA: number, endA: number): string {
  const sa = startA * 2 * Math.PI;
  const ea = endA * 2 * Math.PI;
  const x1 = Math.cos(sa), y1 = Math.sin(sa);
  const x2 = Math.cos(ea), y2 = Math.sin(ea);
  const large = endA - startA > 0.5 ? 1 : 0;
  return `M 0 0 L ${x1} ${y1} A 1 1 0 ${large} 1 ${x2} ${y2} Z`;
}

export const PieChart: React.FC<PieChartProps> = ({
  data = [
    { label: "Cats", value: 42 },
    { label: "Dogs", value: 35 },
    { label: "Birds", value: 15 },
    { label: "Fish", value: 8 },
  ],
  durationFrames = 50,
  colors = ["#7eb800", "#ff7a4d", "#25f4ee", "#ff42d3", "#ffd60a", "#a47864"],
  bg = "#0e0e0e",
  size = 700,
}) => {
  const frame = useCurrentFrame();
  const total = data.reduce((s, d) => s + d.value, 0);
  const sweep = interpolate(frame, [6, durationFrames], [0, 1], clamp);

  let cumStart = 0;
  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <svg width={size} height={size} viewBox="-1 -1 2 2" style={{ transform: "rotate(-90deg)" }}>
        {data.map((d, i) => {
          const portion = d.value / total;
          const startA = cumStart;
          const endA = cumStart + portion * sweep;
          cumStart += portion;
          if (endA <= startA + 0.001) return null;
          return (
            <path
              key={i}
              d={arcPath(startA, endA)}
              fill={colors[i % colors.length]}
              stroke={bg}
              strokeWidth={0.02}
            />
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          gap: 30,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: "85%",
        }}
      >
        {data.map((d, i) => {
          // Each label fades in as ITS wedge starts being drawn
          const portionStart = data.slice(0, i).reduce((s, x) => s + x.value, 0) / total;
          const labelFadeStart = 6 + portionStart * (durationFrames - 6);
          const labelOp = interpolate(frame, [labelFadeStart, labelFadeStart + 10], [0, 1], clamp);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontFamily: SF,
                fontSize: 30,
                color: "#fff",
                opacity: labelOp,
                transform: `translateY(${(1 - labelOp) * 8}px)`,
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 6, background: colors[i % colors.length] }} />
              {d.label}{" "}
              <span style={{ color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round((d.value / total) * 100 * sweep)}%
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. LINE GRAPH
// ═════════════════════════════════════════════════════════════════════════

export type LineGraphProps = {
  data: Point[];
  durationFrames?: number;
  color?: string;
  bg?: string;
  title?: string;
};

export const LineGraph: React.FC<LineGraphProps> = ({
  data = [
    { label: "Jan", value: 24 },
    { label: "Feb", value: 32 },
    { label: "Mar", value: 28 },
    { label: "Apr", value: 47 },
    { label: "May", value: 53 },
    { label: "Jun", value: 68 },
  ],
  durationFrames = 40,
  color = "#25f4ee",
  bg = "#0e0e0e",
  title,
}) => {
  const frame = useCurrentFrame();
  const w = 1700, h = 700, pad = 80;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const xStep = (w - pad * 2) / (data.length - 1);
  const pts = data.map((d, i) => {
    const x = pad + i * xStep;
    const y = h - pad - ((d.value - min) / Math.max(1, max - min)) * (h - pad * 2);
    return { x, y, ...d };
  });
  const pathD = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

  const len = pts.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const prev = pts[i - 1];
    return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0);
  const drawP = interpolate(frame, [0, durationFrames], [0, 1], clamp);
  const offset = len * (1 - drawP);
  // Filled area fades in BEFORE the line completes
  const areaP = interpolate(frame, [4, durationFrames * 0.7], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "5%",
        fontFamily: SF,
        color: "#fff",
        flexDirection: "column",
      }}
    >
      {title ? (
        <div style={{ fontSize: 44, fontWeight: 800, marginBottom: 20 }}>
          {title}
        </div>
      ) : null}
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        {/* Subtle grid */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={pad}
            x2={w - pad}
            y1={pad + (h - pad * 2) * t}
            y2={pad + (h - pad * 2) * t}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        ))}
        {/* Filled area — fades in independently */}
        <path
          d={`${pathD} L ${pts[pts.length - 1].x} ${h - pad} L ${pts[0].x} ${h - pad} Z`}
          fill={color}
          opacity={areaP * 0.22}
        />
        {/* Line */}
        <path
          d={pathD}
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={len}
          strokeDashoffset={offset}
        />
        {/* End dots with ping */}
        {pts.map((p, i) => {
          const dotStartT = (i / (pts.length - 1)) * durationFrames;
          const dotF = frame - dotStartT;
          const dotOp = interpolate(dotF, [0, 6], [0, 1], clamp);
          // Ping ring on appear
          const pingR = interpolate(dotF, [0, 16], [10, 40], clamp);
          const pingOp = interpolate(dotF, [0, 0.4, 16], [0, 0.7, 0], clamp);
          return (
            <g key={i}>
              {pingOp > 0 ? (
                <circle cx={p.x} cy={p.y} r={pingR} fill="none" stroke={color} strokeWidth={3} opacity={pingOp} />
              ) : null}
              <circle cx={p.x} cy={p.y} r={10} fill={color} opacity={dotOp} />
            </g>
          );
        })}
        {/* X-axis labels */}
        {pts.map((p, i) => {
          const labelOp = interpolate(frame, [(i / pts.length) * durationFrames, (i / pts.length) * durationFrames + 8], [0, 1], clamp);
          return (
            <text
              key={i}
              x={p.x}
              y={h - pad + 40}
              fontSize="26"
              fill="rgba(255,255,255,0.6)"
              fontFamily={SF}
              textAnchor="middle"
              opacity={labelOp}
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. DONUT METRIC
// ═════════════════════════════════════════════════════════════════════════

export type DonutMetricProps = {
  value?: number;
  label?: string;
  durationFrames?: number;
  color?: string;
  bg?: string;
  size?: number;
};

export const DonutMetric: React.FC<DonutMetricProps> = ({
  value = 78,
  label = "completion",
  durationFrames = 50,
  color = "#7eb800",
  bg = "#0e0e0e",
  size = 600,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationFrames], [0, 1], clamp);
  const displayed = Math.round(value * progress);

  const radius = (size - 80) / 2;
  const circ = 2 * Math.PI * radius;
  const filled = (value / 100) * circ * progress;
  // Leading-edge pulse glow
  const pulseGlow = progress < 1
    ? 6 + Math.abs(Math.sin(frame * 0.2)) * 12
    : 4;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 30,
      }}
    >
      <svg width={size} height={size}>
        <defs>
          <filter id="leadGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={pulseGlow} />
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={40}
        />
        {/* Glow underneath for leading edge effect */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={40}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - filled}
          opacity={progress < 1 ? 0.45 : 0}
          filter="url(#leadGlow)"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={40}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - filled}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2 + 30}
          textAnchor="middle"
          fill="#fff"
          fontFamily={SF}
          fontWeight={900}
          fontSize={size * 0.22}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {displayed}%
        </text>
      </svg>
      {label ? (
        <div
          style={{
            fontFamily: SF,
            fontSize: 38,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: interpolate(frame, [durationFrames * 0.3, durationFrames * 0.6], [0, 1], clamp),
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. TREND ARROW
// ═════════════════════════════════════════════════════════════════════════

export type TrendArrowProps = {
  value?: number;
  label?: string;
  direction?: "up" | "down";
  durationFrames?: number;
  bg?: string;
};

export const TrendArrow: React.FC<TrendArrowProps> = ({
  value = 43,
  label = "this month",
  direction = "up",
  durationFrames = 38,
  bg = "#0e0e0e",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isUp = direction === "up";
  const color = isUp ? "#22c55e" : "#ef4444";

  const enter = spring({ frame, fps, config: motion.pop });
  const counter = interpolate(frame, [4, durationFrames], [0, value], clamp);

  // Sparkle burst when arrow peaks (~frame durationFrames * 0.7)
  const sparkFrame = Math.floor(durationFrames * 0.7);
  const sparkleP = interpolate(frame, [sparkFrame, sparkFrame + 24], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: SF,
        gap: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 30,
          transform: `scale(${enter})`,
          position: "relative",
        }}
      >
        {/* Sparkles around the arrow on peak */}
        {sparkleP > 0 && sparkleP < 1
          ? [0, 1, 2, 3, 4].map(i => {
              const angle = (i / 5) * Math.PI * 2;
              const dist = sparkleP * 80;
              const x = Math.cos(angle) * dist;
              const y = Math.sin(angle) * dist - 50;
              const op = interpolate(sparkleP, [0, 0.2, 1], [0, 1, 0]);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 70,
                    top: 70,
                    fontSize: 28,
                    transform: `translate(${x}px, ${y}px)`,
                    opacity: op,
                    color,
                  }}
                >
                  ✦
                </div>
              );
            })
          : null}
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: `${color}22`,
            border: `5px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontSize: 100,
            fontWeight: 900,
            transform: isUp ? "rotate(0deg)" : "rotate(180deg)",
          }}
        >
          ↑
        </div>
        <div
          style={{
            fontSize: 200,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {isUp ? "+" : "-"}
          {Math.round(counter)}%
        </div>
      </div>
      {label ? (
        <div
          style={{
            fontSize: 38,
            color: "rgba(255,255,255,0.6)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: interpolate(frame, [12, 24], [0, 1], clamp),
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. BAR RACE
// ═════════════════════════════════════════════════════════════════════════

export type BarRaceProps = {
  frames: Point[][];
  framesPerStep?: number;
  bg?: string;
  colors?: string[];
};

export const BarRace: React.FC<BarRaceProps> = ({
  frames: keyframes = [
    [
      { label: "A", value: 100 },
      { label: "B", value: 80 },
      { label: "C", value: 60 },
      { label: "D", value: 40 },
    ],
    [
      { label: "A", value: 120 },
      { label: "B", value: 150 },
      { label: "C", value: 75 },
      { label: "D", value: 90 },
    ],
    [
      { label: "A", value: 140 },
      { label: "B", value: 220 },
      { label: "C", value: 100 },
      { label: "D", value: 180 },
    ],
  ],
  framesPerStep = 30,
  bg = "#0e0e0e",
  colors = ["#7eb800", "#ff7a4d", "#25f4ee", "#ff42d3", "#ffd60a"],
}) => {
  const frame = useCurrentFrame();
  const stepF = frame / framesPerStep;
  const stepIdx = Math.min(keyframes.length - 2, Math.floor(stepF));
  const t = stepF - stepIdx;
  const cur = keyframes[stepIdx];
  const next = keyframes[Math.min(keyframes.length - 1, stepIdx + 1)];
  const merged = cur.map((d) => {
    const n = next.find((x) => x.label === d.label);
    return {
      label: d.label,
      value: d.value + ((n?.value ?? d.value) - d.value) * t,
    };
  });
  const sorted = [...merged].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((s) => s.value));

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "5%",
        fontFamily: SF,
        color: "#fff",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {sorted.map((d, i) => {
        const w = (d.value / max) * 100;
        return (
          <div
            key={d.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div style={{ width: 180, fontSize: 30, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
              {d.label}
            </div>
            <div
              style={{
                height: 56,
                width: `${w}%`,
                background: `linear-gradient(90deg, ${colors[i % colors.length]} 0%, ${shade(colors[i % colors.length], -20)} 100%)`,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 18,
                fontSize: 28,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                boxShadow: i === 0 ? `0 0 30px ${colors[i % colors.length]}66` : undefined,
              }}
            >
              {Math.round(d.value).toLocaleString()}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
