// remotion-comparison v2 — split-screen comparison with proper motion.
//
// What changed from v1:
//   • BeforeAfter: center accent line draws TOP-DOWN with a glow at its
//     leading edge, sides slide IN from their respective edges, labels
//     pop with spring (not just fade).
//   • DayOneVsDayThirty: accent line has a "progress dot" travelling
//     along it from start day to end day — connects the two visually.
//   • ThenVsNow: vintage side has a per-frame film-grain shimmer (subtle).
//     Then-side desaturation interpolates rather than being baked.
//   • ExpectedVsHappened: panels SPRING in alternating (left first then
//     right) with playful overshoot rotation.
//   • VersusCard: between the two labels, a SHOCK RING expands when VS
//     lands.

import React from "react";
import {
  AbsoluteFill,
  Img,
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

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const isUrl = (s: string) =>
  s.startsWith("/") || s.startsWith("http") || s.startsWith("file:");

// ═════════════════════════════════════════════════════════════════════════
// 1. BEFORE / AFTER
// ═════════════════════════════════════════════════════════════════════════

export type BeforeAfterProps = {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  startFrame?: number;
  bg?: string;
};

export const BeforeAfter: React.FC<BeforeAfterProps> = ({
  before = "the cluttered version",
  after = "the clean redesign",
  beforeLabel = "BEFORE",
  afterLabel = "AFTER",
  startFrame = 0,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Center line draws top-down with leading edge glow
  const lineP = interpolate(f, [0, 18], [0, 1], clamp);

  // Sides slide in
  const leftSlide = spring({ frame: f - 6, fps, config: motion.haptic });
  const rightSlide = spring({ frame: f - 12, fps, config: motion.haptic });

  // Labels pop in after sides settle
  const leftLabelSpring = spring({ frame: f - 18, fps, config: motion.pop });
  const rightLabelSpring = spring({ frame: f - 24, fps, config: motion.pop });

  return (
    <AbsoluteFill style={{ background: bg, fontFamily: HELV, color: "#fff" }}>
      <div style={{ display: "flex", height: "100%" }}>
        {[
          { content: before, label: beforeLabel, slide: leftSlide, labelSpring: leftLabelSpring, dir: -1, faded: true },
          { content: after, label: afterLabel, slide: rightSlide, labelSpring: rightLabelSpring, dir: 1, faded: false },
        ].map((side, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              transform: `translateX(${(1 - side.slide) * side.dir * 200}px)`,
              opacity: side.slide,
            }}
          >
            {isUrl(side.content) ? (
              <Img
                src={side.content}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: side.faded ? "saturate(0.6) brightness(0.8)" : "none",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: side.faded
                    ? "linear-gradient(135deg, #3a3a3c, #1a1a1a)"
                    : "linear-gradient(135deg, #ff7a4d, #d9425a)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 60,
                  fontWeight: 800,
                  textAlign: "center",
                  padding: "10%",
                }}
              >
                {side.content}
              </div>
            )}
            <div
              style={{
                position: "absolute",
                top: 60,
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: 56,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textShadow: "0 4px 0 rgba(0,0,0,0.6)",
                transform: `scale(${side.labelSpring}) translateY(${(1 - side.labelSpring) * 20}px)`,
                opacity: side.labelSpring,
              }}
            >
              {side.label}
            </div>
          </div>
        ))}
      </div>
      {/* Center accent line — draws top-down with leading edge glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 6,
          height: `${lineP * 100}%`,
          background: "#fff",
          transform: "translateX(-50%)",
          boxShadow: lineP < 1 ? "0 12px 30px rgba(255,255,255,0.7)" : undefined,
        }}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. DAY 1 VS DAY 30
// ═════════════════════════════════════════════════════════════════════════

export type DayOneVsDayThirtyProps = {
  start: string;
  end: string;
  startLabel?: string;
  endLabel?: string;
  startDay?: number;
  endDay?: number;
  accent?: string;
  bg?: string;
  startFrame?: number;
};

export const DayOneVsDayThirty: React.FC<DayOneVsDayThirtyProps> = ({
  start = "the start",
  end = "after consistency",
  startLabel,
  endLabel,
  startDay = 1,
  endDay = 30,
  accent = "#7eb800",
  bg = "#0a0a0a",
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const op = interpolate(f, [0, 20], [0, 1], clamp);
  // Accent line grows top-down
  const lineP = interpolate(f, [10, 30], [0, 1], clamp);
  // Progress dot travels along the line after it draws
  const dotP = interpolate(f, [30, 60], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, color: "#fff", fontFamily: HELV }}>
      <div style={{ display: "flex", height: "100%" }}>
        {[
          { content: start, label: startLabel, day: startDay, faded: true, sideF: f },
          { content: end, label: endLabel, day: endDay, faded: false, sideF: f - 6 },
        ].map((side, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              position: "relative",
              opacity: interpolate(side.sideF, [0, 20], [0, 1], clamp),
            }}
          >
            {isUrl(side.content) ? (
              <Img
                src={side.content}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: side.faded
                    ? "saturate(0.4) brightness(0.7) contrast(0.9)"
                    : "saturate(1.1) brightness(1.05)",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: side.faded
                    ? "linear-gradient(135deg, #3a3a3c 0%, #1a1a1a 100%)"
                    : `linear-gradient(135deg, ${accent} 0%, ${shade(accent, -25)} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 56,
                  fontWeight: 800,
                  textAlign: "center",
                  padding: "10%",
                  opacity: side.faded ? 0.65 : 1,
                }}
              >
                {side.content}
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: 80,
                left: 0,
                right: 0,
                textAlign: "center",
                opacity: op,
              }}
            >
              <div style={{ fontSize: 36, letterSpacing: "0.18em", color: "rgba(255,255,255,0.75)" }}>
                DAY
              </div>
              <div
                style={{
                  fontSize: 200,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 8,
                }}
              >
                {side.day}
              </div>
              {side.label ? (
                <div style={{ fontSize: 32, marginTop: 16, color: "rgba(255,255,255,0.85)" }}>
                  {side.label}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {/* Vertical accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 8,
          height: `${lineP * 100}%`,
          background: accent,
          transform: "translateX(-50%)",
          boxShadow: `0 0 30px ${accent}aa`,
        }}
      />
      {/* Progress dot traveling along the line */}
      {dotP > 0 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: `${dotP * 100}%`,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#fff",
            transform: "translate(-50%, -50%)",
            boxShadow: `0 0 30px ${accent}, 0 0 60px ${accent}77`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. THEN VS NOW
// ═════════════════════════════════════════════════════════════════════════

export type ThenVsNowProps = {
  then: string;
  now: string;
  thenLabel?: string;
  nowLabel?: string;
  startFrame?: number;
  bg?: string;
};

export const ThenVsNow: React.FC<ThenVsNowProps> = ({
  then: thenSide = "back then",
  now = "right now",
  thenLabel = "THEN",
  nowLabel = "NOW",
  startFrame = 0,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  // Vintage side: saturation INTERPOLATES from full to washed
  const desaturate = interpolate(f, [0, 30], [1, 0.5], clamp);
  const leftOp = interpolate(f, [0, 16], [0, 1], clamp);
  const rightOp = interpolate(f, [8, 24], [0, 1], clamp);
  // Per-frame film grain shimmer (subtle, animated)
  const grainShift = (f * 3) % 100;

  return (
    <AbsoluteFill style={{ background: bg, color: "#fff", fontFamily: HELV }}>
      <div style={{ display: "flex", height: "100%" }}>
        {[
          { content: thenSide, label: thenLabel, vintage: true, op: leftOp },
          { content: now, label: nowLabel, vintage: false, op: rightOp },
        ].map((side, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              position: "relative",
              opacity: side.op,
              overflow: "hidden",
            }}
          >
            {isUrl(side.content) ? (
              <Img
                src={side.content}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: side.vintage
                    ? `sepia(${1 - desaturate}) contrast(0.85) brightness(0.95) saturate(${desaturate})`
                    : "saturate(1.15) brightness(1.05)",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: side.vintage
                    ? "linear-gradient(135deg, #7c5b3a, #3a2818)"
                    : "linear-gradient(135deg, #25f4ee, #fe2c55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 60,
                  fontWeight: 800,
                  textAlign: "center",
                  padding: "10%",
                  filter: side.vintage ? `sepia(${1 - desaturate})` : "none",
                }}
              >
                {side.content}
              </div>
            )}
            {side.vintage ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 3px)",
                  mixBlendMode: "multiply",
                  transform: `translateY(${grainShift}px)`,
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                bottom: 80,
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: 80,
                fontWeight: 900,
                fontFamily: side.vintage ? "Georgia, serif" : HELV,
                fontStyle: side.vintage ? "italic" : "normal",
                letterSpacing: side.vintage ? "0.02em" : "-0.02em",
                textShadow: "0 4px 0 rgba(0,0,0,0.6)",
              }}
            >
              {side.label}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. EXPECTED VS HAPPENED
// ═════════════════════════════════════════════════════════════════════════

export type ExpectedVsHappenedProps = {
  expected: string;
  happened: string;
  startFrame?: number;
  bg?: string;
};

export const ExpectedVsHappened: React.FC<ExpectedVsHappenedProps> = ({
  expected = "what I expected",
  happened = "what actually happened",
  startFrame = 0,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const leftPop = spring({ frame: f, fps, config: motion.slam });
  const rightPop = spring({ frame: f - 14, fps, config: motion.slam });
  const leftRot = (1 - leftPop) * -8;
  const rightRot = (1 - rightPop) * 8;

  return (
    <AbsoluteFill style={{ background: bg, color: "#fff", fontFamily: HELV }}>
      <div style={{ display: "flex", height: "100%" }}>
        {[
          { content: expected, label: "WHAT I EXPECTED", pop: leftPop, rot: leftRot, hue: "#7eb800" },
          { content: happened, label: "WHAT HAPPENED", pop: rightPop, rot: rightRot, hue: "#ff2d55" },
        ].map((side, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 30,
              transform: `scale(${side.pop}) rotate(${side.rot}deg)`,
              opacity: side.pop,
            }}
          >
            <div
              style={{
                fontSize: 32,
                letterSpacing: "0.16em",
                fontWeight: 800,
                color: side.hue,
                textAlign: "center",
              }}
            >
              {side.label}
            </div>
            {isUrl(side.content) ? (
              <Img
                src={side.content}
                style={{
                  width: "85%",
                  aspectRatio: "1/1.2",
                  objectFit: "cover",
                  borderRadius: 24,
                  boxShadow: `0 16px 40px ${side.hue}55`,
                }}
              />
            ) : (
              <div
                style={{
                  width: "85%",
                  aspectRatio: "1/1.2",
                  background: `linear-gradient(135deg, ${side.hue}, ${shade(side.hue, -25)})`,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 50,
                  fontWeight: 800,
                  textAlign: "center",
                  padding: 40,
                  boxShadow: `0 16px 40px ${side.hue}55`,
                }}
              >
                {side.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. VERSUS CARD
// ═════════════════════════════════════════════════════════════════════════

export type VersusCardProps = {
  leftLabel: string;
  rightLabel: string;
  startFrame?: number;
  leftColor?: string;
  rightColor?: string;
  bg?: string;
};

export const VersusCard: React.FC<VersusCardProps> = ({
  leftLabel = "PIZZA",
  rightLabel = "TACO",
  startFrame = 0,
  leftColor = "#7eb800",
  rightColor = "#ff2d55",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const leftIn = spring({ frame: f, fps, config: motion.haptic });
  const rightIn = spring({ frame: f - 6, fps, config: motion.haptic });
  const vsIn = spring({ frame: f - 16, fps, config: motion.slam });

  // Shock ring expands when VS lands
  const ringP = interpolate(f - 16, [0, 30], [0, 1], clamp);
  const ringScale = interpolate(ringP, [0, 1], [0.4, 2.4]);
  const ringOp = interpolate(ringP, [0, 0.2, 1], [0, 0.7, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
        color: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 80,
          width: "100%",
          padding: "0 7%",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            flex: 1,
            textAlign: "right",
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: leftColor,
            opacity: leftIn,
            transform: `translateX(${(1 - leftIn) * -80}px)`,
            textShadow: `0 6px 0 ${shade(leftColor, -30)}`,
          }}
        >
          {leftLabel}
        </div>
        <div style={{ position: "relative" }}>
          {/* Shock ring */}
          {ringOp > 0 ? (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 200,
                height: 200,
                borderRadius: "50%",
                border: "6px solid #fff",
                transform: `translate(-50%, -50%) scale(${ringScale})`,
                opacity: ringOp,
              }}
            />
          ) : null}
          <div
            style={{
              fontSize: 160,
              fontWeight: 900,
              color: "#fff",
              opacity: vsIn,
              transform: `scale(${interpolate(vsIn, [0, 1], [2.5, 1])}) rotate(${(1 - vsIn) * 30}deg)`,
              letterSpacing: "-0.02em",
              textShadow: "0 6px 0 rgba(0,0,0,0.4)",
            }}
          >
            VS
          </div>
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "left",
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: rightColor,
            opacity: rightIn,
            transform: `translateX(${(1 - rightIn) * 80}px)`,
            textShadow: `0 6px 0 ${shade(rightColor, -30)}`,
          }}
        >
          {rightLabel}
        </div>
      </div>
    </AbsoluteFill>
  );
};
