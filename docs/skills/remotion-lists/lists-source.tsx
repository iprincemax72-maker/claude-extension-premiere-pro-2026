// remotion-lists v2 — list/step components with multi-act motion.

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
const SERIF = '"Times New Roman", "Georgia", serif';

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

// ═════════════════════════════════════════════════════════════════════════
// 1. NUMBERED LIST — "3 reasons why" with NUMBER pre-pop before text slides
// ═════════════════════════════════════════════════════════════════════════

export type NumberedListProps = {
  items: string[];
  title?: string;
  framesPerItem?: number;
  startFrame?: number;
  accent?: string;
  bg?: string;
};

export const NumberedList: React.FC<NumberedListProps> = ({
  items = ["consistency beats intensity", "small wins compound", "show up daily"],
  title = "3 RULES",
  framesPerItem = 14,
  startFrame = 0,
  accent = "#ff7a4d",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "8%",
        fontFamily: HELV,
        color: "#fff",
        flexDirection: "column",
        justifyContent: "center",
        gap: 40,
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: accent,
            opacity: interpolate(frame - startFrame, [0, 14], [0, 1], clamp),
          }}
        >
          {title}
        </div>
      ) : null}
      {items.map((item, i) => {
        const start = startFrame + i * framesPerItem;
        const f = frame - start;
        // NUMBER pops first (frame 0+)
        const numSpring = spring({ frame: f, fps, config: motion.slam });
        // Text slides in 4 frames after number
        const textP = interpolate(f, [4, 18], [0, 1], clamp);
        const textX = interpolate(textP, [0, 1], [-60, 0]);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 32,
            }}
          >
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 110,
                fontWeight: 700,
                color: accent,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                width: 110,
                opacity: numSpring,
                transform: `scale(${interpolate(numSpring, [0, 1], [0.4, 1])})`,
                textShadow: `0 0 ${numSpring * 24}px ${accent}66`,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                flex: 1,
                opacity: textP,
                transform: `translateX(${textX}px)`,
              }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. STEP INDICATOR
// ═════════════════════════════════════════════════════════════════════════

export type StepIndicatorProps = {
  step: number;
  total: number;
  title: string;
  accent?: string;
  bg?: string;
  startFrame?: number;
};

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  step = 2,
  total = 3,
  title = "Combine the ingredients",
  accent = "#25f4ee",
  bg = "#0a0a0a",
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;

  const enter = spring({ frame: f, fps, config: motion.haptic });
  // Progress bar fills with elastic
  const progress = interpolate(f, [10, 36], [0, step / total], clamp);

  // Step dots — N dots, each fills as step advances
  const dots = Array.from({ length: total }).map((_, i) => {
    const reached = (i + 1) <= step;
    const dotF = f - 14 - i * 4;
    const dotScale = reached ? spring({ frame: dotF, fps, config: motion.pop }) : 0;
    return { reached, dotScale };
  });

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "8%",
        fontFamily: HELV,
        color: "#fff",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 50,
      }}
    >
      <div style={{ fontSize: 36, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, opacity: enter }}>
        Step {step} of {total}
      </div>
      <div
        style={{
          fontSize: 120,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 1.1,
          textAlign: "center",
          maxWidth: "85%",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
        }}
      >
        {title}
      </div>
      {/* Progress bar */}
      <div
        style={{
          width: "65%",
          height: 14,
          background: "rgba(255,255,255,0.15)",
          borderRadius: 8,
          overflow: "visible",
          opacity: enter,
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${accent}, ${shade(accent, -25)})`,
            borderRadius: 8,
            boxShadow: `0 0 24px ${accent}aa`,
          }}
        />
        {/* Step dots ON the bar */}
        {dots.map((d, i) => {
          const xPct = ((i + 1) / total) * 100;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "50%",
                left: `${xPct}%`,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: d.reached ? "#fff" : "rgba(255,255,255,0.3)",
                transform: `translate(-50%, -50%) scale(${Math.max(d.dotScale, 0.7)})`,
                border: d.reached ? `4px solid ${accent}` : `4px solid rgba(255,255,255,0.2)`,
                boxShadow: d.reached ? `0 0 16px ${accent}` : undefined,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. CHECKLIST
// ═════════════════════════════════════════════════════════════════════════

export type ChecklistProps = {
  items: string[];
  framesPerItem?: number;
  startFrame?: number;
  accent?: string;
  bg?: string;
};

export const Checklist: React.FC<ChecklistProps> = ({
  items = ["wake up early", "drink water", "move your body", "ship something"],
  framesPerItem = 16,
  startFrame = 0,
  accent = "#22c55e",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "8%",
        fontFamily: HELV,
        color: "#fff",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
      }}
    >
      {items.map((item, i) => {
        const f = frame - startFrame - i * framesPerItem;
        const fade = interpolate(f, [0, 14], [0, 1], clamp);
        const check = interpolate(f, [10, 22], [0, 1], clamp);
        // Checkbox bg fades from transparent to accent
        const checkBg = check > 0.5 ? accent : "transparent";
        const checkBorder = check > 0 ? accent : "rgba(255,255,255,0.4)";
        // Tick draws via strokeDashoffset
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              opacity: fade,
              transform: `translateX(${interpolate(fade, [0, 1], [-40, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                border: `4px solid ${checkBorder}`,
                background: checkBg,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "none",
              }}
            >
              {check > 0 ? (
                <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                  <polyline
                    points="20 6 9 17 4 12"
                    style={{
                      strokeDasharray: 40,
                      strokeDashoffset: 40 * (1 - check),
                    }}
                  />
                </svg>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                textDecoration: check >= 1 ? "line-through" : "none",
                color: check >= 1 ? "rgba(255,255,255,0.55)" : "#fff",
              }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. BULLET REVEAL
// ═════════════════════════════════════════════════════════════════════════

export type BulletRevealProps = {
  items: string[];
  framesPerItem?: number;
  startFrame?: number;
  accent?: string;
  bg?: string;
};

export const BulletReveal: React.FC<BulletRevealProps> = ({
  items = ["focus on one thing", "ship fast", "iterate from feedback"],
  framesPerItem = 12,
  startFrame = 0,
  accent = "#ff7a4d",
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "10%",
        fontFamily: HELV,
        color: "#fff",
        flexDirection: "column",
        justifyContent: "center",
        gap: 26,
      }}
    >
      {items.map((item, i) => {
        const f = frame - startFrame - i * framesPerItem;
        const op = interpolate(f, [0, 10], [0, 1], clamp);
        const x = interpolate(f, [0, 12], [-30, 0], clamp);
        // Bullet has its own spring pop
        const bulletSpring = spring({ frame: f, fps, config: motion.pop });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              opacity: op,
              transform: `translateX(${x}px)`,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: accent,
                flexShrink: 0,
                boxShadow: `0 0 14px ${accent}77`,
                transform: `scale(${bulletSpring})`,
              }}
            />
            <div style={{ fontSize: 46, fontWeight: 600 }}>{item}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. RECIPE STEP
// ═════════════════════════════════════════════════════════════════════════

export type RecipeStepProps = {
  step: number;
  instruction: string;
  hint?: string;
  startFrame?: number;
  bg?: string;
  accent?: string;
};

export const RecipeStep: React.FC<RecipeStepProps> = ({
  step = 2,
  instruction = "whisk the eggs",
  hint = "until pale yellow",
  startFrame = 0,
  bg = "#f6efe0",
  accent = "#c45a3f",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const enter = spring({ frame: f, fps, config: motion.haptic });

  return (
    <AbsoluteFill
      style={{
        background: bg,
        padding: "10%",
        fontFamily: SERIF,
        color: "#2a1d12",
        justifyContent: "center",
        alignItems: "flex-start",
        position: "relative",
      }}
    >
      {/* Paper grain overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          background: "repeating-linear-gradient(45deg, #000 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, #000 0 1px, transparent 1px 7px)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
      <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)` }}>
        <div
          style={{
            fontFamily: HELV,
            fontWeight: 800,
            fontSize: 32,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 50,
              height: 4,
              background: accent,
              borderRadius: 2,
              transform: `scaleX(${interpolate(f, [6, 22], [0, 1], clamp)})`,
              transformOrigin: "left",
            }}
          />
          STEP {String(step).padStart(2, "0")}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 130,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            maxWidth: "85%",
          }}
        >
          {instruction}
        </div>
        {hint ? (
          <div
            style={{
              fontFamily: HELV,
              fontWeight: 500,
              fontSize: 30,
              marginTop: 30,
              color: "rgba(42, 29, 18, 0.6)",
              letterSpacing: "0.02em",
              opacity: interpolate(f, [14, 28], [0, 1], clamp),
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. SECTION BREAK
// ═════════════════════════════════════════════════════════════════════════

export type SectionBreakProps = {
  numeral?: string;
  title: string;
  startFrame?: number;
  bg?: string;
  fg?: string;
};

export const SectionBreak: React.FC<SectionBreakProps> = ({
  numeral = "III",
  title = "the truth",
  startFrame = 0,
  bg = "#0a0a0a",
  fg = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const op = interpolate(f, [0, 22], [0, 1], clamp);
  const blur = interpolate(f, [0, 22], [22, 0], clamp);
  const scale = interpolate(f, [0, 24], [0.95, 1], clamp);

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
      {numeral ? (
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 320,
            color: fg,
            opacity: op,
            filter: `blur(${blur}px)`,
            transform: `scale(${scale})`,
            letterSpacing: "0.08em",
            lineHeight: 1,
          }}
        >
          {numeral}
        </div>
      ) : null}
      <div
        style={{
          width: 220,
          height: 4,
          background: fg,
          borderRadius: 2,
          opacity: op * 0.6,
          transform: `scaleX(${op})`,
        }}
      />
      <div
        style={{
          fontFamily: HELV,
          fontWeight: 800,
          fontSize: 80,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: fg,
          opacity: op,
          transform: `translateY(${interpolate(op, [0, 1], [20, 0])}px)`,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
