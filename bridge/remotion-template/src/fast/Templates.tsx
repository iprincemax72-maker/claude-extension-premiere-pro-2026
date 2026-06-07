import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

// One font, several weights — clean & professional, and it's already cached in
// this project so the first fast render doesn't pay a download.
const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

// ── Flimify brand palette (copper / warm) ──────────────────────────────
export const BRAND = {
  ink: "#f8f4f0",
  muted: "rgba(248,244,240,0.60)",
  accent: "#dd8951",
  accentHi: "#f4b483",
  shadow: "0 10px 40px rgba(0,0,0,0.45)",
};

const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Shared entrance(0→1) / exit(1→0) envelope so every template feels consistent.
const useInOut = (inDur = 16, outDur = 14) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = interpolate(frame, [0, inDur], [0, 1], { ...clamp, easing: easeOut });
  const exit = interpolate(
    frame,
    [durationInFrames - outDur, durationInFrames - 1],
    [1, 0],
    { ...clamp, easing: Easing.in(Easing.cubic) },
  );
  return { frame, enter, exit, vis: Math.min(enter, exit) };
};

const base: React.CSSProperties = { fontFamily, color: BRAND.ink };

// ════════════════════════════════ 1. LOWER THIRD ══════════════════════
export type LowerThirdProps = {
  name: string;
  title: string;
  accent: string;
  side: "left" | "right";
};
export const lowerThirdDefaults: LowerThirdProps = {
  name: "Jordan Lee",
  title: "Creative Director",
  accent: BRAND.accent,
  side: "left",
};
export const LowerThird: React.FC<LowerThirdProps> = ({ name, title, accent, side }) => {
  const { fps } = useVideoConfig();
  const { frame, vis } = useInOut(18, 14);
  const bar = spring({ frame, fps, config: { damping: 14, mass: 0.5 } });
  const slide = interpolate(vis, [0, 1], [side === "left" ? -40 : 40, 0]);
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "flex-end", alignItems: side === "left" ? "flex-start" : "flex-end", padding: "0 96px 110px" }}>
      <div style={{ display: "flex", flexDirection: side === "left" ? "row" : "row-reverse", alignItems: "stretch", gap: 22, opacity: vis, transform: `translateX(${slide}px)` }}>
        <div style={{ width: 7, borderRadius: 4, background: accent, transform: `scaleY(${bar})`, transformOrigin: "bottom", boxShadow: `0 0 24px ${accent}88` }} />
        <div style={{ textAlign: side === "left" ? "left" : "right", paddingBottom: 4 }}>
          <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.02, textShadow: BRAND.shadow }}>{name}</div>
          <div style={{ fontSize: 30, fontWeight: 600, color: accent, marginTop: 8, letterSpacing: "0.01em" }}>{title}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════ 2. TITLE CARD ═══════════════════════
export type TitleCardProps = { title: string; subtitle: string; accent: string };
export const titleCardDefaults: TitleCardProps = {
  title: "Flimify",
  subtitle: "AI editing, inside Premiere",
  accent: BRAND.accent,
};
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle, accent }) => {
  const { fps } = useVideoConfig();
  const { frame, vis } = useInOut(20, 16);
  const pop = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const scale = interpolate(pop, [0, 1], [0.86, 1]);
  const line = interpolate(frame, [14, 34], [0, 1], { ...clamp, easing: easeOut });
  const sub = interpolate(frame, [22, 40], [0, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ opacity: vis, transform: `scale(${scale})` }}>
        <div style={{ fontSize: 132, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, textShadow: BRAND.shadow }}>{title}</div>
        <div style={{ height: 5, width: "62%", margin: "26px auto 0", borderRadius: 3, background: accent, transform: `scaleX(${line})`, boxShadow: `0 0 22px ${accent}99` }} />
        {subtitle ? (
          <div style={{ fontSize: 36, fontWeight: 500, color: BRAND.muted, marginTop: 24, opacity: sub, transform: `translateY(${(1 - sub) * 12}px)` }}>{subtitle}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════ 3. LIST ═════════════════════════════
export type ListProps = { heading: string; items: string[]; accent: string };
export const listDefaults: ListProps = {
  heading: "Today's plan",
  items: ["Set up the workstation", "Pull the wire run", "Lunch + coffee", "Test the panel"],
  accent: BRAND.accent,
};
// duration scales with item count: lead-in + stagger per item + hold + exit.
export const listDuration = (p: Partial<ListProps>, fps = 30) => {
  const n = (p.items && p.items.length) || 4;
  return Math.round((0.5 + n * 0.42 + 1.6) * fps);
};
export const ListTemplate: React.FC<ListProps> = ({ heading, items, accent }) => {
  const { frame, vis } = useInOut(16, 16);
  const head = interpolate(frame, [0, 16], [0, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", padding: "0 0 0 150px" }}>
      <div style={{ opacity: vis, maxWidth: 1100 }}>
        {heading ? (
          <div style={{ fontSize: 38, fontWeight: 700, color: accent, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 34, opacity: head, transform: `translateX(${(1 - head) * -20}px)` }}>{heading}</div>
        ) : null}
        {items.map((it, i) => {
          const t = interpolate(frame, [14 + i * 12, 30 + i * 12], [0, 1], { ...clamp, easing: easeOut });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 26, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: accent, flex: "0 0 auto", transform: `scale(${t})`, boxShadow: `0 0 16px ${accent}77` }} />
              <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.015em", textShadow: BRAND.shadow }}>{it}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════ 4. STAT CALLOUT ═════════════════════
export type StatProps = { value: string; label: string; context: string; accent: string };
export const statDefaults: StatProps = {
  value: "73%",
  label: "faster turnaround",
  context: "vs. editing by hand",
  accent: BRAND.accent,
};
export const StatCallout: React.FC<StatProps> = ({ value, label, context, accent }) => {
  const { fps } = useVideoConfig();
  const { frame, vis } = useInOut(18, 16);
  const pop = spring({ frame, fps, config: { damping: 13, mass: 0.6, stiffness: 180 } });
  const scale = interpolate(pop, [0, 1], [0.5, 1]);
  const lab = interpolate(frame, [16, 34], [0, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ opacity: vis }}>
        <div style={{ fontSize: 220, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9, color: accent, transform: `scale(${scale})`, textShadow: `0 14px 50px ${accent}55` }}>{value}</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 18, opacity: lab, transform: `translateY(${(1 - lab) * 14}px)` }}>{label}</div>
        {context ? (
          <div style={{ fontSize: 30, fontWeight: 500, color: BRAND.muted, marginTop: 12, opacity: lab }}>{context}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════ 5. SUBSCRIBE CTA ════════════════════
export type SubscribeProps = { label: string; handle: string; accent: string };
export const subscribeDefaults: SubscribeProps = {
  label: "Subscribe",
  handle: "@pianowithprince",
  accent: "#FF4D4D",
};
export const SubscribeCTA: React.FC<SubscribeProps> = ({ label, handle, accent }) => {
  const { fps } = useVideoConfig();
  const { frame, vis } = useInOut(16, 14);
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.5, stiffness: 200 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * 6);
  const hand = interpolate(frame, [18, 34], [0, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "flex-end", alignItems: "center", paddingBottom: 150 }}>
      <div style={{ opacity: vis, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ transform: `scale(${scale * pulse})`, background: accent, color: "#fff", fontSize: 50, fontWeight: 800, letterSpacing: "0.01em", padding: "22px 56px", borderRadius: 18, boxShadow: `0 16px 44px ${accent}66`, display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", fontSize: 26 }}>▶</span>
          {label}
        </div>
        {handle ? (
          <div style={{ fontSize: 34, fontWeight: 600, color: BRAND.ink, opacity: hand, transform: `translateY(${(1 - hand) * 10}px)`, textShadow: BRAND.shadow }}>{handle}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
