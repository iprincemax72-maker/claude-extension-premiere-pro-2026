// remotion-banners v2 — banner-style overlays with multi-act motion.

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
const HELV = '"Helvetica Neue", Helvetica, Arial, "SF Pro Display", sans-serif';

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

// 1. NEWS TICKER — edge fade-masks so text doesn't visually pop in/out
export type NewsTickerProps = {
  text: string;
  label?: string;
  labelColor?: string;
  pixelsPerFrame?: number;
  startFrame?: number;
  bg?: string;
  textColor?: string;
};
export const NewsTicker: React.FC<NewsTickerProps> = ({
  text = "Latest news ticker scrolling continuously — designed for the bottom of any short.",
  label = "LIVE",
  labelColor = "#ed2024",
  pixelsPerFrame = 6,
  startFrame = 0,
  bg = "transparent",
  textColor = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const scroll = (f * pixelsPerFrame) % 2000;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          bottom: 60, left: 0, right: 0,
          height: 84,
          background: "rgba(15,15,15,0.92)",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          fontFamily: HELV,
          color: textColor,
          fontWeight: 700,
          fontSize: 36,
          letterSpacing: "0.02em",
          borderTop: `4px solid ${labelColor}`,
        }}
      >
        <div
          style={{
            background: labelColor,
            color: "#fff",
            padding: "0 28px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "0.14em",
            flexShrink: 0,
            zIndex: 2,
          }}
        >
          {label}
        </div>
        {/* Scrolling text with edge mask so it fades at left/right edges */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            height: "100%",
            maskImage: "linear-gradient(to right, transparent 0, black 60px, black calc(100% - 60px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0, black 60px, black calc(100% - 60px), transparent 100%)",
          }}
        >
          <div
            style={{
              paddingLeft: 30,
              whiteSpace: "nowrap",
              transform: `translateX(${-scroll}px)`,
              display: "flex",
              alignItems: "center",
              height: "100%",
            }}
          >
            {`${text}    •    ${text}    •    ${text}    •    `}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 2. BREAKING BANNER — punch-in flash, then bar drops + headline slides
export type BreakingBannerProps = {
  headline: string;
  label?: string;
  startFrame?: number;
  bg?: string;
  bannerColor?: string;
};
export const BreakingBanner: React.FC<BreakingBannerProps> = ({
  headline = "Major story unfolds — full coverage right now",
  label = "BREAKING NEWS",
  startFrame = 0,
  bg = "transparent",
  bannerColor = "#ed2024",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const slide = spring({ frame: f, fps, config: motion.haptic });
  const y = interpolate(slide, [0, 1], [180, 0]);
  // Punch-in flash on the red label when it lands
  const flashOp = interpolate(f, [4, 6, 14], [0, 0.6, 0], clamp);
  const labelOp = interpolate(f, [0, 8], [0, 1], clamp);
  const headlineOp = interpolate(f, [14, 28], [0, 1], clamp);
  const headlineX = interpolate(f, [14, 28], [40, 0], clamp);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          bottom: 80, left: 0, right: 0,
          transform: `translateY(${y}px)`,
          opacity: slide,
          fontFamily: HELV,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              background: bannerColor,
              padding: "16px 40px",
              color: "#fff",
              fontWeight: 900,
              fontSize: 38,
              letterSpacing: "0.16em",
              opacity: labelOp,
              boxShadow: `0 8px 30px ${bannerColor}99`,
            }}
          >
            {label}
          </div>
          {/* Flash overlay on the label */}
          {flashOp > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#fff",
                opacity: flashOp,
                pointerEvents: "none",
              }}
            />
          ) : null}
        </div>
        <div
          style={{
            background: "#0a0a0a",
            padding: "30px 40px",
            color: "#fff",
            fontWeight: 800,
            fontSize: 56,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            opacity: headlineOp,
            transform: `translateX(${headlineX}px)`,
            borderLeft: `6px solid ${bannerColor}`,
          }}
        >
          {headline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 3. CTA BANNER — glow breath
export type CTABannerProps = {
  text?: string;
  accent?: string;
  startFrame?: number;
  bg?: string;
};
export const CTABanner: React.FC<CTABannerProps> = ({
  text = "LIKE AND SUBSCRIBE",
  accent = "#ff7a4d",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const glow = 0.55 + 0.45 * Math.abs(Math.sin(f * 0.1));
  // Subtle text scale pulse synced to glow
  const textPulse = 1 + (glow - 0.55) * 0.04;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          padding: "28px 60px",
          background: "rgba(15,15,15,0.92)",
          borderRadius: 16,
          border: `3px solid ${accent}`,
          fontFamily: HELV,
          fontWeight: 900,
          fontSize: 72,
          color: "#fff",
          letterSpacing: "0.06em",
          transform: `scale(${enter * textPulse})`,
          opacity: enter,
          boxShadow: `0 0 ${glow * 60}px ${accent}aa, inset 0 0 30px ${accent}33`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// 4. ALERT STRIP — pulse + glow on warning level
export type AlertStripProps = {
  text: string;
  level?: "warning" | "error" | "info";
  startFrame?: number;
  bg?: string;
};

const LEVELS = {
  warning: { bg: "#ffd60a", fg: "#1a1a1a", dot: "#1a1a1a" },
  error: { bg: "#ed2024", fg: "#ffffff", dot: "#ffffff" },
  info: { bg: "#3b82f6", fg: "#ffffff", dot: "#ffffff" },
};

export const AlertStrip: React.FC<AlertStripProps> = ({
  text = "System update available — restart to apply changes",
  level = "warning",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const theme = LEVELS[level];
  const slide = spring({ frame: f, fps, config: motion.haptic });
  const y = interpolate(slide, [0, 1], [-120, 0]);
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(f * 0.2));
  // Strip glow tied to pulse for error level (calmer for info/warning)
  const stripGlow = level === "error" ? `0 0 ${pulse * 24}px ${theme.bg}aa` : "none";

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          background: theme.bg,
          padding: "20px 36px",
          fontFamily: HELV,
          fontWeight: 800,
          fontSize: 36,
          color: theme.fg,
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 22,
          transform: `translateY(${y}px)`,
          opacity: slide,
          boxShadow: `0 6px 20px rgba(0,0,0,0.25), ${stripGlow}`,
        }}
      >
        <div
          style={{
            width: 22, height: 22,
            borderRadius: "50%",
            background: theme.dot,
            opacity: pulse,
            boxShadow: `0 0 ${pulse * 18}px ${theme.dot}`,
          }}
        />
        <div style={{ textTransform: "uppercase" }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};
