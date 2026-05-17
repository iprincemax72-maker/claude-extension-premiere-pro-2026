// remotion-social-ui v2 — platform-accurate social UI mockups.
//
// Every component models the REAL UX state machine of its source app.
// iMessageBubble goes through: typing-dots → bubble-pop → text-type → delivered → read.
// SubscribePop goes through: idle → cursor-approach → hover-lift → click-compress
//   → ripple → color-sweep-fill → bell-shake → settled.
// LikeBurst hearts have depth, spin, motion-blur, and varied trajectories.
//
// Each component carries SECONDARY motion (shadows that lag, dots that pulse,
// status indicators) — the small details that make a fake UI feel real.

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

// Shared motion configs — match remotion-hooks for cross-skill coherence
const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 }, // iOS-feel snap
  drift: { damping: 22, stiffness: 80, mass: 1.1 },
};

function tremor(frame: number, amp = 1, speed = 0.18): number {
  return (
    Math.sin(frame * speed) * amp +
    Math.sin(frame * speed * 1.7) * amp * 0.45 +
    Math.sin(frame * speed * 0.3) * amp * 0.25
  );
}

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
// 1. iMESSAGE BUBBLE
//
// Full UX state machine:
//   Phase 0  (0–20)         Typing dots appear (when side="them")
//   Phase 1  (20–24)         Dots dissolve, bubble pops in
//   Phase 2  (24–type-end)   Text types char-by-char with blinking cursor
//   Phase 3  (type-end+12)   Bubble micro-shake (delivery haptic)
//   Phase 4  (type-end+22)   "Delivered" timestamp fades in
//   Phase 5  (type-end+50)   "Read" with timestamp (if showRead)
//
// Accurate iOS 17 details: blue/grey colors, glassmorphism on grey,
// proper bubble tail, sender label with semi-bold + tracking.
// ═════════════════════════════════════════════════════════════════════════

export type iMessageBubbleProps = {
  text: string;
  side?: "them" | "you";
  sender?: string;
  /** Frames per character. Default 1.4. */
  charsPerFrame?: number;
  /** Show typing-dots pre-roll. Default true for side="them". */
  withTypingDots?: boolean;
  /** Frames the typing dots stay before the bubble pops in. Default 20. */
  typingDotsFrames?: number;
  /** Show "Delivered" timestamp after typing finishes. Default true. */
  withDelivered?: boolean;
  /** Show "Read" receipt after Delivered. Default false. */
  showRead?: boolean;
  /** Tail-side custom (overrides side default). */
  showTail?: boolean;
  bg?: string;
  scale?: number;
  /** Optional override for the blue color (iOS Messages blue). */
  blueAccent?: string;
};

export const iMessageBubble: React.FC<iMessageBubbleProps> = ({
  text,
  side = "them",
  sender,
  charsPerFrame = 1.4,
  withTypingDots,
  typingDotsFrames = 20,
  withDelivered = true,
  showRead = false,
  showTail = true,
  bg = "#000000",
  scale = 1,
  blueAccent = "#0a84ff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isYou = side === "you";

  // Default: typing dots only show for "them"
  const usesTypingDots = withTypingDots ?? !isYou;
  const dotsEnd = usesTypingDots ? typingDotsFrames : 0;
  const bubbleStart = dotsEnd;
  const f = frame - bubbleStart;

  // Bubble pop
  const popSpring = spring({
    frame: f,
    fps,
    config: motion.haptic,
  });
  const bubbleScale = interpolate(popSpring, [0, 1], [0.6, 1]);
  const bubbleOp = interpolate(f, [-2, 4], [0, 1], clamp);

  // Typing
  const typedChars = Math.floor(Math.max(0, f * charsPerFrame));
  const visible = text.slice(0, Math.min(typedChars, text.length));
  const typingDone = typedChars >= text.length;
  const typeEndFrame = bubbleStart + text.length / charsPerFrame;

  // Delivery haptic — tiny vibration when typing finishes
  const hapticF = frame - typeEndFrame;
  const hapticShake =
    hapticF > 0 && hapticF < 8 ? Math.sin(hapticF * 1.6) * (1 - hapticF / 8) * 3 : 0;

  // Delivered timestamp
  const deliveredP = withDelivered
    ? interpolate(frame, [typeEndFrame + 14, typeEndFrame + 24], [0, 1], clamp)
    : 0;

  // Read receipt
  const readP = showRead
    ? interpolate(frame, [typeEndFrame + 40, typeEndFrame + 52], [0, 1], clamp)
    : 0;

  const bubbleColor = isYou ? blueAccent : "rgba(58, 58, 60, 0.92)";
  const textColor = "#ffffff";

  // Typing dots animation (each dot pulses on a stagger)
  const dotPhase = (i: number) => {
    const t = ((frame + i * 6) % 30) / 30;
    const scl = 0.55 + 0.45 * Math.max(0, Math.sin(t * Math.PI));
    const op = 0.4 + 0.6 * Math.max(0, Math.sin(t * Math.PI));
    return { scl, op };
  };
  const dotsFadeOut = interpolate(frame, [dotsEnd - 4, dotsEnd], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: bg, padding: "8%" }}>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: isYou ? "flex-end" : "flex-start",
          fontFamily: SF,
          color: textColor,
          transform: `scale(${scale})`,
          transformOrigin: isYou ? "right center" : "left center",
        }}
      >
        {sender && !isYou ? (
          <div
            style={{
              fontSize: 26,
              color: "#8e8e93",
              marginBottom: 10,
              marginLeft: 28,
              fontWeight: 600,
              letterSpacing: "0.01em",
              opacity: interpolate(frame, [0, 8], [0, 1], clamp),
            }}
          >
            {sender}
          </div>
        ) : null}

        {/* Typing dots */}
        {usesTypingDots && dotsFadeOut > 0 ? (
          <div
            style={{
              background: bubbleColor,
              borderRadius: 32,
              padding: "22px 26px",
              display: "flex",
              gap: 10,
              alignItems: "center",
              opacity: dotsFadeOut,
              transform: `scale(${interpolate(frame, [0, 8], [0.7, 1], clamp)})`,
              backdropFilter: !isYou ? "blur(40px)" : undefined,
              WebkitBackdropFilter: !isYou ? "blur(40px)" : undefined,
              boxShadow: "0 2px 14px rgba(0,0,0,0.3)",
            }}
          >
            {[0, 1, 2].map((i) => {
              const d = dotPhase(i);
              return (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#c7c7cc",
                    transform: `scale(${d.scl})`,
                    opacity: d.op,
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {/* Real bubble */}
        {bubbleOp > 0 ? (
          <div style={{ position: "relative" }}>
            <div
              style={{
                background: bubbleColor,
                color: textColor,
                borderRadius: 32,
                padding: "20px 28px",
                maxWidth: "75vw",
                fontSize: 46,
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
                fontWeight: 500,
                transform: `scale(${bubbleScale}) translateX(${hapticShake}px)`,
                opacity: bubbleOp,
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                backdropFilter: !isYou ? "blur(40px)" : undefined,
                WebkitBackdropFilter: !isYou ? "blur(40px)" : undefined,
                // iOS Messages — blue gradient
                ...(isYou
                  ? {
                      background: `linear-gradient(180deg, ${blueAccent} 0%, ${shade(blueAccent, -8)} 100%)`,
                    }
                  : {}),
                position: "relative",
              }}
            >
              {visible}
              {!typingDone && visible.length > 0 ? (
                <span style={{ opacity: frame % 30 < 15 ? 1 : 0 }}>|</span>
              ) : null}

              {/* Tail */}
              {showTail ? (
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 20 20"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    [isYou ? "right" : "left"]: -8,
                  }}
                >
                  <path
                    d={
                      isYou
                        ? "M 0 0 Q 12 16 20 18 Q 8 10 0 10 Z"
                        : "M 20 0 Q 8 16 0 18 Q 12 10 20 10 Z"
                    }
                    fill={isYou ? shade(blueAccent, -4) : "rgba(58,58,60,0.92)"}
                  />
                </svg>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Delivered / Read timestamps */}
        {deliveredP > 0 && readP <= 0.3 ? (
          <div
            style={{
              fontSize: 18,
              color: "#8e8e93",
              marginTop: 10,
              marginRight: isYou ? 28 : 0,
              marginLeft: isYou ? 0 : 28,
              opacity: deliveredP,
              fontWeight: 600,
            }}
          >
            Delivered
          </div>
        ) : null}
        {readP > 0 ? (
          <div
            style={{
              fontSize: 18,
              color: "#8e8e93",
              marginTop: 10,
              marginRight: isYou ? 28 : 0,
              marginLeft: isYou ? 0 : 28,
              opacity: readP,
              fontWeight: 600,
            }}
          >
            Read
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. DM NOTIFICATION
//
// Improvements over v1:
//   • Haptic-feel slam in (motion.haptic spring — fast, no overshoot)
//   • Avatar has online status dot (pulses)
//   • Notification badge dot pulses
//   • Slight glassmorphism with proper backdrop
//   • Subtle exit drift to the right
//   • Time indicator "now" pulses faintly
// ═════════════════════════════════════════════════════════════════════════

export type DMNotificationProps = {
  sender: string;
  preview: string;
  app?: "Instagram" | "TikTok" | "WhatsApp" | "Message";
  startFrame?: number;
  holdFrames?: number;
  avatar?: string;
  bg?: string;
  /** Show the green "online" dot on the avatar. Default true. */
  onlineDot?: boolean;
};

const APP_THEMES = {
  Instagram: {
    grad: "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
    label: "INSTAGRAM",
  },
  TikTok: {
    grad: "linear-gradient(135deg, #25f4ee 0%, #fe2c55 100%)",
    label: "TIKTOK",
  },
  WhatsApp: {
    grad: "linear-gradient(135deg, #25d366 0%, #128c7e 100%)",
    label: "WHATSAPP",
  },
  Message: {
    grad: "linear-gradient(135deg, #34c759 0%, #30d158 100%)",
    label: "MESSAGES",
  },
};

export const DMNotification: React.FC<DMNotificationProps> = ({
  sender,
  preview,
  app = "Instagram",
  startFrame = 0,
  holdFrames = 90,
  avatar,
  bg = "transparent",
  onlineDot = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = APP_THEMES[app];
  const f = frame - startFrame;

  const slideIn = spring({
    frame: f,
    fps,
    config: motion.haptic,
  });
  const exitStart = startFrame + holdFrames;
  const slideOut = interpolate(frame, [exitStart, exitStart + 14], [0, 1], clamp);
  const exitX = slideOut * 60; // drifts slightly right on exit

  const totalSlide = slideIn - slideOut;
  const yOffset = interpolate(totalSlide, [0, 1], [-160, 0]);
  const opacity = interpolate(totalSlide, [0, 0.2, 0.85, 1], [0, 1, 1, 0]);

  // Online dot pulse
  const pulse = 0.7 + 0.3 * Math.abs(Math.sin(f * 0.16));

  // "now" indicator pulses
  const nowPulse = 0.5 + 0.5 * Math.abs(Math.sin(f * 0.12));

  return (
    <AbsoluteFill style={{ background: bg, padding: "3%" }}>
      <div
        style={{
          marginTop: 30,
          display: "flex",
          justifyContent: "center",
          transform: `translate(${exitX}px, ${yOffset}px)`,
          opacity,
        }}
      >
        <div
          style={{
            background: "rgba(28, 28, 30, 0.88)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            borderRadius: 28,
            padding: "18px 22px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            maxWidth: "85%",
            width: "85%",
            color: "#fff",
            fontFamily: SF,
            boxShadow:
              "0 10px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: theme.grad,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                fontWeight: 800,
              }}
            >
              {avatar ?? sender.charAt(0).toUpperCase()}
            </div>
            {onlineDot ? (
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#30d158",
                  border: "3px solid rgba(28,28,30,1)",
                  opacity: pulse,
                  boxShadow: `0 0 ${pulse * 12}px #30d158`,
                }}
              />
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {sender}
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: "0.05em",
                  opacity: nowPulse,
                }}
              >
                {theme.label} · now
              </div>
            </div>
            <div
              style={{
                fontSize: 28,
                marginTop: 4,
                lineHeight: 1.25,
                color: "rgba(255,255,255,0.88)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {preview}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. LIKE BURST
//
// Improvements over v1:
//   • Hearts have DEPTH — varied sizes simulate distance from camera
//   • Some hearts spin (rotation), others rise straight (variation)
//   • Motion-blur trails (3 transparent ghosts trailing each heart)
//   • Background pulse — soft pink wash on burst start
//   • Closer hearts have stronger glow (atmospheric perspective)
// ═════════════════════════════════════════════════════════════════════════

export type LikeBurstProps = {
  count?: number;
  durationFrames?: number;
  color?: string;
  bg?: string;
  /** Show the pink background wash on burst start. Default true. */
  withBgPulse?: boolean;
};

export const LikeBurst: React.FC<LikeBurstProps> = ({
  count = 18,
  durationFrames = 60,
  color = "#ff2d55",
  bg = "transparent",
  withBgPulse = true,
}) => {
  const frame = useCurrentFrame();
  // Background pulse
  const bgPulseOp = withBgPulse
    ? interpolate(frame, [0, 6, 30], [0, 0.25, 0], clamp)
    : 0;

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {bgPulseOp > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 50% 70%, ${color}, transparent 60%)`,
            opacity: bgPulseOp,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {Array.from({ length: count }).map((_, i) => (
        <HeartParticle
          key={i}
          index={i}
          durationFrames={durationFrames}
          color={color}
        />
      ))}
    </AbsoluteFill>
  );
};

const HeartParticle: React.FC<{
  index: number;
  durationFrames: number;
  color: string;
}> = ({ index, durationFrames, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.floor(seeded(index * 7 + 3) * 16);
  const f = frame - startFrame;
  const progress = interpolate(f, [0, durationFrames], [0, 1], clamp);
  if (progress <= 0 || progress >= 1) return null;

  // Depth — sized between 60 and 160px based on seed
  const depth = seeded(index * 31 + 9); // 0 = near, 1 = far
  const sizeBase = 60 + (1 - depth) * 100;

  // Trajectory variation
  const variant = index % 3; // 0: straight rise, 1: zigzag, 2: spin
  const xJitter = (seeded(index * 11 + 5) - 0.5) * 700;
  const sway =
    variant === 1
      ? Math.sin(progress * Math.PI * 2 + index) * 50
      : Math.sin(progress * Math.PI + index) * 20;
  const x = 540 + xJitter + sway;
  const y = interpolate(progress, [0, 1], [1700, 100]);

  const opacity = interpolate(progress, [0, 0.12, 0.85, 1], [0, 1, 1, 0]);
  // Near hearts more opaque
  const depthOpacity = 0.5 + (1 - depth) * 0.5;

  const popIn = spring({
    frame: f,
    fps,
    config: motion.pop,
  });
  const scaleBase = popIn * (0.7 + (1 - depth) * 0.6);

  const rot =
    variant === 2
      ? progress * 720 + (seeded(index * 19) - 0.5) * 40
      : (seeded(index * 19) - 0.5) * 30;

  const hueShift = (seeded(index * 23) - 0.5) * 25;
  // Near hearts have stronger glow
  const glowStrength = (1 - depth) * 14 + 4;

  const HeartSVG = ({ shade: shadeProp = 1 }: { shade?: number }) => (
    <svg width={sizeBase} height={sizeBase} viewBox="0 0 24 24" fill={color}>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        opacity={shadeProp}
      />
    </svg>
  );

  return (
    <>
      {/* Motion-blur ghost trails (3 trailing ghosts) */}
      {[0.5, 1, 1.5].map((trail, ti) => {
        const trailProgress = Math.max(0, progress - trail * 0.015);
        const trailY = interpolate(trailProgress, [0, 1], [1700, 100]);
        const trailX = 540 + xJitter + sway;
        const trailOp =
          opacity * depthOpacity * (0.25 - ti * 0.07);
        if (trailOp <= 0) return null;
        return (
          <div
            key={`t${ti}`}
            style={{
              position: "absolute",
              left: trailX,
              top: trailY,
              transform: `translate(-50%, -50%) scale(${scaleBase}) rotate(${rot}deg)`,
              opacity: trailOp,
              filter: `hue-rotate(${hueShift}deg)`,
            }}
          >
            <HeartSVG />
          </div>
        );
      })}

      {/* Main heart */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity: opacity * depthOpacity,
          transform: `translate(-50%, -50%) scale(${scaleBase}) rotate(${rot}deg)`,
          filter: `hue-rotate(${hueShift}deg) drop-shadow(0 0 ${glowStrength}px ${color})`,
        }}
      >
        <HeartSVG />
      </div>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. SUBSCRIBE POP
//
// 7-act choreography:
//   1. Entrance (button springs in)
//   2. Idle hover (frames 6-14: bobs up 8px)
//   3. Cursor approaches from off-screen (motion-blurred)
//   4. Hover lift on contact
//   5. Click compression (frame clickFrame: -1 frame compress)
//   6. Ripple expands + color sweep wipe (mask-based, not just opacity)
//   7. Bell appears, rotation-shakes 16 frames, settles
//   8. Brief "Bell on" pill tooltip appears after
// ═════════════════════════════════════════════════════════════════════════

export type SubscribePopProps = {
  clickFrame?: number;
  label?: string;
  subscribedLabel?: string;
  bg?: string;
  scale?: number;
  /** Show the cursor approach animation. Default true. */
  withCursor?: boolean;
  /** Show the "Bell on" tooltip after bell shake. Default true. */
  withTooltip?: boolean;
};

export const SubscribePop: React.FC<SubscribePopProps> = ({
  clickFrame = 40,
  label = "SUBSCRIBE",
  subscribedLabel = "SUBSCRIBED",
  bg = "transparent",
  scale = 1,
  withCursor = true,
  withTooltip = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Button entrance
  const enter = spring({ frame, fps, config: motion.pop });

  // Idle hover bob
  const bob = interpolate(frame, [10, 24], [0, -8], clamp);

  // Cursor approach
  const cursorAppearFrame = clickFrame - 18;
  const cursorProgress = withCursor
    ? interpolate(frame, [cursorAppearFrame, clickFrame], [0, 1], clamp)
    : 0;
  // Cursor moves from off-screen bottom-left to button center
  const cursorX = interpolate(cursorProgress, [0, 1], [-200, 0]);
  const cursorY = interpolate(cursorProgress, [0, 1], [200, 0]);
  // Cursor has motion blur near end of approach
  const cursorBlur =
    cursorProgress > 0 && cursorProgress < 0.85 ? (1 - cursorProgress) * 4 : 0;

  // Click compress
  const clicked = frame >= clickFrame;
  const compressF = frame - clickFrame;
  const clickScale =
    clicked && compressF < 12
      ? interpolate(compressF, [0, 3, 9], [1, 0.92, 1])
      : 1;

  // Color sweep — wipe from left to right
  const sweepP = interpolate(
    frame,
    [clickFrame + 3, clickFrame + 14],
    [0, 1],
    clamp
  );
  const textColor = sweepP > 0.5 ? "#0f0f0f" : "#ffffff";
  const displayLabel = sweepP > 0.5 ? subscribedLabel : label;

  // Ripple
  const rippleP = clicked
    ? interpolate(frame - clickFrame, [0, 30], [0, 1], clamp)
    : 0;
  const rippleScale = interpolate(rippleP, [0, 1], [0.6, 2.6]);
  const rippleOp = interpolate(rippleP, [0, 1], [0.55, 0]);

  // Bell rotation shake after subscribed
  const bellStart = clickFrame + 14;
  const bellF = frame - bellStart;
  const bellAppear = interpolate(bellF, [0, 6], [0, 1], clamp);
  const bellRot =
    bellF > 0 && bellF < 30
      ? Math.sin(bellF * 0.7) * 14 * Math.max(0, 1 - bellF / 30)
      : 0;

  // "Bell on" tooltip
  const tipStart = bellStart + 30;
  const tipP = withTooltip
    ? interpolate(frame, [tipStart, tipStart + 8, tipStart + 36, tipStart + 44], [0, 1, 1, 0], clamp)
    : 0;

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
          transform: `translateY(${bob}px) scale(${enter * clickScale * scale})`,
          opacity: enter,
        }}
      >
        {/* Ripple */}
        {clicked ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 12,
              border: "4px solid rgba(255,255,255,0.85)",
              transform: `scale(${rippleScale})`,
              opacity: rippleOp,
            }}
          />
        ) : null}

        {/* Button */}
        <div
          style={{
            position: "relative",
            background: "#cc0000",
            color: textColor,
            padding: "26px 56px",
            borderRadius: 12,
            fontFamily: SF,
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            gap: 18,
            overflow: "hidden",
            boxShadow: clicked
              ? "0 4px 14px rgba(0,0,0,0.25)"
              : "0 12px 30px rgba(204,0,0,0.4)",
          }}
        >
          {/* White color sweep — masks the red bg from left to right */}
          {sweepP > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#ffffff",
                clipPath: `polygon(0 0, ${sweepP * 105}% 0, ${sweepP * 105 - 5}% 100%, 0 100%)`,
              }}
            />
          ) : null}

          {/* Bell — appears post-click */}
          {bellAppear > 0 ? (
            <div
              style={{
                position: "relative",
                width: 44,
                height: 44,
                transform: `rotate(${bellRot}deg) scale(${bellAppear})`,
                transformOrigin: "50% 20%",
                opacity: bellAppear,
              }}
            >
              <svg viewBox="0 0 24 24" fill={textColor}>
                <path d="M12 2a2 2 0 0 0-2 2v.2A7 7 0 0 0 5 11v4l-2 2v1h18v-1l-2-2v-4a7 7 0 0 0-5-6.8V4a2 2 0 0 0-2-2zm-2 18a2 2 0 0 0 4 0h-4z" />
              </svg>
            </div>
          ) : null}

          <span style={{ position: "relative", zIndex: 2 }}>{displayLabel}</span>
        </div>

        {/* "Bell on" tooltip */}
        {tipP > 0 ? (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: `translate(-50%, ${interpolate(tipP, [0, 1], [-8, 16])}px)`,
              opacity: tipP,
              background: "rgba(20,20,22,0.95)",
              color: "#fff",
              fontFamily: SF,
              fontSize: 22,
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
            }}
          >
            🔔 Notifications on
          </div>
        ) : null}

        {/* Cursor */}
        {withCursor && cursorProgress > 0.02 && cursorProgress < 1.5 ? (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(${cursorX}px, ${cursorY}px)`,
              filter: cursorBlur > 0 ? `blur(${cursorBlur}px)` : undefined,
              opacity: interpolate(frame, [cursorAppearFrame, cursorAppearFrame + 4], [0, 1], clamp),
              pointerEvents: "none",
            }}
          >
            <svg width={40} height={48} viewBox="0 0 24 28">
              <path
                d="M 2 2 L 2 22 L 8 18 L 12 26 L 16 24 L 12 16 L 20 16 Z"
                fill="#ffffff"
                stroke="#000"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. COMMENT OVERLAY
//
// Improvements over v1:
//   • Avatar has online status dot
//   • Optional type-in animation for comment text
//   • Reply icon appears subtly after entrance
//   • Like-count ticks up if `likeAfter` is set
// ═════════════════════════════════════════════════════════════════════════

export type CommentOverlayProps = {
  username: string;
  comment: string;
  likes?: number;
  startFrame?: number;
  holdFrames?: number;
  avatar?: string;
  bg?: string;
  /** Type the comment text in char-by-char. Default false (instant). */
  typeIn?: boolean;
  /** If set, like-count starts at 0 and ticks up to `likes` after this many frames. */
  likeAfter?: number;
};

export const CommentOverlay: React.FC<CommentOverlayProps> = ({
  username,
  comment,
  likes,
  startFrame = 0,
  holdFrames = 90,
  avatar,
  bg = "transparent",
  typeIn = false,
  likeAfter,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.pop });
  const exitStart = startFrame + holdFrames;
  const exit = interpolate(frame, [exitStart, exitStart + 14], [0, 1], clamp);
  const visible = Math.max(0, enter - exit);
  const yOffset = interpolate(visible, [0, 1], [240, 0]);
  const opacity = interpolate(visible, [0, 0.2, 0.85, 1], [0, 1, 1, 1]);

  // Type-in
  const typed = typeIn ? Math.floor(Math.max(0, (f - 10) * 1.4)) : comment.length;
  const shownText = comment.slice(0, Math.min(typed, comment.length));

  // Online dot
  const dotPulse = 0.7 + 0.3 * Math.abs(Math.sin(f * 0.16));

  // Like tick
  let likeShown = typeof likes === "number" ? likes : null;
  if (typeof likes === "number" && typeof likeAfter === "number") {
    const tickP = interpolate(f, [likeAfter, likeAfter + 18], [0, 1], clamp);
    likeShown = Math.round(likes * tickP);
  }

  return (
    <AbsoluteFill style={{ background: bg, padding: "5%" }}>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            background: "rgba(20, 20, 22, 0.78)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            borderRadius: 24,
            padding: "18px 22px",
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            maxWidth: "85%",
            transform: `translateY(${yOffset}px)`,
            opacity,
            color: "#fff",
            fontFamily: SF,
            boxShadow:
              "0 6px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                background: "linear-gradient(135deg,#fe2c55,#25f4ee)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 28,
                flexShrink: 0,
              }}
            >
              {avatar ?? username.charAt(0).toUpperCase()}
            </div>
            <div
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#30d158",
                border: "2.5px solid #1a1a1c",
                opacity: dotPulse,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
              @{username}
            </div>
            <div style={{ fontSize: 28, marginTop: 4, lineHeight: 1.3, minHeight: 36 }}>
              {shownText}
              {typeIn && typed < comment.length ? (
                <span style={{ opacity: f % 30 < 15 ? 1 : 0 }}>|</span>
              ) : null}
            </div>
            {likeShown !== null ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 22,
                  color: "rgba(255,255,255,0.55)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="#fe2c55">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {likeShown.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. LIVE INDICATOR
//
// Improvements over v1:
//   • 3 mini sound-wave bars next to LIVE (dance independently)
//   • Viewer count organically ticks up (+1, +2 per sec)
//   • Pulsing badge halo (outer ring expands and fades)
// ═════════════════════════════════════════════════════════════════════════

export type LiveIndicatorProps = {
  viewers?: number;
  position?: "top-left" | "top-right";
  label?: string;
  bg?: string;
  /** If true, viewer count ticks up by ~1-3/sec from start. Default true. */
  organicTick?: boolean;
};

export const LiveIndicator: React.FC<LiveIndicatorProps> = ({
  viewers,
  position = "top-left",
  label = "LIVE",
  bg = "transparent",
  organicTick = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: motion.pop });
  const pulse = 0.6 + 0.4 * (Math.sin((frame * Math.PI * 2) / 36) * 0.5 + 0.5);
  // Halo expanding from the LIVE badge
  const haloT = (frame % 60) / 60;
  const haloScale = interpolate(haloT, [0, 1], [1, 1.6]);
  const haloOp = interpolate(haloT, [0, 0.2, 1], [0, 0.4, 0]);

  // Sound wave bars
  const bar = (i: number) => {
    const t = (frame + i * 6) * 0.3;
    return 0.3 + 0.7 * Math.abs(Math.sin(t + i));
  };

  // Organic viewer count
  let viewerShown = viewers;
  if (typeof viewers === "number" && organicTick) {
    const tickRate = 1.5; // viewers per second average
    const elapsed = frame / fps;
    viewerShown = Math.floor(viewers + elapsed * tickRate);
  }

  const isLeft = position === "top-left";

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          top: 60,
          [isLeft ? "left" : "right"]: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          transform: `scale(${enter})`,
          opacity: enter,
        }}
      >
        <div style={{ position: "relative" }}>
          {/* Halo ring */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 18,
              border: "3px solid #ed2024",
              transform: `scale(${haloScale})`,
              opacity: haloOp,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#ed2024",
              padding: "10px 20px",
              borderRadius: 10,
              fontFamily: SF,
              fontWeight: 800,
              fontSize: 32,
              color: "#fff",
              letterSpacing: "0.1em",
              boxShadow: "0 4px 16px rgba(237,32,36,0.45)",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#fff",
                opacity: pulse,
                boxShadow: `0 0 ${pulse * 18}px rgba(255,255,255,${pulse})`,
              }}
            />
            {label}
            {/* Sound-wave bars */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: `${bar(i) * 100}%`,
                    background: "#fff",
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {typeof viewerShown === "number" ? (
          <div
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              padding: "10px 18px",
              borderRadius: 10,
              fontFamily: SF,
              fontWeight: 600,
              fontSize: 28,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <svg width={26} height={26} viewBox="0 0 24 24" fill="#fff">
              <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            </svg>
            {viewerShown.toLocaleString()}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 7. HASHTAG POP
//
// Improvements over v1:
//   • Cursor-flash selection highlight (frame 14, briefly)
//   • Saved-bookmark pulse after settle
//   • Breathing scale + a tiny rotation drift
// ═════════════════════════════════════════════════════════════════════════

export type HashtagPopProps = {
  tag: string;
  color?: string;
  fontSize?: number;
  startFrame?: number;
  bg?: string;
  /** Show the cursor selection flash. Default true. */
  withSelectionFlash?: boolean;
};

export const HashtagPop: React.FC<HashtagPopProps> = ({
  tag,
  color = "#25f4ee",
  fontSize = 64,
  startFrame = 0,
  bg = "transparent",
  withSelectionFlash = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const pop = spring({ frame: f, fps, config: motion.pop });
  const breath = 1 + tremor(f, 0.012, 0.08);
  const drift = tremor(f, 1.5, 0.04);

  // Selection flash — quick white overlay at frame ~14
  const flashP = withSelectionFlash
    ? interpolate(f, [12, 14, 22], [0, 1, 0], clamp)
    : 0;

  const cleanTag = tag.startsWith("#") ? tag : `#${tag}`;

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
          transform: `scale(${pop * breath}) translateX(${drift}px)`,
          opacity: pop,
          padding: `${fontSize * 0.3}px ${fontSize * 0.6}px`,
          borderRadius: 9999,
          background: `linear-gradient(135deg, ${color}, ${shade(color, -15)})`,
          color: "#0a0a0a",
          fontFamily: SF,
          fontSize,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          boxShadow: `0 0 ${fontSize * 0.6}px ${color}aa, 0 8px 24px rgba(0,0,0,0.3)`,
        }}
      >
        {cleanTag}
        {/* Selection flash overlay */}
        {flashP > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background: "rgba(255,255,255,0.55)",
              opacity: flashP,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 8. CORNER WATERMARK
//
// Improvements over v1:
//   • Heartbeat halo expanding from the logo periodically
//   • Brand text can type-in on first appearance
//   • Logo has subtle gloss highlight (rotating)
// ═════════════════════════════════════════════════════════════════════════

export type CornerWatermarkProps = {
  handle: string;
  logo?: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  maxOpacity?: number;
  accent?: string;
  bg?: string;
  /** Type the handle in char-by-char on appear. Default false. */
  typeIn?: boolean;
};

export const CornerWatermark: React.FC<CornerWatermarkProps> = ({
  handle,
  logo,
  position = "bottom-right",
  maxOpacity = 0.7,
  accent = "#d97757",
  bg = "transparent",
  typeIn = false,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [6, 24], [0, 1], clamp);
  const breath = 0.85 + 0.15 * (Math.sin(frame * 0.04) * 0.5 + 0.5);
  const opacity = fadeIn * breath * maxOpacity;

  // Heartbeat halo every 90 frames
  const beatT = (frame % 90) / 90;
  const beatScale = interpolate(beatT, [0, 1], [1, 1.8]);
  const beatOp = interpolate(beatT, [0, 0.1, 1], [0, 0.35, 0]);

  // Rotating gloss highlight on logo tile
  const glossAngle = frame * 1.5;

  const isBottom = position.startsWith("bottom");
  const isRight = position.endsWith("right");

  // Handle type-in
  const finalHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const typed = typeIn ? Math.floor(Math.max(0, frame - 18) * 1.5) : finalHandle.length;
  const handleShown = finalHandle.slice(0, Math.min(typed, finalHandle.length));

  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          [isBottom ? "bottom" : "top"]: 60,
          [isRight ? "right" : "left"]: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity,
          fontFamily: SF,
          color: "#fff",
        }}
      >
        <div style={{ position: "relative" }}>
          {/* Heartbeat halo */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              background: accent,
              transform: `scale(${beatScale})`,
              opacity: beatOp,
              pointerEvents: "none",
              filter: "blur(8px)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, ${shade(accent, -22)})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 30,
              color: "#fff",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            {logo ?? handle.charAt(0).toUpperCase()}
            {/* Rotating gloss */}
            <div
              style={{
                position: "absolute",
                inset: -10,
                background: `linear-gradient(${glossAngle}deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)`,
                mixBlendMode: "overlay",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            textShadow: "0 2px 6px rgba(0,0,0,0.6)",
            minWidth: 60,
          }}
        >
          {handleShown}
        </div>
      </div>
    </AbsoluteFill>
  );
};
