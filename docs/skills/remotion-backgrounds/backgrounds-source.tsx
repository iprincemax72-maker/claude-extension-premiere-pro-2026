// Four animated background presets. Each fills the frame as an
// AbsoluteFill — drop behind other content as a base layer.

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ─────────────────────────────────────────────────────────────────────────
// 1. ANIMATED GRADIENT
// Slow mesh-gradient drift between two radial blobs. Works for hero shots,
// brand intros, podcast covers.
// ─────────────────────────────────────────────────────────────────────────

export type AnimatedGradientProps = {
  colorA?: string;
  colorB?: string;
  colorC?: string;
  speed?: number; // 1 = slow, 3 = fast
};

export const AnimatedGradient: React.FC<AnimatedGradientProps> = ({
  colorA = "#ec4899",
  colorB = "#8b5cf6",
  colorC = "#0a0a0a",
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const t = (frame / 60) * speed;
  // Two drifting blobs
  const ax = 50 + Math.sin(t) * 25;
  const ay = 50 + Math.cos(t * 1.3) * 22;
  const bx = 50 + Math.cos(t * 0.8) * 28;
  const by = 50 + Math.sin(t * 1.1) * 20;

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(60% 80% at ${ax}% ${ay}%, ${colorA} 0%, transparent 60%),
          radial-gradient(70% 70% at ${bx}% ${by}%, ${colorB} 0%, transparent 65%),
          ${colorC}
        `,
      }}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2. PARTICLE FIELD
// Slow-drifting dots with parallax depth. Pre-computed positions; only
// y position animates.
// ─────────────────────────────────────────────────────────────────────────

export type ParticleFieldProps = {
  count?: number;
  color?: string;
  bg?: string;
};

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 80,
  color = "#ffffff",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  // Deterministic seed-based positions
  const dots: { x: number; y0: number; size: number; speed: number; opacity: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r1 = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r2 = (Math.sin(i * 78.233) * 43758.5453) % 1;
    const r3 = (Math.sin(i * 39.346) * 43758.5453) % 1;
    const r4 = (Math.sin(i * 95.123) * 43758.5453) % 1;
    const size = 2 + Math.abs(r3) * 8;
    const speed = 0.2 + Math.abs(r2) * 1.4;
    dots.push({
      x: Math.abs(r1) * 100,
      y0: Math.abs(r2) * 100,
      size,
      speed,
      // smaller particles dimmer (depth illusion)
      opacity: 0.2 + (size / 10) * 0.6 + Math.abs(r4) * 0.2,
    });
  }

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {dots.map((d, i) => {
        const y = ((d.y0 - frame * d.speed * 0.1) % 110 + 110) % 110 - 5;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${d.x}%`,
              top: `${y}%`,
              width: d.size,
              height: d.size,
              borderRadius: "50%",
              background: color,
              opacity: d.opacity,
              filter: d.size > 6 ? "blur(1px)" : "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 3. NOISE GRAIN
// Procedural noise / TV static via repeated radial dots. Useful for retro,
// VHS, "vintage film" looks. Layer at low opacity over other content.
// ─────────────────────────────────────────────────────────────────────────

export type NoiseGrainProps = {
  bg?: string;
  intensity?: number; // 0..1
  monochrome?: boolean;
};

export const NoiseGrain: React.FC<NoiseGrainProps> = ({
  bg = "#0a0a0a",
  intensity = 0.4,
  monochrome = true,
}) => {
  const frame = useCurrentFrame();
  const SEED = frame * 7919; // changes every frame for fizz
  const grid = 90; // dots per side
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const k = i * grid + j + SEED;
      const r = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
      if (r > 1 - intensity * 0.05) {
        const shade = monochrome
          ? 255
          : Math.floor(((k * 17) % 255));
        const a = 0.25 + r * 0.5;
        dots.push(
          <div
            key={k}
            style={{
              position: "absolute",
              left: `${(j / grid) * 100}%`,
              top: `${(i / grid) * 100}%`,
              width: 6,
              height: 6,
              background: monochrome
                ? `rgba(255,255,255,${a})`
                : `rgba(${shade},${shade},${shade},${a})`,
            }}
          />,
        );
      }
    }
  }
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {dots}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 4. WAVY LINES
// Parallax SVG wave lines. Calm, branded backdrop.
// ─────────────────────────────────────────────────────────────────────────

export type WavyLinesProps = {
  color?: string;
  bg?: string;
  lines?: number;
};

export const WavyLines: React.FC<WavyLinesProps> = ({
  color = "#10b981",
  bg = "#0a0a0a",
  lines = 7,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < lines; i++) {
    const phase = (i / lines) * Math.PI * 2 + frame * 0.04;
    const yBase = (i / (lines - 1)) * 100;
    const pts: string[] = [];
    const STEPS = 36;
    for (let s = 0; s <= STEPS; s++) {
      const x = (s / STEPS) * 100;
      const y = yBase + Math.sin(phase + s * 0.4) * 4;
      pts.push(`${x},${y}`);
    }
    const opacity = 0.15 + (i / lines) * 0.45;
    paths.push(
      <polyline
        key={i}
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={0.4}
        opacity={opacity}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <AbsoluteFill style={{ background: bg }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        {paths}
      </svg>
    </AbsoluteFill>
  );
};
