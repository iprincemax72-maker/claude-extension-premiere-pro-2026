// Four animated stat / infographic components. Each is self-contained
// and drop-in usable. Designed for "data reveal" moments.

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

const HELV =
  '"Helvetica Neue", Helvetica, Arial, "SF Pro Display", sans-serif';

// ─────────────────────────────────────────────────────────────────────────
// 1. BAR CHART RACE
// Horizontal bars fill in from 0 → value with staggered start. Each bar
// has a label and a value.
// ─────────────────────────────────────────────────────────────────────────

export type BarChartRaceProps = {
  data: { label: string; value: number; color?: string }[];
  max?: number; // optional explicit max for the axis
  bg?: string;
  textColor?: string;
};

export const BarChartRace: React.FC<BarChartRaceProps> = ({
  data,
  max,
  bg = "#0a0a0a",
  textColor = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const trueMax = max ?? Math.max(...data.map((d) => d.value));
  const rowH = 64;
  const gap = 18;
  const labelW = 240;
  const valueW = 220;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 100,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap, width: "80%" }}>
        {data.map((d, i) => {
          const stagger = i * 6;
          const grow = spring({
            frame: frame - stagger,
            fps,
            config: { damping: 18, stiffness: 100 },
          });
          const widthPct = interpolate(grow, [0, 1], [0, (d.value / trueMax) * 100], clamp);
          const fade = interpolate(frame, [stagger, stagger + 6], [0, 1], clamp);
          const animValue = Math.floor(d.value * Math.min(1, grow));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, opacity: fade }}>
              <div
                style={{
                  width: labelW,
                  textAlign: "right",
                  color: textColor,
                  fontFamily: HELV,
                  fontWeight: 700,
                  fontSize: 30,
                  letterSpacing: "-0.01em",
                }}
              >
                {d.label}
              </div>
              <div style={{ flex: 1, height: rowH, background: "rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${widthPct}%`,
                    background: d.color || "#10b981",
                    transition: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 14,
                    color: "#0a0a0a",
                    fontFamily: HELV,
                    fontWeight: 800,
                    fontSize: 24,
                  }}
                />
              </div>
              <div
                style={{
                  width: valueW,
                  textAlign: "left",
                  color: textColor,
                  fontFamily: HELV,
                  fontWeight: 800,
                  fontSize: 34,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {animValue.toLocaleString("en-US")}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. PROGRESS RING
// Circle stroke fills from 0 → value%. Big number in center counts up.
// ─────────────────────────────────────────────────────────────────────────

export type ProgressRingProps = {
  target: number; // 0..100 percent
  label?: string;
  durationFrames?: number;
  color?: string;
  trackColor?: string;
  textColor?: string;
  bg?: string;
};

export const ProgressRing: React.FC<ProgressRingProps> = ({
  target,
  label = "",
  durationFrames = 45,
  color = "#10b981",
  trackColor = "rgba(255,255,255,0.1)",
  textColor = "#ffffff",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / durationFrames);
  const eased = 1 - Math.pow(1 - p, 2.4);
  const value = target * eased;
  const R = 160;
  const CIRC = 2 * Math.PI * R;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: 420, height: 420 }}>
        <svg width={420} height={420} viewBox="0 0 420 420">
          <circle cx={210} cy={210} r={R} stroke={trackColor} strokeWidth={28} fill="none" />
          <circle
            cx={210}
            cy={210}
            r={R}
            stroke={color}
            strokeWidth={28}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - value / 100)}
            transform="rotate(-90 210 210)"
            style={{ filter: `drop-shadow(0 0 12px ${color}66)` }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: textColor,
            fontFamily: HELV,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 130,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(value)}<span style={{ fontSize: 70 }}>%</span>
          </div>
          {label && (
            <div
              style={{
                fontWeight: 500,
                fontSize: 28,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.6,
                marginTop: 8,
              }}
            >
              {label}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. COMPARISON BARS
// Two big vertical bars side by side with labels above and final values
// stamped on top. Bars grow from bottom.
// ─────────────────────────────────────────────────────────────────────────

export type ComparisonBarsProps = {
  a: { label: string; value: number; color?: string };
  b: { label: string; value: number; color?: string };
  unit?: string;
  bg?: string;
  textColor?: string;
};

export const ComparisonBars: React.FC<ComparisonBarsProps> = ({
  a, b,
  unit = "",
  bg = "#0a0a0a",
  textColor = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(a.value, b.value);

  const growA = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const growB = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 110 } });
  const hA = interpolate(growA, [0, 1], [0, (a.value / max) * 100], clamp);
  const hB = interpolate(growB, [0, 1], [0, (b.value / max) * 100], clamp);
  const valA = Math.floor(a.value * Math.min(1, growA));
  const valB = Math.floor(b.value * Math.min(1, growB));

  const Bar = ({ side, label, value, color, h }: any) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: 600, justifyContent: "flex-end" }}>
      <div
        style={{
          color: textColor,
          fontFamily: HELV,
          fontWeight: 900,
          fontSize: 60,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 14,
        }}
      >
        {value.toLocaleString("en-US")}{unit}
      </div>
      <div
        style={{
          width: 220,
          height: `${h}%`,
          background: color,
          borderRadius: "10px 10px 0 0",
          boxShadow: `0 0 30px ${color}44`,
        }}
      />
      <div
        style={{
          color: textColor,
          fontFamily: HELV,
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: "-0.01em",
          marginTop: 18,
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 120, alignItems: "flex-end" }}>
        <Bar side="a" label={a.label} value={valA} color={a.color || "#ef4444"} h={hA} />
        <Bar side="b" label={b.label} value={valB} color={b.color || "#10b981"} h={hB} />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. STAT CARD GRID
// 3 stat tiles in a row; each tile has a number that counts up + a label.
// Cards stagger in.
// ─────────────────────────────────────────────────────────────────────────

export type StatCardGridProps = {
  stats: { value: number; suffix?: string; prefix?: string; label: string; color?: string }[];
  durationFrames?: number;
  bg?: string;
  cardColor?: string;
  textColor?: string;
};

export const StatCardGrid: React.FC<StatCardGridProps> = ({
  stats,
  durationFrames = 35,
  bg = "#0a0a0a",
  cardColor = "rgba(255,255,255,0.04)",
  textColor = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div style={{ display: "flex", gap: 32, width: "90%", justifyContent: "center" }}>
        {stats.map((s, i) => {
          const stagger = i * 8;
          const pop = spring({
            frame: frame - stagger,
            fps,
            config: { damping: 11, stiffness: 180 },
          });
          const cardScale = interpolate(pop, [0, 1], [0.85, 1], clamp);
          const cardOp = interpolate(frame, [stagger, stagger + 8], [0, 1], clamp);

          const p = Math.min(1, Math.max(0, (frame - stagger - 4) / durationFrames));
          const eased = 1 - Math.pow(1 - p, 2.4);
          const value = s.value * eased;
          const formatted = Math.floor(value).toLocaleString("en-US");

          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: cardColor,
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 22,
                padding: "40px 32px",
                transform: `scale(${cardScale})`,
                opacity: cardOp,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: s.color || textColor,
                  fontFamily: HELV,
                  fontWeight: 900,
                  fontSize: 110,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.prefix || ""}{formatted}{s.suffix || ""}
              </div>
              <div
                style={{
                  color: textColor,
                  opacity: 0.55,
                  fontFamily: HELV,
                  fontWeight: 500,
                  fontSize: 24,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 14,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
