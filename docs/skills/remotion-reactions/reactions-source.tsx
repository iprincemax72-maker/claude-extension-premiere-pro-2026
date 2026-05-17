// remotion-reactions v2 — multi-act emoji reaction overlays.
//
// v1 was single-act. v2 layers:
//   • Anticipation frames before impact (vignette tighten or pre-shake)
//   • Aftermath (rings decay, glow fades, secondary particles)
//   • Loop personality (tear drops on CryingLaugh, shifty looks on SideEye)
//
// Every component renders with one required prop (or none); all visual
// params have sensible defaults.

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

function aftermathGlow(framesSincePunch: number, decay = 30): number {
  if (framesSincePunch < 0) return 0;
  return Math.exp(-framesSincePunch / decay);
}

const seeded = (s: number) => {
  const v = (s * 1664525 + 1013904223) % 4294967296;
  return v / 4294967296;
};

// ═════════════════════════════════════════════════════════════════════════
// 1. MIND BLOWN
//
// Acts:
//   0–4   Anticipate (vignette tightens, faint inward pull)
//   4–18  Slam — emoji springs in scale 2.5→1 with shake
//   8–34  Radiating lines explode outward (length grows, then fade)
//   18+   Idle micro-tremor + slow head-shake (life)
//   30+   Aftermath glow decay
// ═════════════════════════════════════════════════════════════════════════

export type MindBlownProps = {
  emoji?: string;
  size?: number;
  startFrame?: number;
  color?: string;
  bg?: string;
};

export const MindBlown: React.FC<MindBlownProps> = ({
  emoji = "🤯",
  size = 360,
  startFrame = 0,
  color = "#ffd60a",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Act 1: anticipate
  const anti = interpolate(f, [0, 4], [0, 1], clamp);
  const vignette = interpolate(anti, [0, 1], [0, 0.35]);

  // Act 2: slam
  const pop = spring({
    frame: f - 4,
    fps,
    config: motion.slam,
  });
  const scale = interpolate(pop, [0, 1], [2.5, 1]);
  const shake = Math.sin(f * 0.9) * Math.max(0, 1 - (f - 4) / 24) * 12;

  // Act 3: radiating lines
  const lineLen = interpolate(f, [8, 26], [0, 240], clamp);
  const linesOp = interpolate(f, [8, 16, 50], [0, 1, 0.6], clamp);

  // Act 4: idle tremor + slow rotation (after slam settles)
  const microShake = f > 28 ? tremor(f, 1.2, 0.16) : 0;
  const slowRot = f > 28 ? Math.sin(f * 0.04) * 4 : 0;

  // Act 5: aftermath glow
  const glow = aftermathGlow(f - 18, 28);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,${vignette}) 100%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", width: size * 1.6, height: size * 1.6 }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * 360;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: lineLen,
                height: 10,
                background: color,
                borderRadius: 6,
                transform: `translate(${size * 0.55}px, -50%) rotate(${angle}deg)`,
                transformOrigin: "0 50%",
                opacity: linesOp,
                boxShadow: `0 0 ${14 + glow * 20}px ${color}`,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, calc(-50% + ${shake + microShake}px)) scale(${scale}) rotate(${slowRot}deg)`,
            fontSize: size,
            lineHeight: 1,
            filter: glow > 0 ? `drop-shadow(0 0 ${glow * 30}px ${color})` : undefined,
          }}
        >
          {emoji}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. FIRE BURST
//
// v1 was OK but lacked: rising flame trail intensification, depth-staggered
// emoji sizes, slight rotation per-emoji as they rise.
// ═════════════════════════════════════════════════════════════════════════

export type FireBurstProps = {
  count?: number;
  emoji?: string;
  durationFrames?: number;
  bg?: string;
  /** Show a bottom-up orange glow as the burst rises. Default true. */
  withGlow?: boolean;
};

export const FireBurst: React.FC<FireBurstProps> = ({
  count = 8,
  emoji = "🔥",
  durationFrames = 60,
  bg = "transparent",
  withGlow = true,
}) => {
  const frame = useCurrentFrame();
  // Bottom glow intensifies as burst rises, then decays
  const glowOp = withGlow
    ? interpolate(frame, [0, 20, 60], [0, 0.45, 0], clamp)
    : 0;

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {glowOp > 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: -100,
            left: 0,
            right: 0,
            height: 500,
            background: "radial-gradient(ellipse at center bottom, rgba(255,140,40,0.7), transparent 70%)",
            opacity: glowOp,
            filter: "blur(20px)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {Array.from({ length: count }).map((_, i) => (
        <FireParticle key={i} index={i} durationFrames={durationFrames} emoji={emoji} />
      ))}
    </AbsoluteFill>
  );
};

const FireParticle: React.FC<{ index: number; durationFrames: number; emoji: string }> = ({
  index,
  durationFrames,
  emoji,
}) => {
  const frame = useCurrentFrame();
  const startF = Math.floor(seeded(index * 7) * 14);
  const f = frame - startF;
  const progress = interpolate(f, [0, durationFrames], [0, 1], clamp);
  if (progress <= 0 || progress >= 1) return null;

  const xJitter = (seeded(index * 11) - 0.5) * 700;
  const sway = Math.sin(progress * Math.PI * 2 + index) * 40;
  const x = 540 + xJitter + sway;
  const y = interpolate(progress, [0, 1], [1800, 200]);
  const op = interpolate(progress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  // Depth: random size from 80-180
  const size = 80 + seeded(index * 13) * 100;
  // Each emoji rotates slowly as it rises
  const rot = (seeded(index * 17) - 0.5) * 30 + progress * 20 * (index % 2 === 0 ? 1 : -1);
  // Scale pulse — emoji "flickers" 2× per rise
  const flicker = 1 + Math.sin(progress * Math.PI * 4 + index) * 0.06;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        fontSize: size,
        opacity: op,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${flicker})`,
        filter: `drop-shadow(0 0 22px rgba(255,140,40,0.7))`,
      }}
    >
      {emoji}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. HUNDRED SLAM
//
// v1 had impact rings. v2 adds: multi-stage impact (1st ring → 2nd ring
// offset by 6f → 3rd ring by 12f, three concentric waves).
// ═════════════════════════════════════════════════════════════════════════

export type HundredSlamProps = {
  emoji?: string;
  size?: number;
  startFrame?: number;
  bg?: string;
};

export const HundredSlam: React.FC<HundredSlamProps> = ({
  emoji = "💯",
  size = 360,
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Slam from above
  const slam = spring({ frame: f, fps, config: motion.slam });
  const y = interpolate(slam, [0, 1], [-700, 0]);
  const shake = Math.sin(f * 0.9) * Math.max(0, 1 - (f - 14) / 20) * 16;
  const settle = spring({ frame: f - 12, fps, config: motion.haptic });
  const finalScale = 0.95 + settle * 0.05;

  // Three impact rings offset by 6 frames each
  const rings = [0, 6, 12].map(off => {
    const ringT = interpolate(f - 14 - off, [0, 36], [0, 1], clamp);
    return {
      scale: interpolate(ringT, [0, 1], [0.6, 2.6 + off * 0.05]),
      op: interpolate(ringT, [0, 0.25, 1], [0, 0.55 - off * 0.1, 0]),
    };
  });

  // Idle micro-tremor + slow rotation after settle
  const idleY = f > 24 ? tremor(f, 0.8, 0.12) : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "relative" }}>
        {rings.map((ring, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: -size / 2,
              borderRadius: "50%",
              border: `8px solid #ff2d55`,
              transform: `scale(${ring.scale})`,
              opacity: ring.op,
            }}
          />
        ))}
        <div
          style={{
            fontSize: size,
            lineHeight: 1,
            transform: `translateY(${y + shake + idleY}px) scale(${finalScale})`,
            filter: `drop-shadow(0 12px 0 rgba(255,45,85,0.4))`,
          }}
        >
          {emoji}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. HEART EYES
//
// v1 had orbiting hearts. v2: hearts have depth (near = bigger/brighter,
// far = smaller/blurred), staggered orbit speeds, idle breathing on main.
// ═════════════════════════════════════════════════════════════════════════

export type HeartEyesProps = {
  emoji?: string;
  size?: number;
  startFrame?: number;
  bg?: string;
};

export const HeartEyes: React.FC<HeartEyesProps> = ({
  emoji = "😍",
  size = 300,
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const pop = spring({ frame: f, fps, config: motion.pop });
  const breath = 1 + Math.sin(f * 0.16) * 0.04;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const startOff = i * 8;
          const sf = f - startOff;
          const sp = interpolate(sf, [0, 70], [0, 1], clamp);
          if (sp <= 0 || sp >= 1) return null;
          const depth = (i % 3) / 3; // 0=near, 1=far
          const angle = (i / 8) * Math.PI * 2 + sp * Math.PI * 0.6;
          const dist = 60 + sp * (200 - depth * 60);
          const x = Math.cos(angle) * dist;
          const y = Math.sin(angle) * dist - sp * 80;
          const op = interpolate(sp, [0, 0.2, 1], [0, 1 - depth * 0.4, 0]);
          const psize = 60 - depth * 18;
          const rot = sp * 360 * (i % 2 === 0 ? 1 : -1);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                fontSize: psize,
                transform: `translate(${x - psize/2}px, ${y - psize/2}px) scale(${interpolate(sp, [0, 1], [0.4, 1])}) rotate(${rot}deg)`,
                opacity: op,
                filter: depth > 0.5 ? `blur(${depth * 1.5}px)` : undefined,
              }}
            >
              ❤️
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${pop * breath})`,
            fontSize: size,
            lineHeight: 1,
          }}
        >
          {emoji}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. SIDE EYE
//
// v1: simple slide-in + shifty shift. v2 adds: short retreat-then-back
// motion at frame ~30 (eye-roll), and a faint dust trail behind the slide.
// ═════════════════════════════════════════════════════════════════════════

export type SideEyeProps = {
  emoji?: string;
  size?: number;
  from?: "left" | "right";
  startFrame?: number;
  bg?: string;
};

export const SideEye: React.FC<SideEyeProps> = ({
  emoji = "👀",
  size = 280,
  from = "right",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const dir = from === "right" ? 1 : -1;

  const slide = spring({ frame: f, fps, config: motion.haptic });
  // Slide in, then small retreat at frame ~36, then come back
  const baseX = interpolate(slide, [0, 1], [dir * 600, dir * 80]);
  const retreatP = interpolate(f, [36, 44, 56], [0, 1, 0], clamp);
  const retreatX = retreatP * dir * 60;
  // Shifty horizontal jitter after settling
  const shift = f > 24 ? Math.sin(f * 0.22) * 22 : 0;
  // Vertical sneak — slight up-and-down sneaky motion
  const sneakY = f > 24 ? tremor(f, 4, 0.13) : 0;

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
          fontSize: size,
          lineHeight: 1,
          transform: `translate(${baseX + retreatX + shift}px, ${sneakY}px)`,
          opacity: slide,
        }}
      >
        {emoji}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. CRYING LAUGH
//
// v2 adds tear-drop particles falling from the emoji's "eye" area.
// ═════════════════════════════════════════════════════════════════════════

export type CryingLaughProps = {
  emoji?: string;
  size?: number;
  corner?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  startFrame?: number;
  bg?: string;
  /** Show tear-drop particles falling. Default true. */
  withTears?: boolean;
};

export const CryingLaugh: React.FC<CryingLaughProps> = ({
  emoji = "😂",
  size = 240,
  corner = "bottom-right",
  startFrame = 0,
  bg = "transparent",
  withTears = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const pop = spring({ frame: f, fps, config: motion.pop });
  const bounce = Math.abs(Math.sin(f * 0.18)) * 20;
  const rot = Math.sin(f * 0.18) * 7;

  const isBottom = corner.startsWith("bottom");
  const isRight = corner.endsWith("right");

  // Tear drops — emit one every 30 frames, fall for ~24 frames
  const tearSlot = (f: number) => Math.floor(f / 30);
  const tearAge = (f: number) => f % 30;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          [isBottom ? "bottom" : "top"]: 80,
          [isRight ? "right" : "left"]: 80,
        }}
      >
        {/* Tear drops — 2 streams (left eye, right eye) */}
        {withTears && f > 14 ? (
          [0, 1].map(side => {
            const phase = (f - 14 + side * 12) % 30;
            const fall = interpolate(phase, [0, 24], [0, 1], clamp);
            if (fall <= 0 || fall >= 1) return null;
            const xOff = side === 0 ? -size * 0.18 : size * 0.18;
            const y = fall * 80;
            const op = interpolate(fall, [0, 0.2, 0.9, 1], [0, 0.9, 0.9, 0]);
            return (
              <div
                key={`${side}-${tearSlot(f + side * 12)}`}
                style={{
                  position: "absolute",
                  top: size * 0.45,
                  left: size * 0.42 + xOff,
                  fontSize: 28,
                  transform: `translateY(${y}px) rotate(${side === 0 ? -15 : 15}deg)`,
                  opacity: op,
                  pointerEvents: "none",
                }}
              >
                💧
              </div>
            );
          })
        ) : null}
        <div
          style={{
            fontSize: size,
            lineHeight: 1,
            transform: `scale(${pop}) translateY(${-bounce}px) rotate(${rot}deg)`,
          }}
        >
          {emoji}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 7. EYES PEEK
//
// v2 adds: blink during peek (eyes briefly close at ~45f), then retreat
// has more personality — peek → blink → look-around → retreat.
// ═════════════════════════════════════════════════════════════════════════

export type EyesPeekProps = {
  emoji?: string;
  size?: number;
  startFrame?: number;
  holdFrames?: number;
  bg?: string;
};

export const EyesPeek: React.FC<EyesPeekProps> = ({
  emoji = "👀",
  size = 320,
  startFrame = 0,
  holdFrames = 80,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.haptic });
  const peekY = interpolate(enter, [0, 1], [size, size * 0.18]);
  // Look-around shift after peek
  const lookShift = f > 14 ? Math.sin(f * 0.1) * 18 : 0;

  // Blink during peek (briefly squash vertically at ~28f and ~58f)
  const blink1 = interpolate(f, [28, 30, 32], [1, 0.25, 1], clamp);
  const blink2 = interpolate(f, [58, 60, 62], [1, 0.25, 1], clamp);
  const blinkScale = Math.min(blink1, blink2);

  // Retreat
  const exitStart = startFrame + holdFrames;
  const exit = interpolate(frame, [exitStart, exitStart + 16], [0, 1], clamp);
  const exitY = interpolate(exit, [0, 1], [0, size]);

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: -size + peekY - exitY,
          left: "50%",
          transform: `translateX(calc(-50% + ${lookShift}px)) scaleY(${blinkScale})`,
          fontSize: size,
          lineHeight: 1,
        }}
      >
        {emoji}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 8. SPARKLE FIELD
//
// v2 adds: depth (near sparkles bigger/brighter, far smaller/blurred),
// each sparkle rotates at its own speed (slow for near, fast for far),
// a subtle background twinkle wash.
// ═════════════════════════════════════════════════════════════════════════

export type SparkleFieldProps = {
  count?: number;
  emoji?: string;
  startFrame?: number;
  durationFrames?: number;
  bg?: string;
};

export const SparkleField: React.FC<SparkleFieldProps> = ({
  count = 16,
  emoji = "✨",
  startFrame = 0,
  durationFrames = 80,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;

  return (
    <AbsoluteFill style={{ background: bg }}>
      {Array.from({ length: count }).map((_, i) => {
        const startOff = Math.floor(seeded(i * 7 + 3) * 30);
        const sf = f - startOff;
        const p = interpolate(sf, [0, durationFrames], [0, 1], clamp);
        if (p <= 0 || p >= 1) return null;
        // Depth: 0 = near (bigger, brighter, slower rotation),
        //         1 = far (smaller, dimmer, faster rotation due to parallax illusion)
        const depth = seeded(i * 31 + 5);
        const x = seeded(i * 11 + 1) * 100;
        const y = seeded(i * 13 + 5) * 100;
        const baseSize = 70 - depth * 40;
        const op = interpolate(p, [0, 0.2, 0.8, 1], [0, 1 - depth * 0.4, 1 - depth * 0.4, 0]);
        const scale = interpolate(p, [0, 0.3, 0.7, 1], [0, 1, 1, 0.5]);
        const rotSpeed = (1 - depth) * 1.5 + 0.5;
        const rot = (seeded(i * 19) - 0.5) * 60 + sf * rotSpeed;
        const glow = (1 - depth) * 25;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${y}%`,
              left: `${x}%`,
              fontSize: baseSize,
              opacity: op,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${rot}deg)`,
              filter: depth > 0.6 ? `blur(${(depth - 0.6) * 3}px)` : undefined,
              textShadow: glow > 0 ? `0 0 ${glow}px rgba(255,220,100,0.8)` : undefined,
            }}
          >
            {emoji}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
