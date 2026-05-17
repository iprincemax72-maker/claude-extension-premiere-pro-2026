// Six production-grade text presets, designed for video editors who want
// drop-in "title moment" components. Each preset accepts plain props and
// renders self-contained.
//
// All animations are driven by useCurrentFrame() + interpolate()/spring().
// NO CSS transitions, NO useState — everything is deterministic per-frame
// so renders are reproducible.

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
// 1. TILTED SLAM
// Bold uppercase title that slams onto the frame at a slight tilt with a
// spring overshoot and a brief settle wobble. White-on-black by default,
// but accepts any color combo.
// ─────────────────────────────────────────────────────────────────────────

export type TiltedSlamProps = {
  text: string;
  color?: string;          // text color
  bg?: string;             // bg color (use "transparent" for overlay)
  tiltDeg?: number;        // base tilt; default -5
  fontSize?: number;       // px
  delay?: number;          // frames before animation starts
};

export const TiltedSlam: React.FC<TiltedSlamProps> = ({
  text,
  color = "#ffffff",
  bg = "#0a0a0a",
  tiltDeg = -5,
  fontSize = 220,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  // Snap in over ~12 frames with a strong overshoot spring
  const slam = spring({
    frame: f,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.7 },
  });
  // Brief shake settle over frames 8-22 after slam lands
  const settlePhase = interpolate(f, [8, 22], [0, 1], clamp);
  const wobble =
    (1 - settlePhase) *
    Math.sin(f * 1.4) *
    4;

  // Scale from 1.25 → 1.0 (slam from "in your face")
  const scale = interpolate(slam, [0, 1], [1.25, 1], clamp);
  // Opacity ramps quickly in first 4 frames
  const opacity = interpolate(f, [0, 4], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color,
          fontFamily: HELV,
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
          transform: `rotate(${tiltDeg + wobble * 0.15}deg) scale(${scale}) translateY(${wobble}px)`,
          opacity,
          textShadow: "0 6px 0 rgba(0,0,0,0.25)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. WORD POP CAPTION
// TikTok-style word-by-word pop. Each word springs in from scale 0.6 → 1
// with slight rotation. The currently-active word is highlighted (e.g.
// yellow background).
// ─────────────────────────────────────────────────────────────────────────

export type WordPopCaptionProps = {
  words: string[];
  framesPerWord?: number;
  color?: string;
  highlight?: string;      // active-word bg color
  highlightColor?: string; // active-word text color
  fontSize?: number;
  bg?: string;
};

export const WordPopCaption: React.FC<WordPopCaptionProps> = ({
  words,
  framesPerWord = 14,
  color = "#ffffff",
  highlight = "#fef08a", // soft yellow
  highlightColor = "#000",
  fontSize = 140,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const activeIdx = Math.min(
    words.length - 1,
    Math.floor(frame / framesPerWord),
  );

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          fontFamily: HELV,
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          color,
          textAlign: "center",
          lineHeight: 1.05,
          maxWidth: "90%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.25em",
        }}
      >
        {words.map((w, i) => {
          const start = i * framesPerWord;
          const local = frame - start;
          const pop = spring({
            frame: local,
            fps,
            config: { damping: 10, stiffness: 240, mass: 0.6 },
          });
          const scale = interpolate(pop, [0, 1], [0.55, 1], clamp);
          const opacity = interpolate(local, [0, 4], [0, 1], clamp);
          const rot = interpolate(pop, [0, 1], [-6, 0], clamp);
          const isActive = i === activeIdx;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `scale(${scale}) rotate(${rot}deg)`,
                opacity,
                background: isActive ? highlight : "transparent",
                color: isActive ? highlightColor : color,
                padding: isActive ? "0.05em 0.18em" : "0.05em 0",
                borderRadius: 12,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. LETTER CASCADE
// Letters drop from above one by one with a spring stagger. Each letter
// bounces into place. Great for opening titles.
// ─────────────────────────────────────────────────────────────────────────

export type LetterCascadeProps = {
  text: string;
  framesPerLetter?: number;
  color?: string;
  fontSize?: number;
  bg?: string;
};

export const LetterCascade: React.FC<LetterCascadeProps> = ({
  text,
  framesPerLetter = 3,
  color = "#ffffff",
  fontSize = 200,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = Array.from(text);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: HELV,
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          color,
          whiteSpace: "pre",
        }}
      >
        {letters.map((ch, i) => {
          const local = frame - i * framesPerLetter;
          const drop = spring({
            frame: local,
            fps,
            config: { damping: 9, stiffness: 180, mass: 0.5 },
          });
          const translateY = interpolate(drop, [0, 1], [-220, 0], clamp);
          const opacity = interpolate(local, [0, 3], [0, 1], clamp);
          const scale = interpolate(drop, [0, 1], [0.7, 1], clamp);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `translateY(${translateY}px) scale(${scale})`,
                opacity,
              }}
            >
              {ch === " " ? " " : ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. TYPEWRITER PRO
// Char-by-char reveal using string slicing (NOT per-char opacity, per the
// Remotion best-practices rule). Includes a blinking cursor and a brief
// pause at periods/commas.
// ─────────────────────────────────────────────────────────────────────────

export type TypewriterProProps = {
  text: string;
  charsPerSecond?: number;
  color?: string;
  cursorColor?: string;
  fontSize?: number;
  bg?: string;
};

export const TypewriterPro: React.FC<TypewriterProProps> = ({
  text,
  charsPerSecond = 28,
  color = "#ffffff",
  cursorColor = "#10b981",
  fontSize = 96,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Build a frame map: each character costs (fps / cps) frames, with a
  // 6-frame pause after periods/commas/question marks.
  const baseCost = fps / charsPerSecond;
  let acc = 0;
  const charFrames: number[] = [];
  for (let i = 0; i < text.length; i++) {
    acc += baseCost;
    if (/[.,?!:]/.test(text[i])) acc += 6;
    charFrames.push(acc);
  }
  let revealed = 0;
  for (let i = 0; i < charFrames.length; i++) {
    if (frame >= charFrames[i]) revealed = i + 1;
  }
  const visible = text.slice(0, revealed);
  // Cursor blinks every 0.5s
  const cursorOn = Math.floor(frame / (fps / 2)) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          fontFamily:
            '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
          fontSize,
          fontWeight: 700,
          color,
          lineHeight: 1.2,
          textAlign: "left",
          maxWidth: "92%",
          whiteSpace: "pre-wrap",
        }}
      >
        {visible}
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "1em",
            verticalAlign: "text-bottom",
            background: cursorOn ? cursorColor : "transparent",
            marginLeft: 4,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 5. MARKER UNDERLINE
// Text fades in; then a colored highlighter line draws under it. The line
// uses scaleX from a left transform-origin so it looks hand-drawn.
// ─────────────────────────────────────────────────────────────────────────

export type MarkerUnderlineProps = {
  text: string;
  color?: string;
  marker?: string;
  fontSize?: number;
  bg?: string;
};

export const MarkerUnderline: React.FC<MarkerUnderlineProps> = ({
  text,
  color = "#0a0a0a",
  marker = "#fde047",
  fontSize = 180,
  bg = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text fade in over first 10 frames
  const textOpacity = interpolate(frame, [0, 10], [0, 1], clamp);
  // Marker draws frames 14 → 28
  const draw = spring({
    frame: frame - 14,
    fps,
    config: { damping: 18, stiffness: 90 },
  });
  const markerScaleX = interpolate(draw, [0, 1], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          style={{
            position: "absolute",
            left: -10,
            right: -10,
            bottom: 18,
            height: "0.35em",
            background: marker,
            transform: `scaleX(${markerScaleX})`,
            transformOrigin: "left center",
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: HELV,
            fontSize,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color,
            opacity: textOpacity,
            textTransform: "uppercase",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 6. COUNTER COUNT-UP
// Animated number count-up with easing, comma-grouping, optional prefix
// (e.g. "$") and suffix (e.g. "K", "%"). Holds the final value for the
// remainder of the composition.
// ─────────────────────────────────────────────────────────────────────────

export type CounterCountUpProps = {
  target: number;
  durationFrames?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
  fontSize?: number;
  bg?: string;
};

export const CounterCountUp: React.FC<CounterCountUpProps> = ({
  target,
  durationFrames = 45,
  prefix = "",
  suffix = "",
  decimals = 0,
  color = "#ffffff",
  fontSize = 280,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Eased progress 0 → 1
  const p = Math.min(1, Math.max(0, frame / durationFrames));
  const eased = 1 - Math.pow(1 - p, 2.2);
  const value = target * eased;
  // Format with comma grouping
  const formatted =
    decimals > 0
      ? value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.floor(value).toLocaleString("en-US");

  // Final-value scale punch (lands at p=1, small bump out then in)
  const punch = spring({
    frame: frame - durationFrames,
    fps,
    config: { damping: 10, stiffness: 180 },
  });
  const punchScale = 1 + punch * 0.06 - Math.max(0, punch - 0.7) * 0.06;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: HELV,
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color,
          transform: `scale(${punchScale})`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {prefix}
        {formatted}
        {suffix}
      </div>
    </AbsoluteFill>
  );
};


// ─────────────────────────────────────────────────────────────────────────
// 7. GLITCH TEXT
// RGB-split text with jitter + scan-line tear. Settles over time.
// ─────────────────────────────────────────────────────────────────────────

export type GlitchTextProps = {
  text: string;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const GlitchText: React.FC<GlitchTextProps> = ({
  text,
  color = "#ffffff",
  bg = "#0a0a0a",
  fontSize = 220,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 3], [0, 1], clamp);
  const settle = Math.max(0, 1 - frame / 30);
  const jitterX = Math.sin(frame * 9.3) * 3 * settle + Math.sin(frame * 41.1) * 1.5 * settle;
  const offsetR = (Math.sin(frame * 4.7) * 6 + 6) * (0.4 + settle * 0.6);
  const offsetB = (Math.cos(frame * 5.1) * 6 + 6) * (0.4 + settle * 0.6);

  const LayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    fontFamily: HELV,
    fontWeight: 900,
    fontSize,
    letterSpacing: "-0.04em",
    textTransform: "uppercase",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    mixBlendMode: "screen",
  };

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "relative", width: "90%", height: fontSize * 1.4, opacity, transform: `translateX(${jitterX}px)` }}>
        <div style={{ ...LayerStyle, color: "#ff2e63", transform: `translateX(${-offsetR}px)` }}>{text}</div>
        <div style={{ ...LayerStyle, color: "#28e1c5", transform: `translateX(${offsetB}px)` }}>{text}</div>
        <div style={{ ...LayerStyle, color }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 8. NEON GLOW
// Neon-sign text-shadow with flicker boot-up animation.
// ─────────────────────────────────────────────────────────────────────────

export type NeonGlowProps = {
  text: string;
  neonColor?: string;
  bg?: string;
  fontSize?: number;
};

export const NeonGlow: React.FC<NeonGlowProps> = ({
  text,
  neonColor = "#ec4899",
  bg = "#0a0a0a",
  fontSize = 220,
}) => {
  const frame = useCurrentFrame();
  // Flicker pattern: off-on-off-on-stable
  const flickerPattern = [0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1];
  const stage = Math.min(flickerPattern.length - 1, frame);
  const on = frame > flickerPattern.length ? 1 : flickerPattern[stage];
  // Subtle persistent flicker after boot
  const subtle = frame > flickerPattern.length
    ? 0.92 + Math.sin(frame * 0.5) * 0.04 + Math.sin(frame * 2.1) * 0.04
    : 1;
  const intensity = on * subtle;

  const glow = (size: number, alpha: number) =>
    `0 0 ${size}px rgba(${hex2rgb(neonColor)}, ${alpha * intensity})`;
  const shadow = [glow(8, 1), glow(20, 0.8), glow(40, 0.6), glow(80, 0.4)].join(", ");

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: on ? `rgb(${hex2rgb(neonColor)})` : "rgba(255,255,255,0.05)",
          textShadow: on ? shadow : "none",
          opacity: on ? 1 : 0.2,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

function hex2rgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 9. 3D EXTRUDE
// Stacked offset shadow gives a thick 3D extrude effect. Rotates in.
// ─────────────────────────────────────────────────────────────────────────

export type Extrude3DProps = {
  text: string;
  color?: string;
  extrudeColor?: string;
  bg?: string;
  fontSize?: number;
  depth?: number;
};

export const Extrude3D: React.FC<Extrude3DProps> = ({
  text,
  color = "#ffffff",
  extrudeColor = "#ec4899",
  bg = "#0a0a0a",
  fontSize = 240,
  depth = 18,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 180 } });
  const scale = interpolate(pop, [0, 1], [0.8, 1], clamp);
  const rot = interpolate(pop, [0, 1], [-12, 0], clamp);
  const opacity = interpolate(frame, [0, 4], [0, 1], clamp);

  // Build N offset shadow layers for the extrude
  const shadow = Array.from({ length: depth }, (_, i) =>
    `${i + 1}px ${i + 1}px 0 ${extrudeColor}`,
  ).join(", ");

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
          color,
          textShadow: shadow,
          transform: `scale(${scale}) rotate(${rot}deg)`,
          opacity,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 10. STAMP IMPACT
// Text slams in scaled-up + rotated; settles with a small shake.
// ─────────────────────────────────────────────────────────────────────────

export type StampImpactProps = {
  text: string;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const StampImpact: React.FC<StampImpactProps> = ({
  text,
  color = "#ef4444",
  bg = "#fbf3e4",
  fontSize = 280,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 14, stiffness: 280, mass: 0.6 } });
  const scale = interpolate(slam, [0, 1], [3.5, 1], clamp);
  const rot = interpolate(slam, [0, 1], [12, -4], clamp);
  const opacity = interpolate(frame, [0, 2], [0, 1], clamp);
  // Mini-shake on impact (frames 6-14)
  const shakeIntensity = Math.max(0, 1 - Math.max(0, frame - 6) / 8);
  const shakeX = Math.sin(frame * 3.1) * 6 * shakeIntensity;
  const shakeY = Math.cos(frame * 4.3) * 4 * shakeIntensity;

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
          color,
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale}) rotate(${rot}deg)`,
          opacity,
          // Slight stamp-ink imperfection
          textShadow: "0 0 8px rgba(239,68,68,0.4), 2px 2px 0 rgba(0,0,0,0.1)",
          // Distress: filter creates rough edges
          filter: "contrast(1.05)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 11. KARAOKE LYRIC
// Each word turns from grey → highlight color as the playhead passes its
// start frame. Optional per-character pulse on the active word.
// ─────────────────────────────────────────────────────────────────────────

export type KaraokeLyricProps = {
  words: string[];
  framesPerWord?: number;
  inactiveColor?: string;
  activeColor?: string;
  bg?: string;
  fontSize?: number;
};

export const KaraokeLyric: React.FC<KaraokeLyricProps> = ({
  words,
  framesPerWord = 18,
  inactiveColor = "rgba(255,255,255,0.25)",
  activeColor = "#fde047",
  bg = "#0a0a0a",
  fontSize = 130,
}) => {
  const frame = useCurrentFrame();
  const activeIdx = Math.floor(frame / framesPerWord);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          textAlign: "center",
          lineHeight: 1.1,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.3em",
        }}
      >
        {words.map((w, i) => {
          const wordStart = i * framesPerWord;
          const local = frame - wordStart;
          const localProgress = Math.min(1, Math.max(0, local / framesPerWord));
          const isActive = i === activeIdx;
          const isPast = i < activeIdx;
          // Active word: each char fills as the playhead progresses through it
          if (isActive) {
            const charsLit = Math.floor(localProgress * w.length);
            return (
              <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                {Array.from(w).map((ch, ci) => (
                  <span
                    key={ci}
                    style={{
                      color: ci < charsLit ? activeColor : inactiveColor,
                      transition: "none",
                    }}
                  >
                    {ch}
                  </span>
                ))}
              </span>
            );
          }
          return (
            <span
              key={i}
              style={{ color: isPast ? activeColor : inactiveColor, display: "inline-block" }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
