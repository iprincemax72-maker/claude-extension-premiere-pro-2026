/**
 * Animated icon wrappers — the same icons from lib/icons.tsx but with
 * built-in motion. Pass `frame` and the icon animates itself.
 *
 *   <HeartBeat frame={frame} color={p.accent} size={64} />
 *   <BellRing frame={frame} color="#ffce4a" />
 *   <SpinIcon frame={frame} icon={<IconSettings />} speed={1} />
 *   <SparkleTrail frame={frame} />
 */

import React, { type CSSProperties } from 'react';
import { random } from 'remotion';
import {
  IconHeart, IconBell, IconStar, IconFire, IconSparkle, IconCheck,
  IconTrendUp, IconLightbulb, IconRocket,
} from './icons';

type AnimOpts = {
  size?: number;
  color?: string;
  frame: number;
  start?: number;
  style?: CSSProperties;
};

// ─── HEART beat — double-tap pulse like a real heartbeat ──────────────
export const HeartBeat: React.FC<AnimOpts & { bpm?: number }> = ({
  frame, size = 64, color = '#ff5e5b', start = 0, bpm = 70, style,
}) => {
  const period = (60 / bpm) * 30; // frames per beat at 30fps
  const t = (frame - start) % period / period;
  // Double-beat shape: spike at 0.0 and small spike at 0.18
  const beat1 = Math.max(0, 1 - Math.abs(t - 0) * 14);
  const beat2 = Math.max(0, 1 - Math.abs(t - 0.18) * 14) * 0.6;
  const scale = 1 + (beat1 + beat2) * 0.18;
  return (
    <div style={{ display: 'inline-block', transform: `scale(${scale})`, ...style }}>
      <IconHeart size={size} color={color} />
    </div>
  );
};

// ─── BELL ring — rotation back and forth, decaying ────────────────────
export const BellRing: React.FC<AnimOpts & { dur?: number; intensity?: number }> = ({
  frame, size = 64, color = '#ffce4a', start = 0, dur = 26, intensity = 14, style,
}) => {
  const t = frame - start;
  const decay = t < 0 ? 0 : Math.max(0, 1 - t / dur);
  const rot = Math.sin(t * 1.4) * intensity * decay;
  return (
    <div style={{ display: 'inline-block', transformOrigin: 'top center', transform: `rotate(${rot}deg)`, ...style }}>
      <IconBell size={size} color={color} />
    </div>
  );
};

// ─── STAR twinkle — scale + opacity in/out ────────────────────────────
export const StarTwinkle: React.FC<AnimOpts & { speed?: number; phase?: number }> = ({
  frame, size = 36, color = '#ffce4a', speed = 0.18, phase = 0, style,
}) => {
  const t = (frame + phase) * speed;
  const p = (Math.sin(t) + 1) / 2;
  return (
    <div style={{
      display: 'inline-block',
      transform: `scale(${0.6 + p * 0.4}) rotate(${t * 8}deg)`,
      opacity: 0.4 + p * 0.6,
      filter: `drop-shadow(0 0 ${p * 8}px ${color})`,
      ...style,
    }}>
      <IconStar size={size} color={color} />
    </div>
  );
};

// ─── FIRE flicker — random scale + slight rotation ────────────────────
export const FireFlicker: React.FC<AnimOpts> = ({
  frame, size = 64, color = '#ff5e5b', style,
}) => {
  const s = 1 + (random(`fire-${Math.floor(frame / 2)}`) - 0.5) * 0.12;
  const r = (random(`fire-r-${Math.floor(frame / 3)}`) - 0.5) * 8;
  return (
    <div style={{ display: 'inline-block', transform: `scale(${s}) rotate(${r}deg)`, ...style }}>
      <IconFire size={size} color={color} />
    </div>
  );
};

// ─── SPIN any icon — for loading or rotating refresh ──────────────────
export const SpinIcon: React.FC<{
  frame: number;
  icon: React.ReactNode;
  speed?: number;     // degrees per frame
  reverse?: boolean;
  style?: CSSProperties;
}> = ({ frame, icon, speed = 6, reverse = false, style }) => (
  <div style={{
    display: 'inline-block',
    transform: `rotate(${(reverse ? -frame : frame) * speed}deg)`,
    ...style,
  }}>{icon}</div>
);

// ─── BOUNCE any icon — sinusoidal up-down ─────────────────────────────
export const BounceIcon: React.FC<{
  frame: number;
  icon: React.ReactNode;
  speed?: number;
  amplitude?: number;
  style?: CSSProperties;
}> = ({ frame, icon, speed = 0.2, amplitude = 12, style }) => (
  <div style={{
    display: 'inline-block',
    transform: `translateY(${Math.abs(Math.sin(frame * speed)) * -amplitude}px)`,
    ...style,
  }}>{icon}</div>
);

// ─── SHAKE any icon — quick horizontal jitter ─────────────────────────
export const ShakeIcon: React.FC<{
  frame: number;
  icon: React.ReactNode;
  start?: number;
  dur?: number;
  intensity?: number;
  style?: CSSProperties;
}> = ({ frame, icon, start = 0, dur = 12, intensity = 6, style }) => {
  const t = frame - start;
  if (t < 0 || t > dur) return <div style={{ display: 'inline-block', ...style }}>{icon}</div>;
  const decay = 1 - t / dur;
  const x = Math.sin(t * 3.2) * intensity * decay;
  return (
    <div style={{ display: 'inline-block', transform: `translateX(${x}px)`, ...style }}>{icon}</div>
  );
};

// ─── CHECK draw — animated check mark using stroke-dasharray ──────────
export const CheckDraw: React.FC<AnimOpts & { dur?: number }> = ({
  frame, size = 80, color = '#28c840', start = 0, dur = 18, style,
}) => {
  const t = Math.max(0, Math.min(1, (frame - start) / dur));
  // Path length proxy — close enough
  const total = 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={3} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={total} strokeDashoffset={total * (1 - t)} />
    </svg>
  );
};

// ─── X draw — animated X stroke ───────────────────────────────────────
export const XDraw: React.FC<AnimOpts & { dur?: number }> = ({
  frame, size = 80, color = '#ff3b30', start = 0, dur = 14, style,
}) => {
  const t = Math.max(0, Math.min(1, (frame - start) / dur));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M6 6L18 18" stroke={color} strokeWidth={3.2} strokeLinecap="round"
        strokeDasharray={20} strokeDashoffset={20 * (1 - Math.min(1, t * 2))} fill="none" />
      <path d="M18 6L6 18" stroke={color} strokeWidth={3.2} strokeLinecap="round"
        strokeDasharray={20} strokeDashoffset={20 * (1 - Math.max(0, t * 2 - 1))} fill="none" />
    </svg>
  );
};

// ─── TREND ARROW with line drawing in ─────────────────────────────────
export const TrendDraw: React.FC<AnimOpts & { dur?: number; direction?: 'up'|'down' }> = ({
  frame, size = 80, color = '#28c840', start = 0, dur = 20, direction = 'up', style,
}) => {
  const t = Math.max(0, Math.min(1, (frame - start) / dur));
  const Cmp = direction === 'up' ? IconTrendUp : (props: any) => {
    // Simple flip for down (we don't have IconTrendDown imported but it exists)
    return <IconTrendUp {...props} style={{ transform: 'scaleY(-1)', ...(props.style || {}) }} />;
  };
  return (
    <div style={{ display: 'inline-block', opacity: t, transform: `scale(${0.5 + t * 0.5})`, ...style }}>
      <Cmp size={size} color={color} />
    </div>
  );
};

// ─── SPARKLE trail — a sparkle that fades along a path ────────────────
export const SparkleTrail: React.FC<{
  frame: number;
  count?: number;
  color?: string;
  size?: number;
  spread?: number;     // pixels
  style?: CSSProperties;
}> = ({ frame, count = 8, color = '#ffd43d', size = 18, spread = 80, style }) => {
  const sparks = Array.from({ length: count }).map((_, i) => {
    const phase = (frame * 0.1 - i * 0.4) % (Math.PI * 2);
    if (phase < 0) return null;
    const fade = Math.max(0, 1 - (phase / (Math.PI * 2)));
    const x = Math.cos(phase) * spread * fade;
    const y = Math.sin(phase * 1.3) * spread * 0.4 * fade;
    return (
      <div key={i} style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: `translate(${x}px, ${y}px) scale(${fade})`,
        opacity: fade,
      }}>
        <IconSparkle size={size} color={color} />
      </div>
    );
  });
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>{sparks}</div>
  );
};

// ─── ROCKET launch — translates up + leaves a small particle trail ────
export const RocketLaunch: React.FC<AnimOpts & { dur?: number; distance?: number }> = ({
  frame, size = 80, color = '#ff5e5b', start = 0, dur = 36, distance = 400, style,
}) => {
  const t = Math.max(0, Math.min(1, (frame - start) / dur));
  const eased = 1 - Math.pow(1 - t, 3);
  return (
    <div style={{
      display: 'inline-block',
      transform: `translateY(${-eased * distance}px) rotate(-12deg)`,
      ...style,
    }}>
      <IconRocket size={size} color={color} />
      {/* Smoke puff trail */}
      {Array.from({ length: 6 }).map((_, i) => {
        const tt = Math.max(0, t - i * 0.06);
        return (
          <div key={i} style={{
            position: 'absolute', left: size * 0.5, top: size,
            width: size * 0.4, height: size * 0.4,
            background: 'rgba(255,255,255,0.5)',
            borderRadius: '50%',
            transform: `translate(-50%, ${tt * 60}px) scale(${1 - tt})`,
            opacity: 1 - tt,
            filter: 'blur(4px)',
          }} />
        );
      })}
    </div>
  );
};

// ─── LIGHTBULB switch on — flashes from off to glowing ────────────────
export const LightbulbOn: React.FC<AnimOpts & { dur?: number }> = ({
  frame, size = 80, color = '#ffce4a', start = 0, dur = 12, style,
}) => {
  const t = Math.max(0, Math.min(1, (frame - start) / dur));
  // Flicker once at the start, then glow
  const flick = t < 0.3 ? (Math.sin(t * 40) > 0 ? 1 : 0) : 1;
  const glow = t > 0.3 ? Math.min(1, (t - 0.3) / 0.4) : 0;
  return (
    <div style={{
      display: 'inline-block',
      opacity: flick,
      filter: glow > 0 ? `drop-shadow(0 0 ${glow * 20}px ${color})` : undefined,
      ...style,
    }}>
      <IconLightbulb size={size} color={color} />
    </div>
  );
};
