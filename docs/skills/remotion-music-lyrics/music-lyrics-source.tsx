// remotion-music-lyrics v2 — music & lyric components with proper beat motion.
//
// v1 had simple lyric scaling on beats. v2:
//   • KaraokeLine: each word has a SWEEP highlight (color gradient
//     wipes across) instead of just instant color change
//   • LyricDrop: bass glow LAGS the scale (real bass shadow physics)
//   • BeatHitPop: shock ring on each beat + color flash
//   • DropIncoming: each number has its own zoom-in personality + the
//     flash transitions cleanly
//   • NowPlaying: progress bar has a subtle scrubber-dot at the leading
//     edge; cover art pulses to beat
//   • SoundWaveBars: peak indicators that hold briefly at top

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

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16);
  const pb = parseInt(b.replace("#", ""), 16);
  const r = Math.round(((pa >> 16) & 0xff) * (1 - t) + ((pb >> 16) & 0xff) * t);
  const g = Math.round(((pa >> 8) & 0xff) * (1 - t) + ((pb >> 8) & 0xff) * t);
  const bb = Math.round((pa & 0xff) * (1 - t) + (pb & 0xff) * t);
  return `#${((r << 16) | (g << 8) | bb).toString(16).padStart(6, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════
// 1. KARAOKE LINE — sweep highlight per word
// ═════════════════════════════════════════════════════════════════════════

export type KaraokeLineProps = {
  words: string[];
  framesPerWord?: number;
  startFrame?: number;
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  bg?: string;
};

export const KaraokeLine: React.FC<KaraokeLineProps> = ({
  words = ["sing", "along", "with", "me"],
  framesPerWord = 14,
  startFrame = 0,
  textColor = "#ffffff",
  highlightColor = "#ffd60a",
  fontSize = 90,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "10%",
      }}
    >
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          textAlign: "center",
          color: textColor,
          textShadow: "0 4px 0 rgba(0,0,0,0.6)",
        }}
      >
        {words.map((w, i) => {
          const wordStart = i * framesPerWord;
          const sungT = interpolate(f, [wordStart, wordStart + framesPerWord], [0, 1], clamp);
          // Past-word stays highlighted
          const isActive = sungT > 0 && sungT < 1;
          // SWEEP highlight: use background-clip:text with a linear gradient
          // that shifts position based on sungT
          const sweepP = sungT * 1.1; // overshoot slightly to fully cover
          const wordColor = sungT >= 1 ? highlightColor : textColor;
          const scale = isActive ? interpolate(sungT, [0, 0.4, 1], [1, 1.08, 1]) : 1;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                position: "relative",
                marginRight: 14,
                transform: `scale(${scale})`,
              }}
            >
              {/* Base layer */}
              <span style={{ color: textColor }}>{w}</span>
              {/* Sweep highlight overlay using background-clip text */}
              {sungT > 0 && sungT < 1 ? (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    background: `linear-gradient(90deg, ${highlightColor} 0%, ${highlightColor} ${sweepP * 100}%, transparent ${sweepP * 100}%, transparent 100%)`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    textShadow: `0 0 18px ${highlightColor}aa`,
                  }}
                >
                  {w}
                </span>
              ) : null}
              {sungT >= 1 ? (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    color: highlightColor,
                    textShadow: `0 0 30px ${highlightColor}aa, 0 4px 0 rgba(0,0,0,0.6)`,
                  }}
                >
                  {w}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. LYRIC DROP — bass glow LAGS the scale
// ═════════════════════════════════════════════════════════════════════════

export type LyricDropProps = {
  lyric: string;
  bpm?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const LyricDrop: React.FC<LyricDropProps> = ({
  lyric = "drop the beat",
  bpm = 120,
  startFrame = 0,
  color = "#ffffff",
  bg = "#0a0a0a",
  fontSize = 140,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.pop });
  const framesPerBeat = (fps * 60) / bpm;
  const beatPhase = (f % framesPerBeat) / framesPerBeat;
  // Scale thump
  const thump = beatPhase < 0.1 ? 1 - beatPhase / 0.1 : 0;
  const thumpScale = 1 + thump * 0.06;
  // Glow LAGS the scale by 0.05 of phase — bass kick decays slower than visual
  const lagPhase = (f % framesPerBeat + framesPerBeat - framesPerBeat * 0.06) % framesPerBeat / framesPerBeat;
  const glowThump = lagPhase < 0.15 ? 1 - lagPhase / 0.15 : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "8%",
      }}
    >
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color,
          textAlign: "center",
          opacity: enter,
          transform: `scale(${enter * thumpScale})`,
          textShadow: `0 0 ${glowThump * 50}px ${color}99, 0 8px 0 rgba(0,0,0,0.5)`,
        }}
      >
        {lyric}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. BEAT HIT POP — shock ring on each beat
// ═════════════════════════════════════════════════════════════════════════

export type BeatHitPopProps = {
  word: string;
  beats?: number;
  bpm?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
  fontSize?: number;
};

export const BeatHitPop: React.FC<BeatHitPopProps> = ({
  word = "BEAT",
  beats = 4,
  bpm = 120,
  startFrame = 0,
  color = "#ff2d55",
  bg = "#0a0a0a",
  fontSize = 240,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const framesPerBeat = (fps * 60) / bpm;
  const beatIdx = Math.floor(f / framesPerBeat);
  const beatPhase = (f % framesPerBeat) / framesPerBeat;
  const isActive = beatIdx < beats && beatPhase < 0.2;
  const scale = 1 + (isActive ? (1 - beatPhase / 0.2) * 0.3 : 0);

  // Shock ring per beat
  const ringPhase = (f % framesPerBeat) / framesPerBeat;
  const ringScale = interpolate(ringPhase, [0, 1], [1, 2.5]);
  const ringOp = beatIdx < beats ? interpolate(ringPhase, [0, 0.15, 1], [0, 0.6, 0]) : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "relative" }}>
        {/* Shock ring */}
        {ringOp > 0 ? (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 400,
              height: 400,
              border: `8px solid ${color}`,
              borderRadius: "50%",
              transform: `translate(-50%, -50%) scale(${ringScale})`,
              opacity: ringOp,
              pointerEvents: "none",
            }}
          />
        ) : null}
        <div
          style={{
            fontFamily: HELV,
            fontWeight: 900,
            fontSize,
            color,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            transform: `scale(${scale})`,
            textShadow: `0 0 ${isActive ? 60 : 0}px ${color}aa, 0 8px 0 rgba(0,0,0,0.4)`,
          }}
        >
          {word}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. DROP INCOMING — countdown with personality per number
// ═════════════════════════════════════════════════════════════════════════

export type DropIncomingProps = {
  word?: string;
  framesPerNumber?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
};

export const DropIncoming: React.FC<DropIncomingProps> = ({
  word = "DROP",
  framesPerNumber = 24,
  startFrame = 0,
  color = "#ffd60a",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const num =
    f < framesPerNumber ? 3 :
    f < framesPerNumber * 2 ? 2 :
    f < framesPerNumber * 3 ? 1 :
    null;
  const phase = (f % framesPerNumber) / framesPerNumber;
  // Each number has its own personality:
  //   3 — slams from above (Y enters)
  //   2 — spirals in (rotation)
  //   1 — pops scale 0 → 1 → settle (most aggressive)
  const numIdx = num === 3 ? 0 : num === 2 ? 1 : 2;
  let popScale = 0, ySlam = 0, rot = 0;
  if (num !== null) {
    if (numIdx === 0) {
      popScale = interpolate(phase, [0, 0.3, 1], [1.5, 1, 0.85], clamp);
      ySlam = interpolate(phase, [0, 0.25], [-200, 0], clamp);
    } else if (numIdx === 1) {
      popScale = interpolate(phase, [0, 0.3, 1], [2, 1, 0.85], clamp);
      rot = interpolate(phase, [0, 0.3, 1], [-360, 0, 30], clamp);
    } else {
      popScale = interpolate(phase, [0, 0.3, 1], [2.5, 1, 0.85], clamp);
    }
  }
  const opacity = num !== null ? interpolate(phase, [0, 0.2, 0.85, 1], [0, 1, 1, 0], clamp) : 0;

  // Flash at frame = framesPerNumber * 3
  const flashF = f - framesPerNumber * 3;
  const flash = interpolate(flashF, [0, 3, 12], [0, 1, 0], clamp);

  // Word reveal after flash
  const wordSpring = spring({ frame: flashF - 3, fps, config: motion.slam });
  const wordOp = interpolate(flashF, [3, 12], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {num !== null ? (
        <div
          style={{
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: 480,
            color,
            opacity,
            transform: `translateY(${ySlam}px) scale(${popScale}) rotate(${rot}deg)`,
            letterSpacing: "-0.06em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 12px 0 ${shade(color, -30)}`,
          }}
        >
          {num}
        </div>
      ) : null}
      {flash > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#ffffff",
            opacity: flash,
          }}
        />
      ) : null}
      {wordOp > 0 ? (
        <div
          style={{
            position: "absolute",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: 300,
            color: "#fff",
            letterSpacing: "-0.04em",
            transform: `scale(${wordSpring})`,
            opacity: wordOp,
            textShadow: `0 0 60px ${color}aa, 0 12px 0 rgba(0,0,0,0.5)`,
          }}
        >
          {word}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. NOW PLAYING — Apple Music-style with scrubber dot + beat-cover pulse
// ═════════════════════════════════════════════════════════════════════════

export type NowPlayingProps = {
  track: string;
  artist: string;
  coverUrl?: string;
  durationSec?: number;
  startSec?: number;
  startFrame?: number;
  bg?: string;
  bpm?: number;
};

export const NowPlaying: React.FC<NowPlayingProps> = ({
  track = "Late Hours",
  artist = "Unknown Artist",
  coverUrl,
  durationSec = 180,
  startSec = 0,
  startFrame = 0,
  bg = "#0a0a0a",
  bpm = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.haptic });

  const elapsed = Math.min(startSec + f / fps, durationSec);
  const progress = elapsed / durationSec;
  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");

  // Cover art beat pulse
  const framesPerBeat = (fps * 60) / bpm;
  const beatPhase = (f % framesPerBeat) / framesPerBeat;
  const coverPulse = 1 + (beatPhase < 0.1 ? (1 - beatPhase / 0.1) * 0.03 : 0);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        padding: "5%",
      }}
    >
      <div
        style={{
          background: "rgba(40, 40, 42, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 36,
          padding: 36,
          width: "85%",
          maxWidth: 1200,
          display: "flex",
          alignItems: "center",
          gap: 36,
          color: "#fff",
          fontFamily: HELV,
          transform: `scale(${enter})`,
          opacity: enter,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 22,
            background: coverUrl
              ? `url(${coverUrl}) center/cover`
              : "linear-gradient(135deg, #fe2c55, #25f4ee, #ff42d3)",
            flexShrink: 0,
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            transform: `scale(${coverPulse})`,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {track}
          </div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
            {artist}
          </div>
          <div style={{ marginTop: 30, position: "relative" }}>
            <div
              style={{
                width: "100%",
                height: 8,
                background: "rgba(255,255,255,0.18)",
                borderRadius: 4,
                overflow: "visible",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${progress * 100}%`,
                  height: "100%",
                  background: "#fff",
                  borderRadius: 4,
                }}
              />
              {/* Scrubber dot at leading edge */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${progress * 100}%`,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 0 8px rgba(255,255,255,0.6)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                fontSize: 22,
                color: "rgba(255,255,255,0.6)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>{mm}:{ss}</span>
              <span>
                -{Math.floor((durationSec - elapsed) / 60)}:
                {Math.floor((durationSec - elapsed) % 60).toString().padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. SOUND WAVE BARS — with peak-hold indicators
// ═════════════════════════════════════════════════════════════════════════

export type SoundWaveBarsProps = {
  count?: number;
  color?: string;
  bg?: string;
  size?: number;
  speed?: number;
};

export const SoundWaveBars: React.FC<SoundWaveBarsProps> = ({
  count = 5,
  color = "#25f4ee",
  bg = "transparent",
  size = 220,
  speed = 0.45,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: size * 0.08,
          height: size,
          position: "relative",
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const h = 0.3 + Math.abs(Math.sin(frame * speed * (0.7 + i * 0.13) + i * 1.5)) * 0.7;
          // Peak hold: store the recent max (using a windowed approximation)
          const peak = Math.max(
            h,
            0.3 + Math.abs(Math.sin((frame - 6) * speed * (0.7 + i * 0.13) + i * 1.5)) * 0.7,
            0.3 + Math.abs(Math.sin((frame - 12) * speed * (0.7 + i * 0.13) + i * 1.5)) * 0.7
          );
          return (
            <div key={i} style={{ position: "relative", width: size * 0.16, height: "100%" }}>
              {/* Peak indicator — small dot at peak height */}
              <div
                style={{
                  position: "absolute",
                  bottom: `${peak * 100}%`,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: "#fff",
                  borderRadius: 2,
                  opacity: 0.7,
                  marginBottom: 4,
                }}
              />
              {/* Bar */}
              <div
                style={{
                  width: "100%",
                  height: `${h * 100}%`,
                  background: `linear-gradient(180deg, ${color} 0%, ${shade(color, -25)} 100%)`,
                  borderRadius: size * 0.05,
                  boxShadow: `0 0 ${size * 0.08}px ${color}77`,
                  position: "absolute",
                  bottom: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
