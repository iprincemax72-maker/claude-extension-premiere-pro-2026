// Four stinger / brand-moment components. Designed for intro/outro
// moments where you want a beat of impact.

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

// ─────────────────────────────────────────────────────────────────────────
// 1. BRAND REVEAL
// Big logotype text scales in with a mask-wipe reveal from the center.
// Accent line draws beneath after the logo lands.
// ─────────────────────────────────────────────────────────────────────────

export type BrandRevealProps = {
  brand: string;
  tagline?: string;
  accent?: string;
  bg?: string;
};

export const BrandReveal: React.FC<BrandRevealProps> = ({
  brand,
  tagline = "",
  accent = "#10b981",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 13, stiffness: 130 } });
  const wipeP = interpolate(pop, [0, 1], [0, 100], clamp);
  // Mask the brand text with a horizontal wipe expanding from center.
  // CSS mask: black areas are VISIBLE, transparent areas are HIDDEN. So we
  // grow a BLACK gap in the middle from 0%-wide to 100%-wide.
  const mask = `linear-gradient(to right, transparent 0%, transparent ${50 - wipeP / 2}%, black ${50 - wipeP / 2}%, black ${50 + wipeP / 2}%, transparent ${50 + wipeP / 2}%, transparent 100%)`;
  const scale = interpolate(pop, [0, 1], [0.95, 1], clamp);
  const lineDraw = spring({ frame: frame - 18, fps, config: { damping: 18, stiffness: 100 } });
  const lineScale = interpolate(lineDraw, [0, 1], [0, 1], clamp);
  const taglineOp = interpolate(frame, [28, 40], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "#ffffff",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: 200,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            transform: `scale(${scale})`,
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskComposite: "source-in",
          }}
        >
          {brand}
        </div>
        <div style={{ width: 380, height: 4, background: accent, margin: "20px auto 0", transform: `scaleX(${lineScale})`, transformOrigin: "center" }} />
        {tagline && (
          <div
            style={{
              color: "#ffffff",
              opacity: 0.65 * taglineOp,
              fontFamily: HELV,
              fontWeight: 400,
              fontSize: 30,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginTop: 22,
            }}
          >
            {tagline}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. END CARD
// YouTube-style outro: "LIKE · SUBSCRIBE" with bouncing icons. Animated in
// from below with springy pops.
// ─────────────────────────────────────────────────────────────────────────

export type EndCardProps = {
  primary?: string;
  secondary?: string;
  accent?: string;
  bg?: string;
};

export const EndCard: React.FC<EndCardProps> = ({
  primary = "THANKS FOR WATCHING",
  secondary = "Like · Subscribe · See you next time",
  accent = "#ef4444",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = spring({ frame, fps, config: { damping: 13, stiffness: 130 } });
  const subSp = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 140 } });
  const tlY = interpolate(tl, [0, 1], [80, 0], clamp);
  const tlOp = interpolate(frame, [0, 6], [0, 1], clamp);
  const subY = interpolate(subSp, [0, 1], [60, 0], clamp);
  const subOp = interpolate(frame, [10, 18], [0, 1], clamp);
  // Heart icon pulses
  const pulse = 1 + Math.sin(frame * 0.3) * 0.06;

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "#fff",
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: 110,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            transform: `translateY(${tlY}px)`,
            opacity: tlOp,
            lineHeight: 1.05,
          }}
        >
          {primary}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginTop: 32,
            transform: `translateY(${subY}px)`,
            opacity: subOp,
          }}
        >
          <svg width={56} height={56} viewBox="0 0 24 24" style={{ transform: `scale(${pulse})` }}>
            <path
              d="M12 21s-7-4.5-9.5-9.5C0.5 7 4 3 8 3c2 0 3 1 4 2 1-1 2-2 4-2 4 0 7.5 4 5.5 8.5C19 16.5 12 21 12 21z"
              fill={accent}
            />
          </svg>
          <div
            style={{
              color: "#fff",
              fontFamily: HELV,
              fontWeight: 500,
              fontSize: 36,
              letterSpacing: "0.04em",
              opacity: 0.9,
            }}
          >
            {secondary}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. CHAPTER BUMPER
// "PART 02" cinematic title — small number above, big chapter name below
// with a horizontal divider line that draws in.
// ─────────────────────────────────────────────────────────────────────────

export type ChapterBumperProps = {
  number: string; // e.g. "01", "TWO", "III"
  title: string;
  numLabel?: string; // e.g. "PART", "CHAPTER"
  accent?: string;
  textColor?: string;
  bg?: string;
};

export const ChapterBumper: React.FC<ChapterBumperProps> = ({
  number,
  title,
  numLabel = "PART",
  accent = "#10b981",
  textColor = "#ffffff",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const lineScale = interpolate(draw, [0, 1], [0, 1], clamp);
  const numOp = interpolate(frame, [0, 10], [0, 1], clamp);
  const titleSp = spring({ frame: frame - 14, fps, config: { damping: 14, stiffness: 140 } });
  const titleY = interpolate(titleSp, [0, 1], [40, 0], clamp);
  const titleOp = interpolate(frame, [14, 22], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: accent,
            fontFamily: HELV,
            fontWeight: 600,
            fontSize: 30,
            letterSpacing: "0.4em",
            opacity: numOp,
          }}
        >
          {numLabel} {number}
        </div>
        <div style={{ width: 300, height: 2, background: accent, margin: "24px auto", transform: `scaleX(${lineScale})`, transformOrigin: "center" }} />
        <div
          style={{
            color: textColor,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 180,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            transform: `translateY(${titleY}px)`,
            opacity: titleOp,
            marginTop: 20,
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. SPONSOR PLATE
// "BROUGHT TO YOU BY" + a brand name. Card scales in with subtle bounce.
// ─────────────────────────────────────────────────────────────────────────

export type SponsorPlateProps = {
  sponsor: string;
  prefix?: string;
  cardColor?: string;
  accent?: string;
  textColor?: string;
  bg?: string;
};

export const SponsorPlate: React.FC<SponsorPlateProps> = ({
  sponsor,
  prefix = "BROUGHT TO YOU BY",
  cardColor = "#ffffff",
  accent = "#0a0a0a",
  textColor = "#0a0a0a",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame, fps, config: { damping: 11, stiffness: 180 } });
  const scale = interpolate(card, [0, 1], [0.7, 1], clamp);
  const op = interpolate(frame, [0, 6], [0, 1], clamp);
  const sponsorOp = interpolate(frame, [12, 22], [0, 1], clamp);
  const sponsorY = interpolate(frame, [12, 22], [12, 0], clamp);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          background: cardColor,
          padding: "44px 80px",
          borderRadius: 14,
          textAlign: "center",
          transform: `scale(${scale})`,
          opacity: op,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            color: accent,
            fontFamily: HELV,
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: "0.35em",
            opacity: 0.55,
          }}
        >
          {prefix}
        </div>
        <div
          style={{
            color: textColor,
            fontFamily: HELV,
            fontWeight: 900,
            fontSize: 110,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            lineHeight: 1,
            marginTop: 14,
            transform: `translateY(${sponsorY}px)`,
            opacity: sponsorOp,
          }}
        >
          {sponsor}
        </div>
      </div>
    </AbsoluteFill>
  );
};
