// remotion-word-effects v2 — word/letter manipulation with multi-act motion.

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
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

const seeded = (s: number) => {
  const v = (s * 1664525 + 1013904223) % 4294967296;
  return v / 4294967296;
};

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════
// 1. WORD SWAP — smooth cross-fade with scale-pop between words
// ═════════════════════════════════════════════════════════════════════════

export type WordSwapProps = {
  words: string[];
  framesPerWord?: number;
  prefix?: string;
  suffix?: string;
  startFrame?: number;
  color?: string;
  swapColor?: string;
  bg?: string;
  fontSize?: number;
};

export const WordSwap: React.FC<WordSwapProps> = ({
  words = ["fast", "free", "fun", "fierce"],
  framesPerWord = 22,
  prefix,
  suffix,
  startFrame = 0,
  color = "#ffffff",
  swapColor = "#ff7a4d",
  bg = "#0a0a0a",
  fontSize = 140,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const idx = Math.min(words.length - 1, Math.floor(f / framesPerWord));
  const phase = (f % framesPerWord) / framesPerWord;
  const isLast = idx === words.length - 1;

  // Smooth cross-fade: pop in 0→0.2, hold, fade out 0.85→1
  const popIn = interpolate(phase, [0, 0.2], [0, 1], clamp);
  const popOut = !isLast ? interpolate(phase, [0.85, 1], [1, 0], clamp) : 1;
  const opacity = Math.min(popIn, popOut);
  const scale = interpolate(opacity, [0, 1], [0.6, 1]);
  // Subtle Y drift on entrance (up to 0) — adds verticality
  const yIn = (1 - popIn) * 16;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
        color,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          display: "flex",
          alignItems: "baseline",
          gap: 20,
        }}
      >
        {prefix ? <span>{prefix}</span> : null}
        <span
          style={{
            display: "inline-block",
            color: swapColor,
            transform: `scale(${scale}) translateY(${yIn}px)`,
            opacity,
            textShadow: `0 0 ${opacity * 30}px ${swapColor}aa, 0 6px 0 rgba(0,0,0,0.4)`,
          }}
        >
          {words[idx]}
        </span>
        {suffix ? <span>{suffix}</span> : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. STRIKETHROUGH SWAP
// ═════════════════════════════════════════════════════════════════════════

export type StrikethroughSwapProps = {
  oldWord: string;
  newWord: string;
  strikeFrame?: number;
  newFrame?: number;
  startFrame?: number;
  color?: string;
  strikeColor?: string;
  newColor?: string;
  bg?: string;
  fontSize?: number;
};

export const StrikethroughSwap: React.FC<StrikethroughSwapProps> = ({
  oldWord = "boring",
  newWord = "iconic",
  strikeFrame = 14,
  newFrame = 28,
  startFrame = 0,
  color = "#ffffff",
  strikeColor = "#ff2d55",
  newColor = "#7eb800",
  bg = "#0a0a0a",
  fontSize = 160,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;

  const strikeProgress = interpolate(f, [strikeFrame, strikeFrame + 12], [0, 1], clamp);
  // Old word: full opacity → dim to 0.4 after strike → fade to 0.2 when new appears
  const oldOp = interpolate(f, [0, 6, newFrame, newFrame + 10], [0, 1, 1, 0.25], clamp);
  const newOp = interpolate(f, [newFrame, newFrame + 14], [0, 1], clamp);
  const newY = interpolate(f, [newFrame, newFrame + 18], [40, 0], clamp);
  // Slight scale punch on new word arrival
  const newScale = interpolate(f, [newFrame, newFrame + 6, newFrame + 14], [0.9, 1.06, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
        color,
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Old word with strike */}
      <div
        style={{
          position: "relative",
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color,
          opacity: oldOp,
        }}
      >
        {oldWord}
        <div
          style={{
            position: "absolute",
            top: "55%",
            left: "-3%",
            height: 12,
            width: `${strikeProgress * 106}%`,
            background: strikeColor,
            borderRadius: 4,
            transform: "translateY(-50%) rotate(-3deg)",
            boxShadow: `0 0 ${strikeProgress * 14}px ${strikeColor}, 0 0 ${strikeProgress * 28}px ${strikeColor}77`,
          }}
        />
      </div>
      {/* New word */}
      <div
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: newColor,
          opacity: newOp,
          transform: `translateY(${newY}px) scale(${newScale})`,
          textShadow: `0 0 ${newOp * 30}px ${newColor}aa, 0 6px 0 rgba(0,0,0,0.4)`,
        }}
      >
        {newWord}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. HIGHLIGHTED WORD
// ═════════════════════════════════════════════════════════════════════════

export type HighlightedWordProps = {
  sentence: string;
  highlightIndex?: number;
  highlightColor?: string;
  textColor?: string;
  bg?: string;
  startFrame?: number;
  fontSize?: number;
};

export const HighlightedWord: React.FC<HighlightedWordProps> = ({
  sentence = "the only thing that matters",
  highlightIndex = 3,
  highlightColor = "#ffd60a",
  textColor = "#0a0a0a",
  bg = "#f7f3e8",
  startFrame = 0,
  fontSize = 110,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const words = sentence.split(/\s+/);
  // Highlighter sweeps left-to-right with slight bleed
  const draw = interpolate(f, [6, 22], [0, 1], clamp);
  // Text opacity fades in
  const textOp = interpolate(f, [0, 14], [0, 1], clamp);
  // Slight ink bleed wobble on the highlight
  const wobble = f > 22 ? Math.sin(f * 0.12) * 0.5 : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "10%",
        fontFamily: HELV,
        color: textColor,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          textAlign: "center",
          opacity: textOp,
        }}
      >
        {words.map((w, i) => (
          <React.Fragment key={i}>
            {i === highlightIndex ? (
              <span style={{ display: "inline-block", position: "relative", padding: "0 12px" }}>
                <span
                  style={{
                    position: "absolute",
                    bottom: 6 + wobble,
                    left: 0,
                    height: "75%",
                    width: `${draw * 100}%`,
                    background: highlightColor,
                    transform: `skew(${-6 + wobble * 0.5}deg)`,
                    zIndex: 0,
                    borderRadius: 4,
                    boxShadow: `0 2px 0 ${shade(highlightColor, -20)}`,
                  }}
                />
                <span style={{ position: "relative", zIndex: 1 }}>{w}</span>
              </span>
            ) : (
              <span>{w}</span>
            )}{" "}
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. CENSOR BAR — word stays partially visible (pixelated underneath)
// ═════════════════════════════════════════════════════════════════════════

export type CensorBarProps = {
  word: string;
  caption?: string;
  startFrame?: number;
  coverFrame?: number;
  bg?: string;
  textColor?: string;
  fontSize?: number;
};

export const CensorBar: React.FC<CensorBarProps> = ({
  word = "this",
  caption = "BLEEP",
  startFrame = 0,
  coverFrame = 14,
  bg = "#0a0a0a",
  textColor = "#ffffff",
  fontSize = 180,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const cover = interpolate(f, [0, coverFrame], [0, 1], clamp);
  const captionPop = interpolate(f, [coverFrame - 2, coverFrame + 8], [0, 1], clamp);
  const captionShake = Math.sin(f * 0.9) * Math.max(0, 1 - (f - coverFrame) / 22) * 6;
  // Bar bobs slightly after settle
  const barBob = f > coverFrame + 8 ? Math.sin(f * 0.18) * 1.2 : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: HELV,
      }}
    >
      <div
        style={{
          fontSize: 50,
          fontWeight: 900,
          color: "#ff2d55",
          letterSpacing: "0.18em",
          marginBottom: 24,
          opacity: captionPop,
          transform: `scale(${captionPop}) rotate(${captionShake * 0.3}deg)`,
          textShadow: "0 4px 0 rgba(0,0,0,0.4)",
        }}
      >
        {caption}
      </div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontSize,
            fontWeight: 900,
            color: textColor,
            letterSpacing: "-0.04em",
          }}
        >
          {word}
        </div>
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "-4%",
            height: "65%",
            width: `${cover * 108}%`,
            background: "#0a0a0a",
            border: "4px solid #fff",
            borderRadius: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.6)",
            transform: `translateY(${barBob}px)`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. SPINNING LETTERS — per-letter rotation with overshoot
// ═════════════════════════════════════════════════════════════════════════

export type SpinningLettersProps = {
  text: string;
  staggerFrames?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const SpinningLetters: React.FC<SpinningLettersProps> = ({
  text = "SPIN",
  staggerFrames = 4,
  startFrame = 0,
  color = "#ffffff",
  bg = "#0a0a0a",
  fontSize = 220,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = text.split("");

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color,
          display: "flex",
          gap: 4,
          textTransform: "uppercase",
        }}
      >
        {letters.map((l, i) => {
          const f = frame - startFrame - i * staggerFrames;
          const spinT = spring({
            frame: f,
            fps,
            config: motion.pop, // light overshoot
          });
          // Each letter spins to a different final angle for life
          const finalAngle = (seeded(i * 17) - 0.5) * 4; // ±2° final tilt
          const rot = interpolate(spinT, [0, 1], [-720, finalAngle]);
          const scale = interpolate(spinT, [0, 1], [0.2, 1]);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `rotate(${rot}deg) scale(${scale})`,
                opacity: spinT,
                minWidth: l === " " ? fontSize * 0.3 : "auto",
                textShadow: "0 4px 0 rgba(0,0,0,0.3)",
              }}
            >
              {l === " " ? " " : l}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. FALLING LETTERS — drop + ground bounce
// ═════════════════════════════════════════════════════════════════════════

export type FallingLettersProps = {
  text: string;
  staggerFrames?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const FallingLetters: React.FC<FallingLettersProps> = ({
  text = "DROP",
  staggerFrames = 3,
  startFrame = 0,
  color = "#ffffff",
  bg = "#0a0a0a",
  fontSize = 220,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = text.split("");

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color,
          display: "flex",
          gap: 4,
          textTransform: "uppercase",
        }}
      >
        {letters.map((l, i) => {
          const f = frame - startFrame - i * staggerFrames;
          const fall = spring({
            frame: f,
            fps,
            config: motion.slam,
          });
          const y = interpolate(fall, [0, 1], [-700, 0]);
          // Squash on ground bounce — scaleY < 1 right when landing
          const bounce = interpolate(fall, [0.9, 1, 1.1], [1, 0.78, 1], clamp);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `translateY(${y}px) scaleY(${bounce})`,
                opacity: fall,
                minWidth: l === " " ? fontSize * 0.3 : "auto",
                textShadow: "0 8px 0 rgba(0,0,0,0.3)",
              }}
            >
              {l === " " ? " " : l}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 7. SPARKLE TITLE
// ═════════════════════════════════════════════════════════════════════════

export type SparkleTitleProps = {
  text: string;
  startFrame?: number;
  color?: string;
  sparkleColor?: string;
  bg?: string;
  fontSize?: number;
};

export const SparkleTitle: React.FC<SparkleTitleProps> = ({
  text = "MAGIC",
  startFrame = 0,
  color = "#ffffff",
  sparkleColor = "#ffd60a",
  bg = "#0a0a0a",
  fontSize = 200,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.pop });
  const sparkles = Array.from({ length: 18 });

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: HELV,
      }}
    >
      {sparkles.map((_, i) => {
        const startOff = Math.floor(seeded(i * 5 + 1) * 30);
        const period = 40 + Math.floor(seeded(i * 7) * 30);
        const sf = (f - startOff) % period;
        if (f < startOff) return null;
        const t = Math.max(0, sf) / period;
        const op = interpolate(t, [0, 0.2, 0.7, 1], [0, 1, 1, 0]);
        const x = seeded(i * 11 + 3) * 100;
        const y = seeded(i * 13 + 7) * 100;
        const depth = seeded(i * 19);
        const size = 28 + (1 - depth) * 30;
        const rot = sf * (1 + (1 - depth) * 2);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${y}%`,
              left: `${x}%`,
              fontSize: size,
              opacity: op * (1 - depth * 0.35),
              transform: `translate(-50%, -50%) rotate(${rot}deg)`,
              color: sparkleColor,
              filter: depth > 0.6 ? `blur(${(depth - 0.6) * 2}px)` : undefined,
              textShadow: depth < 0.4 ? `0 0 20px ${sparkleColor}77` : undefined,
            }}
          >
            ✦
          </div>
        );
      })}
      <div
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color,
          textTransform: "uppercase",
          transform: `scale(${enter})`,
          opacity: enter,
          textShadow: `0 0 ${enter * 40}px ${sparkleColor}aa, 0 8px 0 rgba(0,0,0,0.35)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
