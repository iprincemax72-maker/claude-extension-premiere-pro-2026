// remotion-logos v2 — channel-logo / brand-intro stingers with multi-act motion.

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

// 1. LOGO SLAM — drop shadow lands AFTER the logo (real weight)
export type LogoSlamProps = {
  glyph: string;
  brand: string;
  accent?: string;
  startFrame?: number;
  bg?: string;
  size?: number;
};
export const LogoSlam: React.FC<LogoSlamProps> = ({
  glyph = "C", brand = "BRAND", accent = "#d97757",
  startFrame = 0, bg = "#0a0a0a", size = 360,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const slam = spring({ frame: f, fps, config: motion.slam });
  const scale = interpolate(slam, [0, 1], [2.6, 1]);
  const shake = Math.sin(f * 0.9) * Math.max(0, 1 - (f - 10) / 22) * 10;
  // Shadow LAGS the logo by 4 frames — appears under it after impact
  const shadowOp = interpolate(f - 14, [0, 8, 40], [0, 0.7, 0.4], clamp);
  const brandOp = interpolate(f, [16, 30], [0, 1], clamp);
  const brandY = interpolate(f, [16, 30], [30, 0], clamp);
  // Idle pulse after settle
  const idlePulse = f > 30 ? 1 + Math.sin(f * 0.06) * 0.02 : 1;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
      <div style={{ position: "relative" }}>
        {/* Cast shadow under logo */}
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: "50%",
            transform: `translateX(-50%) scaleX(${shadowOp * 1.1})`,
            width: size * 0.9,
            height: 30,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, rgba(0,0,0,${shadowOp}) 0%, transparent 70%)`,
            filter: "blur(8px)",
          }}
        />
        <div
          style={{
            width: size, height: size,
            borderRadius: size * 0.16,
            background: `linear-gradient(135deg, ${shade(accent, 18)} 0%, ${accent} 55%, ${shade(accent, -25)} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: size * 0.55,
            letterSpacing: "-0.04em",
            transform: `translateX(${shake}px) scale(${scale * idlePulse})`,
            opacity: slam,
            boxShadow: `0 30px 80px ${accent}55, inset 0 -8px 0 rgba(0,0,0,0.12), inset 0 4px 0 rgba(255,255,255,0.25)`,
            textShadow: "0 6px 0 rgba(0,0,0,0.3)",
          }}
        >
          {glyph}
        </div>
      </div>
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 900,
          fontSize: 96,
          letterSpacing: "-0.04em",
          color: "#fff",
          textTransform: "uppercase",
          opacity: brandOp,
          transform: `translateY(${brandY}px)`,
          textShadow: "0 6px 0 rgba(0,0,0,0.3)",
        }}
      >
        {brand}
      </div>
    </AbsoluteFill>
  );
};

// 2. LOGO MORPH — circle → rounded square with rotation
export type LogoMorphProps = {
  glyph: string;
  accent?: string;
  startFrame?: number;
  morphFrame?: number;
  bg?: string;
  size?: number;
};
export const LogoMorph: React.FC<LogoMorphProps> = ({
  glyph = "C", accent = "#d97757", startFrame = 0,
  morphFrame = 22, bg = "#0a0a0a", size = 380,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.pop });
  const morph = interpolate(f, [4, morphFrame], [50, 22], clamp);
  const rot = interpolate(f, [4, morphFrame], [-30, 0], clamp);
  // Idle breath after morph
  const breath = f > morphFrame + 4 ? 1 + Math.sin(f * 0.05) * 0.02 : 1;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: size, height: size,
          borderRadius: `${morph}%`,
          background: `linear-gradient(135deg, ${shade(accent, 18)} 0%, ${accent} 60%, ${shade(accent, -25)} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          fontFamily: HELV,
          fontWeight: 900,
          fontSize: size * 0.5,
          letterSpacing: "-0.04em",
          transform: `scale(${enter * breath}) rotate(${rot}deg)`,
          opacity: enter,
          boxShadow: `0 30px 70px ${accent}55, inset 0 4px 0 rgba(255,255,255,0.25)`,
          textShadow: "0 6px 0 rgba(0,0,0,0.3)",
        }}
      >
        {glyph}
      </div>
    </AbsoluteFill>
  );
};

// 3. LOGO RING — accent ring rotates around logo
export type LogoRingProps = {
  glyph: string;
  accent?: string;
  startFrame?: number;
  bg?: string;
  size?: number;
};
export const LogoRing: React.FC<LogoRingProps> = ({
  glyph = "C", accent = "#d97757", startFrame = 0, bg = "#0a0a0a", size = 420,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const ringRot = f * 1.2;
  const ringSize = size * 1.35;
  // Inner logo has its own breath synced to ring rotation period
  const breath = 1 + Math.sin(f * 0.08) * 0.025;

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: ringSize, height: ringSize,
          transform: `scale(${enter})`,
          opacity: enter,
        }}
      >
        {/* Outer rotating dashed ring */}
        <div
          style={{
            position: "absolute", inset: 0,
            borderRadius: "50%",
            border: `8px dashed ${accent}`,
            transform: `rotate(${ringRot}deg)`,
            boxShadow: `0 0 40px ${accent}66`,
          }}
        />
        {/* Inner solid ring (counter-rotating, subtle) */}
        <div
          style={{
            position: "absolute",
            inset: "6%",
            borderRadius: "50%",
            border: `2px solid ${accent}33`,
            transform: `rotate(${-ringRot * 0.5}deg)`,
          }}
        />
        {/* Logo center */}
        <div
          style={{
            position: "absolute",
            inset: "16%",
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${shade(accent, 18)} 0%, ${accent} 60%, ${shade(accent, -25)} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: size * 0.4,
            letterSpacing: "-0.04em",
            boxShadow: `inset 0 4px 0 rgba(255,255,255,0.25), 0 0 60px ${accent}77`,
            textShadow: "0 6px 0 rgba(0,0,0,0.3)",
            transform: `scale(${breath})`,
          }}
        >
          {glyph}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 4. LOGO PULSE — breathing scale + glow, idle-friendly
export type LogoPulseProps = {
  glyph: string;
  brand?: string;
  accent?: string;
  startFrame?: number;
  bg?: string;
  size?: number;
};
export const LogoPulse: React.FC<LogoPulseProps> = ({
  glyph = "C", brand = "BRAND", accent = "#d97757",
  startFrame = 0, bg = "#0a0a0a", size = 340,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });
  const breath = 1 + Math.sin(f * 0.06) * 0.04;
  const glow = 0.6 + 0.4 * (Math.sin(f * 0.06) * 0.5 + 0.5);
  // Halo ring expands periodically (every 90 frames)
  const haloT = (f % 90) / 90;
  const haloScale = interpolate(haloT, [0, 1], [1, 1.6]);
  const haloOp = interpolate(haloT, [0, 0.15, 1], [0, 0.45, 0]);

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Halo */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: size * 0.18,
            border: `4px solid ${accent}`,
            transform: `scale(${haloScale})`,
            opacity: haloOp,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            width: size, height: size,
            borderRadius: size * 0.18,
            background: `linear-gradient(135deg, ${shade(accent, 18)} 0%, ${accent} 60%, ${shade(accent, -25)} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: size * 0.55,
            letterSpacing: "-0.04em",
            transform: `scale(${enter * breath})`,
            opacity: enter,
            boxShadow: `0 0 ${glow * 80}px ${accent}99, inset 0 4px 0 rgba(255,255,255,0.25)`,
            textShadow: "0 6px 0 rgba(0,0,0,0.3)",
          }}
        >
          {glyph}
        </div>
      </div>
      {brand ? (
        <div
          style={{
            fontFamily: HELV,
            fontWeight: 700,
            fontSize: 56,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: interpolate(f, [16, 30], [0, 1], clamp),
          }}
        >
          {brand}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
