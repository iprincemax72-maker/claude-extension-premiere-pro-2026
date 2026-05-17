// remotion-quotes v2 — editorial quote cards with multi-act motion.

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
const SERIF_IT = '"Times New Roman", Georgia, "Playfair Display", serif';
const HELV = '"Helvetica Neue", Helvetica, Arial, "SF Pro Display", sans-serif';

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

function tremor(frame: number, amp = 1, speed = 0.18): number {
  return (
    Math.sin(frame * speed) * amp +
    Math.sin(frame * speed * 1.7) * amp * 0.45 +
    Math.sin(frame * speed * 0.3) * amp * 0.25
  );
}

// 1. PULL QUOTE — bar pulses 3x after draw
export type PullQuoteProps = {
  quote: string;
  accent?: string;
  textColor?: string;
  bg?: string;
  startFrame?: number;
  fontSize?: number;
};
export const PullQuote: React.FC<PullQuoteProps> = ({
  quote = "we are what we repeatedly do",
  accent = "#ff7a4d",
  textColor = "#f5e7d3",
  bg = "#1a1410",
  startFrame = 0,
  fontSize = 130,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const barP = interpolate(f, [0, 14], [0, 1], clamp);
  const barPulse = f > 14 && f < 50
    ? 1 + Math.sin((f - 14) * 0.45) * Math.max(0, (50 - f) / 36) * 0.06
    : 1;
  const textOp = interpolate(f, [8, 22], [0, 1], clamp);
  const textX = interpolate(f, [8, 22], [40, 0], clamp);
  // Quote breathing after settle
  const breath = f > 30 ? 1 + tremor(f, 0.003, 0.05) : 1;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", padding: "10%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40, maxWidth: "85%" }}>
        <div
          style={{
            width: 10, background: accent, borderRadius: 5,
            alignSelf: "stretch",
            transform: `scaleY(${barP}) scaleX(${barPulse})`,
            transformOrigin: "center",
            boxShadow: `0 0 22px ${accent}88`,
          }}
        />
        <div
          style={{
            fontFamily: SERIF_IT,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize, color: textColor,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            opacity: textOp,
            transform: `translateX(${textX}px) scale(${breath})`,
          }}
        >
          {quote}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 2. BIG QUOTE — quote marks pop in
export type BigQuoteProps = {
  quote: string;
  attribution?: string;
  textColor?: string;
  markColor?: string;
  bg?: string;
  startFrame?: number;
  fontSize?: number;
};
export const BigQuote: React.FC<BigQuoteProps> = ({
  quote = "do what you can with what you have where you are",
  attribution = "Theodore Roosevelt",
  textColor = "#f5e7d3",
  markColor = "#8a6a52",
  bg = "#1a1410",
  startFrame = 0,
  fontSize = 130,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const op = interpolate(f, [0, 26], [0, 1], clamp);
  const blur = interpolate(f, [0, 26], [14, 0], clamp);
  // Opening mark pops first, closing mark pops second
  const openMark = spring({ frame: f - 4, fps, config: motion.haptic });
  const closeMark = spring({ frame: f - 20, fps, config: motion.haptic });

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "8%",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "12%", left: "8%",
          fontFamily: SERIF_IT,
          fontSize: 380, lineHeight: 0.7,
          color: markColor,
          opacity: op * 0.65 * openMark,
          transform: `scale(${openMark})`,
        }}
      >
        “
      </div>
      <div
        style={{
          fontFamily: SERIF_IT,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize, color: textColor,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          textAlign: "center",
          maxWidth: "78%",
          opacity: op,
          filter: `blur(${blur}px)`,
          zIndex: 2,
          position: "relative",
        }}
      >
        {quote}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: "8%", right: "8%",
          fontFamily: SERIF_IT,
          fontSize: 380, lineHeight: 0.7,
          color: markColor,
          opacity: op * 0.65 * closeMark,
          transform: `scale(${closeMark}) rotate(${(1 - closeMark) * 30}deg)`,
        }}
      >
        ”
      </div>
      {attribution ? (
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            fontFamily: HELV,
            fontSize: 34,
            color: "rgba(245,231,211,0.7)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: interpolate(f, [20, 34], [0, 1], clamp),
          }}
        >
          — {attribution}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// 3. QUOTE WITH ATTRIBUTION
export type QuoteWithAttributionProps = {
  quote: string;
  name: string;
  role?: string;
  accent?: string;
  textColor?: string;
  bg?: string;
  startFrame?: number;
  fontSize?: number;
};
export const QuoteWithAttribution: React.FC<QuoteWithAttributionProps> = ({
  quote = "small steps every day",
  name = "Ansh Dhakad",
  role = "creator",
  accent = "#ff7a4d",
  textColor = "#f5e7d3",
  bg = "#1a1410",
  startFrame = 0,
  fontSize = 100,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const quoteOp = interpolate(f, [0, 20], [0, 1], clamp);
  const lineP = interpolate(f, [18, 30], [0, 1], clamp);
  const nameOp = interpolate(f, [24, 36], [0, 1], clamp);
  const nameY = interpolate(f, [24, 36], [20, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "10%",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div
        style={{
          fontFamily: SERIF_IT,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize, color: textColor,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          textAlign: "center",
          maxWidth: "80%",
          opacity: quoteOp,
        }}
      >
        “{quote}”
      </div>
      <div
        style={{
          width: 120, height: 4,
          background: accent,
          borderRadius: 2,
          transform: `scaleX(${lineP})`,
          boxShadow: `0 0 14px ${accent}77`,
        }}
      />
      <div
        style={{
          fontFamily: HELV,
          textAlign: "center",
          opacity: nameOp,
          transform: `translateY(${nameY}px)`,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, color: textColor, letterSpacing: "-0.01em" }}>
          {name}
        </div>
        {role ? (
          <div
            style={{
              fontSize: 26,
              color: "rgba(245,231,211,0.7)",
              marginTop: 6,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {role}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// 4. AUTHOR TAGLINE
export type AuthorTaglineProps = {
  quote: string;
  author: string;
  corner?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  accent?: string;
  textColor?: string;
  bg?: string;
  startFrame?: number;
};
export const AuthorTagline: React.FC<AuthorTaglineProps> = ({
  quote = "you cannot pour from an empty cup",
  author = "ANCIENT WISDOM",
  corner = "bottom-left",
  accent = "#ff7a4d",
  textColor = "#f5e7d3",
  bg = "transparent",
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const isBottom = corner.startsWith("bottom");
  const isRight = corner.endsWith("right");

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          [isBottom ? "bottom" : "top"]: 100,
          [isRight ? "right" : "left"]: 100,
          maxWidth: "55%",
          textAlign: isRight ? "right" : "left",
          fontFamily: SERIF_IT,
          opacity: enter,
          transform: `translateX(${(1 - enter) * (isRight ? 60 : -60)}px)`,
        }}
      >
        <div
          style={{
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 60, color: textColor,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          “{quote}”
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 18,
            justifyContent: isRight ? "flex-end" : "flex-start",
          }}
        >
          <div style={{ width: 40, height: 3, background: accent, borderRadius: 2 }} />
          <div
            style={{
              fontFamily: HELV,
              fontSize: 26, fontWeight: 700,
              color: "rgba(245,231,211,0.85)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {author}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
