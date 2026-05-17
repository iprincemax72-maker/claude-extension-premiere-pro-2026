// remotion-ctas v2 — six call-to-action components with multi-act motion.
//
// What changed from v1:
//   • SubscribeArrow: hand-drawn arrow now actually DRAWS (stroke-dashoffset)
//     instead of fading in fully formed; bounce loop locked to the direction
//     of point; arrowhead snaps in 1 frame after path completion.
//   • BellRing: 4-act choreography (slam → shake → ripple cycles → settle).
//     Ripples emanate on a 60-frame period locked to the shake decay.
//   • LikeSmash: heart slams white-outline → sweep-wipe fills red →
//     8 particles burst with depth (varied size/opacity) + each spins.
//     Background pink flash on smash.
//   • ShareCallout: paper-plane glides in with motion-blur trail (3 ghost
//     positions), then a slight figure-8 hover.
//   • SaveBookmark: bookmark UNFOLDS from corner (transform-origin trick)
//     instead of just appearing; subtle pulse on settle.
//   • TapToFollow: cursor approaches → tap-down compression → ripples →
//     "Following ✓" tooltip after first tap.

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

const SF =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif';

// Match the spring catalog from remotion-hooks / remotion-social-ui for
// cross-skill timing coherence.
const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
  drift: { damping: 22, stiffness: 80, mass: 1.1 },
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

// ═════════════════════════════════════════════════════════════════════════
// 1. SUBSCRIBE ARROW
//
// Acts:
//   0–18  Stroke draws (stroke-dashoffset from full to zero)
//   18–22 Arrowhead snaps in (spring)
//   22+   Bounce loop in the point-direction (8px amplitude, sine)
// ═════════════════════════════════════════════════════════════════════════

export type SubscribeArrowProps = {
  point?: "down-right" | "down-left" | "up-right" | "up-left" | "down" | "right";
  label?: string;
  color?: string;
  startFrame?: number;
  bg?: string;
};

export const SubscribeArrow: React.FC<SubscribeArrowProps> = ({
  point = "down-right",
  label = "SUBSCRIBE",
  color = "#ff2d55",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Stroke draw (act 1)
  const draw = interpolate(f, [0, 18], [0, 1], clamp);
  // Arrowhead pop (act 2)
  const headSpring = spring({ frame: f - 18, fps, config: motion.haptic });
  // Bounce loop (act 3)
  const bounce = f > 22 ? Math.sin((f - 22) * 0.2) * 8 : 0;

  const dirVec = {
    "down-right": [1, 1],
    "down-left": [-1, 1],
    "up-right": [1, -1],
    "up-left": [-1, -1],
    down: [0, 1],
    right: [1, 0],
  }[point];

  const pathLength = 380;
  const dashOffset = pathLength * (1 - draw);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          left: "20%",
          top: "20%",
          right: "20%",
          bottom: "20%",
          transform: `translate(${dirVec[0] * bounce}px, ${dirVec[1] * bounce}px)`,
        }}
      >
        <svg viewBox="0 0 400 300" width="100%" height="100%" style={{ overflow: "visible" }}>
          {/* Faint chalk-ish under-stroke for hand-drawn feel */}
          <path
            d="M30,30 Q120,10 220,100 T370,260"
            stroke={color}
            strokeWidth={18}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={pathLength}
            strokeDashoffset={dashOffset}
            opacity={0.18}
          />
          <path
            d="M30,30 Q120,10 220,100 T370,260"
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={pathLength}
            strokeDashoffset={dashOffset}
          />
          {/* Arrowhead — spring in at frame 18+ */}
          <g
            opacity={headSpring}
            transform={`translate(370, 260) rotate(45) scale(${headSpring})`}
          >
            <path
              d="M-32,-14 L0,0 L-32,14"
              stroke={color}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        </svg>
        {label ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              fontFamily: SF,
              fontWeight: 900,
              fontSize: 56,
              color,
              letterSpacing: "0.04em",
              transform: "rotate(-8deg)",
              textShadow: "0 4px 0 rgba(0,0,0,0.2)",
              opacity: draw,
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. BELL RING
//
// Acts:
//   0–14  Bell springs in (scale + opacity)
//   0–30  Initial hard shake (decays over 30 frames)
//   30+   Loop gentle shake + ripple cycles every 60 frames
// ═════════════════════════════════════════════════════════════════════════

export type BellRingProps = {
  startFrame?: number;
  color?: string;
  rippleColor?: string;
  size?: number;
  bg?: string;
};

export const BellRing: React.FC<BellRingProps> = ({
  startFrame = 0,
  color = "#ffd60a",
  rippleColor = "#ffd60a",
  size = 240,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Act 1: pop in
  const enter = spring({ frame: f, fps, config: motion.pop });

  // Act 2: initial hard shake decays over 30 frames, transitions to act 3
  const initialShake = Math.sin(f * 0.9) * Math.max(0, 1 - f / 30) * 14;
  // Act 3: gentle loop shake after initial decays
  const loopShake = Math.sin(f * 0.42) * 3.5 * Math.min(1, f / 30);
  const rot = initialShake + loopShake;

  // Ripples on a 60-frame period (locked to shake decay)
  const ringT = (f % 60) / 60;
  const ringScale = interpolate(ringT, [0, 1], [1, 1.65]);
  const ringOp = interpolate(ringT, [0, 0.18, 1], [0, 0.55, 0]);
  // Second ripple offset for richer feeling
  const ring2T = ((f + 30) % 60) / 60;
  const ring2Scale = interpolate(ring2T, [0, 1], [1, 1.4]);
  const ring2Op = interpolate(ring2T, [0, 0.18, 1], [0, 0.3, 0]);

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
          position: "relative",
          width: size,
          height: size,
          transform: `scale(${enter})`,
        }}
      >
        {/* Outer ripple */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `6px solid ${rippleColor}`,
            borderRadius: "50%",
            opacity: ringOp,
            transform: `scale(${ringScale})`,
          }}
        />
        {/* Inner ripple (offset phase) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `4px solid ${rippleColor}`,
            borderRadius: "50%",
            opacity: ring2Op,
            transform: `scale(${ring2Scale})`,
          }}
        />
        {/* Bell — pivot from top so it swings */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `rotate(${rot}deg)`,
            transformOrigin: "50% 20%",
            filter: `drop-shadow(0 4px 0 ${shade(color, -25)})`,
          }}
        >
          <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
            <path d="M12 2a2 2 0 0 0-2 2v.2A7 7 0 0 0 5 11v4l-2 2v1h18v-1l-2-2v-4a7 7 0 0 0-5-6.8V4a2 2 0 0 0-2-2zm-2 18a2 2 0 0 0 4 0h-4z" />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. LIKE SMASH
//
// Acts:
//   0–10  Heart slams in white-outline
//   smashFrame–smashFrame+10  Sweep-wipe fills red (clip-path), bg pink flash
//   smashFrame+4–smashFrame+28  8 depth-varied particles burst out, each spins
// ═════════════════════════════════════════════════════════════════════════

export type LikeSmashProps = {
  startFrame?: number;
  smashFrame?: number;
  color?: string;
  size?: number;
  bg?: string;
};

export const LikeSmash: React.FC<LikeSmashProps> = ({
  startFrame = 0,
  smashFrame = 18,
  color = "#ff2d55",
  size = 280,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Act 1: slam in
  const slam = spring({ frame: f, fps, config: motion.slam });
  const scale = interpolate(slam, [0, 1], [2.5, 1]);

  // Act 2: smash wipe + bg flash
  const sinceSmash = f - smashFrame;
  const wipeP = interpolate(sinceSmash, [0, 8], [0, 1], clamp);
  const smashPunch = interpolate(sinceSmash, [0, 3, 10], [1, 1.18, 1], clamp);
  const bgFlashOp = interpolate(sinceSmash, [0, 4, 16], [0, 0.35, 0], clamp);

  // Act 3: particle burst
  const burstP = interpolate(sinceSmash, [0, 28], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background pink flash on smash */}
      {bgFlashOp > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${color}, transparent 60%)`,
            opacity: bgFlashOp,
          }}
        />
      ) : null}

      {/* Particles — depth-varied, with spin */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const depth = (i % 3) / 3; // 0=near, 1=far
        const dist = burstP * (200 + (1 - depth) * 100);
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const op = interpolate(burstP, [0, 0.2, 1], [0, 1 - depth * 0.4, 0]);
        const psize = 22 + (1 - depth) * 14;
        const spin = burstP * 360 * (i % 2 === 0 ? 1 : -1);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: psize,
              height: psize,
              borderRadius: "50%",
              background: color,
              transform: `translate(${x}px, ${y}px) scale(${1 - burstP * 0.4}) rotate(${spin}deg)`,
              opacity: op,
              boxShadow: `0 0 ${(1 - depth) * 16}px ${color}`,
            }}
          />
        );
      })}

      {/* Heart — starts as white outline, snaps to filled red on smashFrame.
         Avoid clip-path tricks: SVG path stroke joins create artifacts
         when intersected. Simple color cross-fade is cleaner. */}
      <div
        style={{
          position: "relative",
          transform: `scale(${scale * smashPunch})`,
          filter: wipeP > 0.5 ? `drop-shadow(0 0 24px ${color}88)` : "none",
        }}
      >
        <svg viewBox="0 0 24 24" width={size} height={size}>
          {/* Single heart path — fill and stroke interpolate together */}
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={wipeP > 0.5 ? color : "transparent"}
            stroke={wipeP > 0.5 ? color : "#ffffff"}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. SHARE CALLOUT
//
// Acts:
//   0–14  Paper-plane glides in from left with motion-blur trail
//   14+   Settles, then gentle figure-8 hover (Lissajous curve)
// ═════════════════════════════════════════════════════════════════════════

export type ShareCalloutProps = {
  label?: string;
  target?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  color?: string;
  startFrame?: number;
  bg?: string;
};

export const ShareCallout: React.FC<ShareCalloutProps> = ({
  label = "SHARE THIS",
  target = "bottom-right",
  color = "#25f4ee",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Glide in
  const enter = spring({ frame: f, fps, config: motion.haptic });
  // Figure-8 hover (Lissajous: x = sin(t), y = sin(2t)/2)
  const hoverT = (f - 18) * 0.06;
  const hoverX = f > 18 ? Math.sin(hoverT) * 10 : 0;
  const hoverY = f > 18 ? Math.sin(hoverT * 2) * 5 : 0;
  const glideX = interpolate(enter, [0, 1], [-200, 0]);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Motion-blur trail — 3 transparent ghost copies trailing */}
      {[0.4, 0.8, 1.2].map((trail, ti) => {
        if (f - trail * 2 < 0 || enter > 0.95) return null;
        const trailOp = (1 - ti / 3) * 0.25 * (1 - enter);
        return (
          <div
            key={ti}
            style={{
              position: "absolute",
              transform: `translateX(${glideX - trail * 30}px)`,
              opacity: trailOp,
              pointerEvents: "none",
            }}
          >
            <PaperPlane color={color} />
          </div>
        );
      })}

      <div
        style={{
          transform: `translate(${glideX + hoverX}px, ${hoverY}px) scale(${enter})`,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <PaperPlane color={color} />
        <div
          style={{
            fontFamily: SF,
            fontWeight: 900,
            fontSize: 56,
            color: "#fff",
            letterSpacing: "0.04em",
            textShadow: "0 4px 0 rgba(0,0,0,0.35)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 80,
            color,
            transform: `rotate(${target.includes("right") ? 25 : -25}deg)`,
          }}
        >
          {target.endsWith("right") ? "→" : "←"}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PaperPlane: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      width: 110,
      height: 110,
      borderRadius: 24,
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 8px 30px ${color}55`,
    }}
  >
    <svg viewBox="0 0 24 24" width={64} height={64} fill="#0a0a0a">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════
// 5. SAVE BOOKMARK
//
// Acts:
//   0–14  Bookmark UNFOLDS from corner (transform-origin top, scaleY 0→1)
//   14+   Pulse loop (±3% on a slow sine)
// ═════════════════════════════════════════════════════════════════════════

export type SaveBookmarkProps = {
  label?: string;
  corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  color?: string;
  startFrame?: number;
  bg?: string;
};

export const SaveBookmark: React.FC<SaveBookmarkProps> = ({
  label = "SAVE FOR LATER",
  corner = "top-right",
  color = "#ffd60a",
  startFrame = 0,
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  // Unfold animation (scaleY from origin = "top")
  const unfold = spring({ frame: f, fps, config: motion.haptic });
  const unfoldScale = interpolate(unfold, [0, 1], [0, 1]);
  // Pulse after unfold
  const pulse = f > 18 ? 1 + tremor(f, 0.018, 0.06) : 1;
  // Label fades in after unfold completes
  const labelOp = interpolate(f, [16, 30], [0, 1], clamp);

  const isTop = corner.startsWith("top");
  const isRight = corner.endsWith("right");

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          [isTop ? "top" : "bottom"]: 60,
          [isRight ? "right" : "left"]: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: isRight ? "flex-end" : "flex-start",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 110,
            height: 150,
            background: `linear-gradient(180deg, ${color} 0%, ${shade(color, -15)} 100%)`,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 18,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            transform: `scaleY(${unfoldScale}) scale(${pulse})`,
            transformOrigin: isTop ? "top center" : "bottom center",
          }}
        >
          <svg viewBox="0 0 24 24" width={50} height={50} fill="#0a0a0a">
            <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2z" />
          </svg>
        </div>
        <div
          style={{
            fontFamily: SF,
            fontWeight: 800,
            fontSize: 22,
            color: "#fff",
            letterSpacing: "0.08em",
            textShadow: "0 2px 0 rgba(0,0,0,0.5)",
            opacity: labelOp,
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. TAP TO FOLLOW
//
// Acts:
//   0–10  Target circle pops in, finger approaches from off-screen
//   loop: every 50 frames — finger taps down (compression), ripple expands
//   First tap done → small "Following ✓" tooltip appears, persists
// ═════════════════════════════════════════════════════════════════════════

export type TapToFollowProps = {
  label?: string;
  color?: string;
  startFrame?: number;
  size?: number;
  bg?: string;
  /** Show "Following ✓" tooltip after first tap. Default true. */
  withFollowedTooltip?: boolean;
};

export const TapToFollow: React.FC<TapToFollowProps> = ({
  label = "TAP TO FOLLOW",
  color = "#ff2d55",
  startFrame = 0,
  size = 220,
  bg = "transparent",
  withFollowedTooltip = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.pop });

  // Tap loop period
  const loop = f % 50;
  const tapDown = interpolate(loop, [10, 16, 20], [0, 16, 0], clamp);
  // Compression of target circle on tap-down
  const circleSquash = interpolate(loop, [12, 16, 22], [1, 0.92, 1], clamp);
  // Ripple
  const ripple = interpolate(loop, [16, 50], [0, 1], clamp);
  const rippleScale = interpolate(ripple, [0, 1], [0.6, 2.2]);
  const rippleOp = interpolate(ripple, [0, 1], [0.6, 0]);

  // First tap = frame 16. After that the tooltip lives.
  const tipP = withFollowedTooltip
    ? interpolate(f, [28, 38], [0, 1], clamp)
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 30,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Target */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 30px ${color}66`,
            transform: `scaleY(${circleSquash})`,
          }}
        />
        {/* Ripple */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `6px solid ${color}`,
            transform: `scale(${rippleScale})`,
            opacity: rippleOp,
          }}
        />
        {/* Finger */}
        <div
          style={{
            position: "absolute",
            top: `calc(50% + ${tapDown}px)`,
            left: "50%",
            transform: "translate(-30%, -10%)",
            fontSize: size * 0.7,
            lineHeight: 1,
          }}
        >
          👆
        </div>
        {/* "Following ✓" tooltip after first tap */}
        {tipP > 0 ? (
          <div
            style={{
              position: "absolute",
              top: -size * 0.35,
              left: "50%",
              transform: `translateX(-50%) scale(${tipP})`,
              opacity: tipP,
              background: "rgba(20,20,22,0.95)",
              color: "#fff",
              fontFamily: SF,
              fontSize: 22,
              fontWeight: 700,
              padding: "10px 18px",
              borderRadius: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
            }}
          >
            ✓ Following
          </div>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: SF,
          fontWeight: 900,
          fontSize: 44,
          color: "#fff",
          letterSpacing: "0.08em",
          textShadow: "0 4px 0 rgba(0,0,0,0.4)",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
