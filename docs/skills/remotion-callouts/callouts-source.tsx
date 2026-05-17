// Five callout presets. Each highlights / draws attention to a part of
// the frame. Designed as overlays — pass bg="transparent" for real use.

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
const HAND =
  '"Caveat", "Marker Felt", "Comic Sans MS", "Bradley Hand", cursive';
const SERIF = '"Playfair Display", "Times New Roman", Georgia, serif';

// ─────────────────────────────────────────────────────────────────────────
// 1. HAND-DRAWN ARROW
// SVG path arrow that draws on with stroke-dashoffset animation. Includes
// a hand-written label near the tail.
// ─────────────────────────────────────────────────────────────────────────

export type HandDrawnArrowProps = {
  label?: string;
  color?: string;
  bg?: string;
  // 0..100 in % units. Default points from top-right toward center.
  fromX?: number; fromY?: number;
  toX?: number;   toY?: number;
};

export const HandDrawnArrow: React.FC<HandDrawnArrowProps> = ({
  label = "look here",
  color = "#fde047",
  bg = "transparent",
  fromX = 75, fromY = 18,
  toX = 50,   toY = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Build a wobbly cubic between from and to
  const cx1 = fromX + (toX - fromX) * 0.3 + 12;
  const cy1 = fromY + (toY - fromY) * 0.3 - 18;
  const cx2 = fromX + (toX - fromX) * 0.7 - 6;
  const cy2 = fromY + (toY - fromY) * 0.7 + 14;
  const d = `M ${fromX} ${fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${toY}`;
  // Approx length — we use a big number and animate dashoffset.
  const LEN = 220;
  const draw = spring({ frame, fps, config: { damping: 22, stiffness: 80 } });
  const dashOffset = interpolate(draw, [0, 1], [LEN, 0], clamp);
  const headOpacity = interpolate(frame, [16, 22], [0, 1], clamp);
  const labelOp = interpolate(frame, [4, 12], [0, 1], clamp);
  const labelTy = interpolate(frame, [4, 12], [-10, 0], clamp);

  // Arrow head — small triangle near the (toX,toY) point, rotated to match dir
  const headAngle =
    Math.atan2(toY - cy2, toX - cx2) * (180 / Math.PI);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={LEN}
          strokeDashoffset={dashOffset}
          style={{ filter: "drop-shadow(0 0 8px rgba(0,0,0,0.4))" }}
        />
        <g transform={`translate(${toX} ${toY}) rotate(${headAngle})`} opacity={headOpacity}>
          <polygon points="0,0 -4,-2.2 -4,2.2" fill={color} />
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          left: `${fromX}%`,
          top: `${fromY - 5}%`,
          transform: `translate(-50%, calc(-100% + ${labelTy}px))`,
          fontFamily: HAND,
          fontSize: 64,
          color,
          opacity: labelOp,
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. HIGHLIGHT CIRCLE
// Scribbled emphasis ring around a point. SVG circle with hand-drawn jitter.
// ─────────────────────────────────────────────────────────────────────────

export type HighlightCircleProps = {
  cx?: number; // % center x
  cy?: number; // % center y
  rxPct?: number; // half-width % of frame width
  ryPct?: number; // half-height % of frame height
  color?: string;
  bg?: string;
};

export const HighlightCircle: React.FC<HighlightCircleProps> = ({
  cx = 50, cy = 50, rxPct = 18, ryPct = 12,
  color = "#ef4444",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Two passes of stroke (scribble-y look)
  const drawA = spring({ frame, fps, config: { damping: 20, stiffness: 95 } });
  const drawB = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 95 } });

  // Build a slightly wobbly ellipse path
  const SEG = 36;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    // Pseudo-random wobble
    const w = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r = 1 + (w - 0.5) * 0.04;
    pts.push({
      x: cx + Math.cos(t) * rxPct * r,
      y: cy + Math.sin(t) * ryPct * r,
    });
  }
  const d = "M " + pts.map((p) => p.x + " " + p.y).join(" L ");
  const LEN = 400;
  const offA = interpolate(drawA, [0, 1], [LEN, 0], clamp);
  const offB = interpolate(drawB, [0, 1], [LEN, 0], clamp);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <path d={d} fill="none" stroke={color} strokeWidth={0.7}
              strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={offA}
              opacity={0.85} style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,0.45))" }} />
        <path d={d} fill="none" stroke={color} strokeWidth={0.5}
              strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={offB}
              opacity={0.7} transform={`translate(0.4 -0.2)`} />
      </svg>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. PULL QUOTE
// Brackets bracket-in around a centered italic quote. Magazine vibe.
// ─────────────────────────────────────────────────────────────────────────

export type PullQuoteProps = {
  text: string;
  attribution?: string;
  color?: string;
  accent?: string;
  bg?: string;
};

export const PullQuote: React.FC<PullQuoteProps> = ({
  text,
  attribution = "",
  color = "#ffffff",
  accent = "#fde047",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bracket = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const tx = interpolate(bracket, [0, 1], [60, 0], clamp);
  const opacity = interpolate(frame, [0, 8], [0, 1], clamp);
  const textOp = interpolate(frame, [10, 22], [0, 1], clamp);

  const Bracket = ({ side }: { side: "l" | "r" }) => (
    <div
      style={{
        fontFamily: SERIF,
        fontSize: 220,
        color: accent,
        lineHeight: 0.8,
        fontStyle: "italic",
        transform: side === "l"
          ? `translateX(${-tx}px)`
          : `translateX(${tx}px) scale(-1, 1)`,
        opacity,
      }}
    >
      “
    </div>
  );

  return (
    <AbsoluteFill
      style={{ background: bg, justifyContent: "center", alignItems: "center", padding: "60px 80px" }}
    >
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <Bracket side="l" />
        <div
          style={{
            color,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 88,
            lineHeight: 1.1,
            textAlign: "center",
            maxWidth: 1200,
            opacity: textOp,
          }}
        >
          {text}
          {attribution && (
            <div
              style={{
                fontFamily: HELV,
                fontStyle: "normal",
                fontWeight: 500,
                fontSize: 28,
                color,
                opacity: 0.6,
                letterSpacing: "0.1em",
                marginTop: 24,
                textTransform: "uppercase",
              }}
            >
              — {attribution}
            </div>
          )}
        </div>
        <Bracket side="r" />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. SPEECH BUBBLE
// Comic-style bubble with a tail. Pops in with a bouncy spring.
// ─────────────────────────────────────────────────────────────────────────

export type SpeechBubbleProps = {
  text: string;
  bgColor?: string;
  textColor?: string;
  bg?: string;
  // tail direction
  tail?: "bl" | "br" | "tl" | "tr";
};

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  bgColor = "#ffffff",
  textColor = "#0a0a0a",
  bg = "transparent",
  tail = "bl",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 220, mass: 0.7 } });
  const scale = interpolate(pop, [0, 1], [0.5, 1], clamp);
  const opacity = interpolate(frame, [0, 4], [0, 1], clamp);

  const tailStyle: React.CSSProperties = {
    position: "absolute",
    width: 0, height: 0,
    borderStyle: "solid",
  };
  // Tail as a triangle hanging off one corner
  const tailMap: Record<typeof tail, React.CSSProperties> = {
    bl: { left: 40, bottom: -28, borderWidth: "28px 16px 0 0", borderColor: `${bgColor} transparent transparent transparent` },
    br: { right: 40, bottom: -28, borderWidth: "28px 0 0 16px", borderColor: `${bgColor} transparent transparent transparent` },
    tl: { left: 40, top: -28, borderWidth: "0 16px 28px 0", borderColor: `transparent transparent ${bgColor} transparent` },
    tr: { right: 40, top: -28, borderWidth: "0 0 28px 16px", borderColor: `transparent transparent ${bgColor} transparent` },
  };

  return (
    <AbsoluteFill
      style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 80 }}
    >
      <div
        style={{
          position: "relative",
          background: bgColor,
          color: textColor,
          fontFamily: HELV,
          fontWeight: 800,
          fontSize: 80,
          letterSpacing: "-0.02em",
          padding: "32px 56px",
          borderRadius: 36,
          boxShadow: "0 12px 0 rgba(0,0,0,0.18)",
          transform: `scale(${scale})`,
          opacity,
          maxWidth: 1400,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {text}
        <div style={{ ...tailStyle, ...tailMap[tail] }} />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 5. QUESTION CARD
// Big "?" with a question. Card scales in, "?" rotates from -15° to 0°.
// ─────────────────────────────────────────────────────────────────────────

export type QuestionCardProps = {
  question: string;
  qMark?: string;
  textColor?: string;
  cardColor?: string;
  accent?: string;
  bg?: string;
};

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  qMark = "?",
  textColor = "#ffffff",
  cardColor = "#0a0a0a",
  accent = "#ec4899",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame, fps, config: { damping: 11, stiffness: 180, mass: 0.7 } });
  const qSpring = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 220 } });
  const cardScale = interpolate(card, [0, 1], [0.7, 1], clamp);
  const cardOp = interpolate(frame, [0, 6], [0, 1], clamp);
  const qRot = interpolate(qSpring, [0, 1], [-20, 0], clamp);
  const qScale = interpolate(qSpring, [0, 1], [0.4, 1], clamp);
  const textOp = interpolate(frame, [14, 24], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 100 }}
    >
      <div
        style={{
          position: "relative",
          background: cardColor,
          padding: "60px 100px 70px",
          borderRadius: 28,
          transform: `scale(${cardScale})`,
          opacity: cardOp,
          maxWidth: 1400,
          textAlign: "center",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            color: accent,
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 360,
            lineHeight: 0.85,
            transform: `rotate(${qRot}deg) scale(${qScale})`,
            marginBottom: -40,
          }}
        >
          {qMark}
        </div>
        <div
          style={{
            color: textColor,
            fontFamily: HELV,
            fontWeight: 800,
            fontSize: 72,
            letterSpacing: "-0.02em",
            opacity: textOp,
            lineHeight: 1.1,
          }}
        >
          {question}
        </div>
      </div>
    </AbsoluteFill>
  );
};
