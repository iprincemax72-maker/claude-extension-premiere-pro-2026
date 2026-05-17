// Five production-grade lower-third presets. Each is self-contained with
// sensible defaults — pass at least `name`, optionally `role`/`subline`.
// All animations are frame-deterministic (useCurrentFrame + interpolate/spring).

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
const SERIF = '"Playfair Display", "Times New Roman", Georgia, serif';
const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

// Shared anchor: bottom-left with safe-zone padding (Premiere title-safe).
const LT_LEFT = 80;
const LT_BOTTOM = 120;

// ─────────────────────────────────────────────────────────────────────────
// 1. NEWS BROADCAST
// CNN-style — bold red bar, name in white, role in tighter grey beneath.
// Slides in from the left with a quick spring.
// ─────────────────────────────────────────────────────────────────────────

export type NewsBroadcastProps = {
  name: string;
  role?: string;
  accent?: string; // bar color
  bg?: string;     // overlay bg or "transparent"
};

export const NewsBroadcast: React.FC<NewsBroadcastProps> = ({
  name,
  role = "",
  accent = "#dc2626",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const x = interpolate(slide, [0, 1], [-600, 0], clamp);
  const opacity = interpolate(frame, [0, 6], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          left: LT_LEFT,
          bottom: LT_BOTTOM,
          display: "flex",
          flexDirection: "column",
          transform: `translateX(${x}px)`,
          opacity,
        }}
      >
        <div
          style={{
            background: accent,
            color: "#fff",
            fontFamily: HELV,
            fontWeight: 800,
            fontSize: 56,
            padding: "8px 22px",
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {name}
        </div>
        {role && (
          <div
            style={{
              background: "#111",
              color: "#e5e5e5",
              fontFamily: HELV,
              fontWeight: 500,
              fontSize: 26,
              padding: "6px 22px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {role}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. MINIMAL BAUHAUS
// Thin accent line + tight Helvetica. The line draws first, then text
// rises into place under it.
// ─────────────────────────────────────────────────────────────────────────

export type MinimalBauhausProps = {
  name: string;
  role?: string;
  accent?: string;
  textColor?: string;
  bg?: string;
};

export const MinimalBauhaus: React.FC<MinimalBauhausProps> = ({
  name,
  role = "",
  accent = "#10b981",
  textColor = "#ffffff",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const lineW = interpolate(draw, [0, 1], [0, 280], clamp);
  const textRise = spring({
    frame: frame - 8,
    fps,
    config: { damping: 14, stiffness: 140 },
  });
  const ty = interpolate(textRise, [0, 1], [40, 0], clamp);
  const opacity = interpolate(frame, [8, 18], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          left: LT_LEFT,
          bottom: LT_BOTTOM,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ width: lineW, height: 3, background: accent }} />
        <div style={{ transform: `translateY(${ty}px)`, opacity }}>
          <div
            style={{
              color: textColor,
              fontFamily: HELV,
              fontWeight: 700,
              fontSize: 58,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            {name}
          </div>
          {role && (
            <div
              style={{
                color: textColor,
                opacity: 0.6,
                fontFamily: HELV,
                fontWeight: 400,
                fontSize: 24,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              {role}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. RETRO VHS
// Chromatic offset, mono font, scan-line tint. Snaps in with a glitch.
// ─────────────────────────────────────────────────────────────────────────

export type RetroVhsProps = {
  name: string;
  role?: string;
  bg?: string;
};

export const RetroVhs: React.FC<RetroVhsProps> = ({
  name,
  role = "",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 4], [0, 1], clamp);
  // Glitch jitter for first 12 frames then settle
  const jitterActive = frame < 14;
  const jitterX = jitterActive ? Math.sin(frame * 32.1) * 4 : 0;
  const offsetActive = frame < 18 ? 1 : interpolate(frame, [18, 24], [1, 0], clamp);

  const Layer = ({ color, dx, dy }: { color: string; dx: number; dy: number }) => (
    <div
      style={{
        position: "absolute",
        left: dx * offsetActive,
        top: dy * offsetActive,
        color,
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 52,
        letterSpacing: 0,
        textShadow: "none",
        mixBlendMode: "screen",
      }}
    >
      {name.toUpperCase()}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          left: LT_LEFT,
          bottom: LT_BOTTOM,
          opacity,
          transform: `translateX(${jitterX}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            background: "rgba(0,0,0,0.65)",
            padding: "10px 18px",
            borderLeft: "4px solid #fff",
          }}
        >
          <div style={{ position: "relative", height: 56 }}>
            <Layer color="#ff2e63" dx={-4} dy={0} />
            <Layer color="#28e1c5" dx={4} dy={0} />
            <div
              style={{
                position: "relative",
                color: "#fff",
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 52,
              }}
            >
              {name.toUpperCase()}
            </div>
          </div>
          {role && (
            <div
              style={{
                color: "#a3e635",
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 20,
                letterSpacing: "0.1em",
                marginTop: 4,
              }}
            >
              ◉ REC · {role.toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. EDITORIAL ITALIC
// Magazine-style serif with restrained underline accent. Fades in word-
// by-word.
// ─────────────────────────────────────────────────────────────────────────

export type EditorialItalicProps = {
  name: string;
  role?: string;
  accent?: string;
  textColor?: string;
  bg?: string;
};

export const EditorialItalic: React.FC<EditorialItalicProps> = ({
  name,
  role = "",
  accent = "#fde047",
  textColor = "#ffffff",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = name.split(" ");

  const draw = spring({
    frame: frame - words.length * 3 - 8,
    fps,
    config: { damping: 18, stiffness: 90 },
  });
  const underlineScale = interpolate(draw, [0, 1], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          left: LT_LEFT,
          bottom: LT_BOTTOM,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 4,
              height: "0.22em",
              background: accent,
              transform: `scaleX(${underlineScale})`,
              transformOrigin: "left center",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              color: textColor,
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 72,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {words.map((w, i) => {
              const opacity = interpolate(
                frame,
                [i * 3, i * 3 + 6],
                [0, 1],
                clamp,
              );
              return (
                <span key={i} style={{ opacity, marginRight: "0.25em" }}>
                  {w}
                </span>
              );
            })}
          </div>
        </div>
        {role && (
          <div
            style={{
              color: textColor,
              opacity: interpolate(frame, [words.length * 3, words.length * 3 + 10], [0, 0.65], clamp),
              fontFamily: HELV,
              fontWeight: 400,
              fontSize: 22,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginTop: 12,
            }}
          >
            — {role}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 5. GLITCH LOWER-THIRD
// Damaged-feed look: RGB-split title with scrolling scan + brief signal-
// loss strips. Snaps in instantly, settles fast.
// ─────────────────────────────────────────────────────────────────────────

export type GlitchLowerThirdProps = {
  name: string;
  role?: string;
  bg?: string;
};

export const GlitchLowerThird: React.FC<GlitchLowerThirdProps> = ({
  name,
  role = "",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const opacity = frame < 2 ? 0 : 1;
  // Glitch decays from 1 → 0 over first 18 frames
  const glitch = Math.max(0, 1 - frame / 18);
  const dx = (Math.sin(frame * 0.9) * 5 + Math.sin(frame * 4.7) * 2) * glitch;
  const offsetR = 5 * (1 - glitch * 0.5);
  const offsetB = 4 * (1 - glitch * 0.5);

  // Two horizontal "tear" strips that flicker in first 18 frames
  const tear1Y = (frame * 13) % 80;
  const tear2Y = (frame * 7 + 30) % 80;
  const tearOpacity = glitch * 0.5;

  return (
    <AbsoluteFill style={{ background: bg, opacity }}>
      <div
        style={{
          position: "absolute",
          left: LT_LEFT,
          bottom: LT_BOTTOM,
          padding: "12px 18px",
          background: "rgba(10,10,10,0.78)",
          borderLeft: "3px solid #ff2e63",
          transform: `translateX(${dx}px)`,
          minWidth: 360,
        }}
      >
        {/* Tear strips */}
        <div
          style={{
            position: "absolute",
            left: 0, right: 0, top: tear1Y,
            height: 3,
            background: "#ff2e63",
            opacity: tearOpacity,
            mixBlendMode: "screen",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0, right: 0, top: tear2Y,
            height: 2,
            background: "#28e1c5",
            opacity: tearOpacity * 0.8,
            mixBlendMode: "screen",
          }}
        />
        {/* RGB split title */}
        <div style={{ position: "relative", height: 56 }}>
          <div
            style={{
              position: "absolute",
              left: -offsetR, top: 0,
              color: "#ff2e63",
              fontFamily: HELV,
              fontWeight: 900,
              fontSize: 50,
              letterSpacing: "-0.02em",
              mixBlendMode: "screen",
              textTransform: "uppercase",
            }}
          >
            {name}
          </div>
          <div
            style={{
              position: "absolute",
              left: offsetB, top: 0,
              color: "#28e1c5",
              fontFamily: HELV,
              fontWeight: 900,
              fontSize: 50,
              letterSpacing: "-0.02em",
              mixBlendMode: "screen",
              textTransform: "uppercase",
            }}
          >
            {name}
          </div>
          <div
            style={{
              position: "relative",
              color: "#fff",
              fontFamily: HELV,
              fontWeight: 900,
              fontSize: 50,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            {name}
          </div>
        </div>
        {role && (
          <div
            style={{
              color: "#aaa",
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 18,
              letterSpacing: "0.1em",
              marginTop: 4,
            }}
          >
            ⚡ {role.toUpperCase()}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
