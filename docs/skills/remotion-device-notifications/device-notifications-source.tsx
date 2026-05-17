// remotion-device-notifications v2 — multi-act sticker/notification overlays.

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
const HAND = '"Comic Sans MS", "Marker Felt", "Patrick Hand", cursive';

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

function tremor(frame: number, amp = 1, speed = 0.18): number {
  return (
    Math.sin(frame * speed) * amp +
    Math.sin(frame * speed * 1.7) * amp * 0.45 +
    Math.sin(frame * speed * 0.3) * amp * 0.25
  );
}

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((percent / 100) * 255)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round((percent / 100) * 255)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((percent / 100) * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// 1. STICKY NOTE — slam + idle wobble after settle
export type StickyNoteProps = { text: string; tiltDeg?: number; color?: string; startFrame?: number; bg?: string; };
export const StickyNote: React.FC<StickyNoteProps> = ({
  text = "remember to ship", tiltDeg = 6, color = "#ffeb6e", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const slam = spring({ frame: f, fps, config: motion.slam });
  const scale = interpolate(slam, [0, 1], [2.2, 1]);
  const slamWobble = Math.sin(f * 0.7) * Math.max(0, 1 - f / 16) * 4;
  const idleWobble = f > 16 ? tremor(f, 0.3, 0.06) : 0;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: 600, height: 600, padding: 60,
          background: color,
          fontFamily: HAND, fontSize: 70, color: "#2a2a2a",
          transform: `rotate(${tiltDeg + slamWobble * 0.3 + idleWobble}deg) scale(${scale})`,
          opacity: slam,
          boxShadow: "0 20px 50px rgba(0,0,0,0.35), inset 0 -4px 0 rgba(0,0,0,0.06)",
          backgroundImage: `linear-gradient(135deg, ${color} 0%, ${shade(color, -8)} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          textAlign: "center", lineHeight: 1.2,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// 2. SPEECH BUBBLE — pop + text reveal
export type SpeechBubbleProps = { text: string; tailDirection?: "left" | "right"; startFrame?: number; bg?: string; };
export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text = "wait, what?", tailDirection = "left", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const pop = spring({ frame: f, fps, config: motion.pop });
  const textOp = interpolate(f, [8, 18], [0, 1], clamp);
  // Bubble breathes after settle
  const breath = f > 20 ? 1 + tremor(f, 0.004, 0.05) : 1;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          background: "#fff",
          color: "#0a0a0a",
          fontFamily: HELV,
          fontWeight: 800,
          fontSize: 60,
          padding: "40px 60px",
          borderRadius: 40,
          maxWidth: "70%",
          textAlign: "center",
          transform: `scale(${pop * breath})`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
          border: "5px solid #0a0a0a",
          opacity: pop,
        }}
      >
        <div style={{ opacity: textOp }}>{text}</div>
        <div
          style={{
            position: "absolute", bottom: -32,
            [tailDirection]: 50,
            width: 0, height: 0,
            borderLeft: tailDirection === "left" ? "0 solid transparent" : "30px solid transparent",
            borderRight: tailDirection === "right" ? "0 solid transparent" : "30px solid transparent",
            borderTop: "40px solid #fff",
            filter: "drop-shadow(0 4px 0 #0a0a0a)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// 3. THOUGHT BUBBLE — sequential dot pop + main bubble breath
export type ThoughtBubbleProps = { text: string; startFrame?: number; bg?: string; };
export const ThoughtBubble: React.FC<ThoughtBubbleProps> = ({
  text = "hmm...", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const rise = spring({ frame: f, fps, config: motion.haptic });
  const y = interpolate(rise, [0, 1], [80, 0]);
  // Main bubble has breath after settle
  const breath = f > 16 ? 1 + tremor(f, 0.005, 0.05) : 1;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `translateY(${y}px)`, opacity: rise, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {[
          { size: 24, delay: 14 },
          { size: 38, delay: 8 },
          { size: 58, delay: 4 },
        ].map((d, i) => {
          const dop = interpolate(f, [d.delay, d.delay + 10], [0, 1], clamp);
          // Each dot has its own little breath
          const dotBreath = 1 + tremor(f + i * 5, 0.03, 0.08);
          return (
            <div
              key={i}
              style={{
                width: d.size, height: d.size,
                background: "#fff",
                border: "4px solid #0a0a0a",
                borderRadius: "50%",
                marginBottom: 14,
                opacity: dop,
                transform: `scale(${dotBreath})`,
              }}
            />
          );
        })}
        <div
          style={{
            background: "#fff",
            border: "5px solid #0a0a0a",
            borderRadius: 120,
            padding: "60px 80px",
            fontFamily: HELV,
            fontWeight: 700,
            fontSize: 52,
            color: "#0a0a0a",
            maxWidth: "65%",
            textAlign: "center",
            boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            transform: `scale(${breath})`,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 4. TAPE STICKER
export type TapeStickerProps = { text: string; tiltDeg?: number; color?: string; startFrame?: number; bg?: string; };
export const TapeSticker: React.FC<TapeStickerProps> = ({
  text = "DO NOT FORGET", tiltDeg = -8, color = "#ffe89a", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const land = spring({ frame: f, fps, config: motion.slam });
  const wobble = Math.sin(f * 0.6) * Math.max(0, 1 - f / 18) * 3;
  const idleWobble = f > 18 ? tremor(f, 0.2, 0.05) : 0;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          background: color,
          padding: "30px 80px",
          fontFamily: HAND,
          fontSize: 70,
          color: "#3a2a18",
          transform: `rotate(${tiltDeg + wobble * 0.2 + idleWobble}deg) scale(${land})`,
          opacity: land,
          boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
          clipPath: "polygon(0% 8%, 4% 0%, 12% 8%, 22% 0%, 32% 6%, 44% 0%, 56% 8%, 68% 0%, 80% 6%, 92% 0%, 100% 10%, 96% 100%, 88% 92%, 76% 100%, 64% 92%, 52% 100%, 40% 92%, 28% 100%, 16% 92%, 4% 100%, 0% 92%)",
          backgroundImage: `linear-gradient(135deg, ${color}, ${shade(color, -10)}), repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 3px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// 5. CAMERA FLASH — exposure ramp instead of linear
export type CameraFlashProps = { startFrame?: number; flashFrames?: number; bg?: string; };
export const CameraFlash: React.FC<CameraFlashProps> = ({
  startFrame = 0, flashFrames = 4, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  // Exposure ramp: bright in 1 frame, decay over remaining frames (mimics real photo flash)
  const op = f < 0 ? 0 : f < 1 ? 1 : Math.max(0, 1 - (f - 1) / (flashFrames - 1));

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div style={{ position: "absolute", inset: 0, background: "#ffffff", opacity: op }} />
    </AbsoluteFill>
  );
};

// 6. RECORDING DOT — pulse + tally counter
export type RecordingDotProps = {
  label?: string;
  corner?: "top-left" | "top-right";
  bg?: string;
  /** Show elapsed timer next to REC. Default true. */
  withTimer?: boolean;
};
export const RecordingDot: React.FC<RecordingDotProps> = ({
  label = "REC", corner = "top-right", bg = "transparent", withTimer = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(frame * 0.18));
  const isRight = corner.endsWith("right");
  const elapsed = frame / fps;
  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");
  const cs = Math.floor((elapsed % 1) * 100).toString().padStart(2, "0");

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          top: 60,
          [isRight ? "right" : "left"]: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: HELV,
          fontWeight: 800,
          fontSize: 36,
          color: "#fff",
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
          letterSpacing: "0.08em",
        }}
      >
        <div
          style={{
            width: 26, height: 26,
            borderRadius: "50%",
            background: "#ff2d55",
            opacity: pulse,
            boxShadow: `0 0 ${pulse * 30}px #ff2d55`,
          }}
        />
        {label}
        {withTimer ? (
          <div style={{ fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.85)", fontSize: 30 }}>
            {mm.toString().padStart(2, "0")}:{ss}.{cs}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// 7. BATTERY LOW
export type BatteryLowProps = { percent?: number; label?: string; startFrame?: number; bg?: string; };
export const BatteryLow: React.FC<BatteryLowProps> = ({
  percent = 8, label = "Battery Low", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const blink = 0.55 + 0.45 * Math.abs(Math.sin(f * 0.22));

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          background: "rgba(20,20,22,0.92)",
          padding: "26px 38px",
          borderRadius: 24,
          display: "flex",
          alignItems: "center",
          gap: 26,
          fontFamily: HELV,
          color: "#fff",
          transform: `scale(${enter})`,
          opacity: enter,
          boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: 120, height: 56,
            border: "5px solid #fff",
            borderRadius: 10,
            position: "relative",
            display: "flex",
            alignItems: "center",
            padding: 4,
          }}
        >
          <div
            style={{
              width: `${Math.max(8, percent)}%`,
              height: "100%",
              background: "#ff2d55",
              borderRadius: 4,
              opacity: blink,
              boxShadow: `0 0 ${blink * 16}px #ff2d55`,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -14, top: "50%",
              transform: "translateY(-50%)",
              width: 12, height: 24,
              background: "#fff",
              borderRadius: 3,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>{label}</div>
          <div
            style={{
              fontSize: 26,
              color: "rgba(255,255,255,0.65)",
              marginTop: 4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {percent}% remaining
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
