// remotion-frames v2 — decorative frame/reveal cards with multi-act motion.

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
const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif';
const HAND = '"Marker Felt", "Comic Sans MS", cursive';

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

// 1. TOAST POPUP — iOS slide-down + exit drift
export type ToastPopupProps = {
  title: string; body?: string; icon?: string;
  startFrame?: number; holdFrames?: number; bg?: string;
};
export const ToastPopup: React.FC<ToastPopupProps> = ({
  title = "Notification", body = "Tap to view", icon = "🔔",
  startFrame = 0, holdFrames = 90, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const exitStart = startFrame + holdFrames;
  const exit = interpolate(frame, [exitStart, exitStart + 14], [0, 1], clamp);
  const visible = Math.max(0, enter - exit);
  const y = interpolate(visible, [0, 1], [-160, 0]);
  // Icon pulses subtly while visible
  const iconPulse = 1 + Math.sin(f * 0.1) * 0.04;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute", top: 30, left: "50%",
          transform: `translate(-50%, ${y}px)`,
          opacity: visible,
          background: "rgba(28,28,30,0.93)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "18px 22px",
          borderRadius: 26,
          display: "flex",
          gap: 16,
          alignItems: "center",
          maxWidth: "85%",
          minWidth: "70%",
          fontFamily: SF,
          color: "#fff",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, #d97757, #ff7a4d)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, flexShrink: 0,
            transform: `scale(${iconPulse})`,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
          {body ? (
            <div
              style={{
                fontSize: 24, color: "rgba(255,255,255,0.78)",
                marginTop: 4, whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {body}
            </div>
          ) : null}
        </div>
        <div style={{ fontSize: 20, color: "rgba(255,255,255,0.5)" }}>now</div>
      </div>
    </AbsoluteFill>
  );
};

// 2. POLAROID FRAME — drop in with rotation + idle drift
export type PolaroidFrameProps = {
  content: string; caption?: string; tiltDeg?: number; startFrame?: number; bg?: string;
};

const isUrl = (s: string) => s.startsWith("/") || s.startsWith("http") || s.startsWith("file:");

export const PolaroidFrame: React.FC<PolaroidFrameProps> = ({
  content = "moment", caption = "good times", tiltDeg = -6, startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const fall = spring({ frame: f, fps, config: motion.slam });
  const y = interpolate(fall, [0, 1], [-400, 0]);
  const rot = interpolate(fall, [0, 1], [tiltDeg * 2, tiltDeg]);
  const wobble = Math.sin(f * 0.6) * Math.max(0, 1 - f / 22) * 3;
  // Idle drift after settle — like wind disturbing a hanging photo
  const idleDrift = f > 22 ? Math.sin(f * 0.04) * 0.6 : 0;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          background: "#fafafa",
          padding: "30px 30px 80px 30px",
          transform: `translateY(${y}px) rotate(${rot + wobble * 0.3 + idleDrift}deg)`,
          boxShadow: "0 32px 60px rgba(0,0,0,0.45), 0 4px 0 rgba(0,0,0,0.06) inset",
          opacity: fall,
        }}
      >
        <div
          style={{
            width: 540, height: 540,
            background: isUrl(content)
              ? `url(${content}) center/cover`
              : "linear-gradient(135deg, #fe2c55, #25f4ee)",
            display: isUrl(content) ? undefined : "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontFamily: SF,
            fontSize: 60, fontWeight: 800,
            textAlign: "center", padding: 30,
          }}
        >
          {!isUrl(content) ? content : null}
        </div>
        {caption ? (
          <div
            style={{
              fontFamily: HAND, fontSize: 38, color: "#2a2a2a",
              textAlign: "center", marginTop: 22,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// 3. PRICE REVEAL — 3D flip with depth
export type PriceRevealProps = {
  price: string; kicker?: string; unit?: string;
  startFrame?: number; color?: string; bg?: string;
};
export const PriceReveal: React.FC<PriceRevealProps> = ({
  price = "$29", kicker = "ONLY", unit = "/ month",
  startFrame = 0, color = "#ff2d55", bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const flip = spring({ frame: f, fps, config: motion.pop });
  const rotY = interpolate(flip, [0, 1], [110, 0]);
  const scale = interpolate(flip, [0, 1], [0.7, 1]);
  const kickerOp = interpolate(f, [12, 24], [0, 1], clamp);
  const unitOp = interpolate(f, [18, 30], [0, 1], clamp);
  // Idle pulse after flip
  const pulse = f > 30 ? 1 + Math.sin(f * 0.06) * 0.015 : 1;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        perspective: 1400,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${color}, ${shade(color, -25)})`,
          padding: "60px 110px",
          borderRadius: 26,
          fontFamily: SF,
          color: "#fff",
          textAlign: "center",
          transform: `rotateY(${rotY}deg) scale(${scale * pulse})`,
          opacity: flip,
          boxShadow: `0 30px 70px ${color}55, inset 0 -4px 0 rgba(0,0,0,0.1)`,
        }}
      >
        {kicker ? (
          <div
            style={{
              fontSize: 36, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", opacity: kickerOp,
            }}
          >
            {kicker}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 240, fontWeight: 900,
            letterSpacing: "-0.04em", lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            marginTop: kicker ? 14 : 0,
            textShadow: "0 12px 0 rgba(0,0,0,0.25)",
          }}
        >
          {price}
        </div>
        {unit ? (
          <div style={{ fontSize: 38, fontWeight: 600, opacity: unitOp, marginTop: 8 }}>
            {unit}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// 4. BOOKMARK FOLD — drop + pulse
export type BookmarkFoldProps = {
  label?: string;
  corner?: "top-right" | "top-left";
  color?: string;
  startFrame?: number;
  bg?: string;
};
export const BookmarkFold: React.FC<BookmarkFoldProps> = ({
  label = "NEW", corner = "top-right", color = "#ff2d55", startFrame = 0, bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const drop = spring({ frame: f, fps, config: motion.haptic });
  const yOffset = interpolate(drop, [0, 1], [-100, 0]);
  const isRight = corner.endsWith("right");
  // Pulse after drop
  const pulse = f > 18 ? 1 + Math.sin(f * 0.1) * 0.02 : 1;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          [isRight ? "right" : "left"]: 60,
          width: 130,
          transform: `translateY(${yOffset}px) scale(${pulse})`,
          opacity: drop,
        }}
      >
        <div
          style={{
            width: 130, height: 180,
            background: `linear-gradient(180deg, ${color} 0%, ${shade(color, -25)} 100%)`,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            paddingTop: 16,
            color: "#fff",
            fontFamily: SF,
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: "0.08em",
            boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
            textShadow: "0 2px 0 rgba(0,0,0,0.25)",
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 5. GIFT BOX REVEAL — shake → open → contents
export type GiftBoxRevealProps = {
  content: string; openFrame?: number; startFrame?: number;
  color?: string; ribbonColor?: string; bg?: string;
};
export const GiftBoxReveal: React.FC<GiftBoxRevealProps> = ({
  content = "🎉", openFrame = 36, startFrame = 0,
  color = "#ff2d55", ribbonColor = "#ffd60a", bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const pop = spring({ frame: f, fps, config: motion.pop });
  const isSealed = f < openFrame;
  const shake = isSealed ? Math.sin(f * 1.2) * Math.min(1, f / 16) * 8 : 0;
  const open = interpolate(f - openFrame, [0, 14], [0, 1], clamp);
  const lidY = interpolate(open, [0, 1], [0, -260]);
  const lidRot = interpolate(open, [0, 1], [0, -28]);
  const boxScale = 1 + interpolate(f - openFrame, [0, 5, 12], [0, 0.08, 0], clamp);
  const contentSpring = spring({ frame: f - openFrame - 4, fps, config: motion.slam });
  const contentY = interpolate(contentSpring, [0, 1], [80, 0]);

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: 460, height: 460,
          transform: `translateX(${shake}px) scale(${pop * boxScale})`,
          opacity: pop,
        }}
      >
        {/* Box body */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0,
            width: "100%", height: "70%",
            background: `linear-gradient(180deg, ${color} 0%, ${shade(color, -25)} 100%)`,
            borderRadius: "8px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
          }}
        />
        {/* Ribbon */}
        <div
          style={{
            position: "absolute", bottom: 0, left: "50%",
            width: 60, height: "100%",
            background: ribbonColor,
            transform: "translateX(-50%)",
            boxShadow: "0 0 0 4px rgba(0,0,0,0.06) inset",
          }}
        />
        {/* Contents */}
        {open > 0 ? (
          <div
            style={{
              position: "absolute", top: "10%", left: "50%",
              transform: `translate(-50%, ${contentY}px)`,
              fontSize: 240, lineHeight: 1,
              opacity: contentSpring,
              fontFamily: SF, fontWeight: 900,
              color: "#fff",
              textShadow: "0 8px 0 rgba(0,0,0,0.35)",
            }}
          >
            {content}
          </div>
        ) : null}
        {/* Lid */}
        <div
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "40%",
            background: `linear-gradient(180deg, ${shade(color, 15)} 0%, ${color} 100%)`,
            borderRadius: "8px",
            transform: `translateY(${lidY}px) rotate(${lidRot}deg)`,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
            zIndex: 2,
          }}
        />
        {/* Bow */}
        <div
          style={{
            position: "absolute", top: -30, left: "50%",
            width: 100, height: 100,
            background: ribbonColor,
            borderRadius: "50%",
            transform: `translateX(-50%) translateY(${lidY}px) rotate(${lidRot}deg)`,
            boxShadow: `inset 0 -4px 0 ${shade(ribbonColor, -25)}, 0 10px 26px rgba(0,0,0,0.3)`,
            zIndex: 3,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
