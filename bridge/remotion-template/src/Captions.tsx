/**
 * Captions — Flimify's animated caption overlay.
 *
 * Self-contained (only imports from `remotion` + react) so the bridge can write
 * this file into any render project and render it standalone, exactly like the
 * /chat flow writes one-off components. Rendered transparent (ProRes 4444) and
 * dropped on a video track above the speaker's clip.
 *
 * Driven entirely by props the bridge builds from a word-level transcript:
 *   props.lines:  CaptionLine[]   (pre-grouped in bridge.js groupWordsIntoLines)
 *   props.style:  one of the 5 styles
 *   props.options: look/behaviour knobs
 *   props.fps / props.width / props.height  (used by Root.tsx calculateMetadata)
 *
 * Timing is REAL: every word carries startMs/endMs from the ASR, so captions
 * land exactly on the spoken word.
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';

export type CaptionWord = { text: string; startMs: number; endMs: number };
export type CaptionLine = { words: CaptionWord[]; startMs: number; endMs: number };
export type CaptionStyle = 'classic' | 'karaoke' | 'reels' | 'tiktok' | 'minimal';

export type CaptionOptions = {
  accent?: string;          // base text color
  highlight?: string;       // active-word highlight color
  fontSize?: number;        // px override (else a per-style default)
  position?: 'top' | 'middle' | 'bottom';
  uppercase?: boolean;
  fontFamily?: string;
  animateIn?: boolean;      // entrance motion on/off
  box?: boolean;            // semi-opaque pill behind the line for readability
};

export type CaptionsProps = {
  lines: CaptionLine[];
  style: CaptionStyle;
  options?: CaptionOptions;
  fps?: number;
  width?: number;
  height?: number;
};

const DEFAULTS: Required<Omit<CaptionOptions, 'fontSize'>> & { fontSize: number | null } = {
  accent: '#FFFFFF',
  highlight: '#E2885F',
  fontSize: null,
  position: 'bottom',
  uppercase: false,
  fontFamily:
    '"Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  animateIn: true,
  box: false,
};

// per-style default font size as a fraction of comp height
const SIZE_FRACTION: Record<CaptionStyle, number> = {
  classic: 0.046,
  karaoke: 0.05,
  reels: 0.082,
  tiktok: 0.072,
  minimal: 0.04,
};

function withDefaults(o: CaptionOptions | undefined, style: CaptionStyle, height: number) {
  const m = { ...DEFAULTS, ...(o || {}) };
  const fontSize = m.fontSize ?? Math.round(height * SIZE_FRACTION[style]);
  return { ...m, fontSize };
}

const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

// The line that should be on screen at `ms`. We keep a small lead-in so the
// line appears a hair before the first word is spoken (feels snappier).
function activeLine(lines: CaptionLine[], ms: number, leadMs = 80): CaptionLine | null {
  for (const l of lines) {
    if (ms >= l.startMs - leadMs && ms <= l.endMs + 120) return l;
  }
  return null;
}

function isWordActive(w: CaptionWord, ms: number): boolean {
  return ms >= w.startMs && ms < w.endMs;
}

export const Captions: React.FC<CaptionsProps> = ({ lines, style, options }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const opt = withDefaults(options, style, height);

  const line = activeLine(lines || [], ms);

  const justify =
    opt.position === 'top' ? 'flex-start' : opt.position === 'middle' ? 'center' : 'flex-end';
  const pad =
    opt.position === 'middle' ? 0 : Math.round(height * 0.11);

  const baseTextStyle: CSSProperties = {
    fontFamily: opt.fontFamily,
    fontWeight: 800,
    fontSize: opt.fontSize,
    lineHeight: 1.1,
    color: opt.accent,
    textAlign: 'center',
    textTransform: opt.uppercase ? 'uppercase' : 'none',
    letterSpacing: opt.uppercase ? '0.01em' : 0,
    // readability over any footage
    textShadow: '0 2px 10px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.5)',
    WebkitTextStroke: style === 'reels' || style === 'tiktok' ? '2px rgba(0,0,0,0.35)' : undefined,
    padding: '0 6%',
    maxWidth: '92%',
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        paddingTop: opt.position === 'top' ? pad : 0,
        paddingBottom: opt.position === 'bottom' ? pad : 0,
        background: 'transparent',
      }}
    >
      {line ? (
        <LineView line={line} ms={ms} fps={fps} style={style} opt={opt} textStyle={baseTextStyle} />
      ) : null}
    </AbsoluteFill>
  );
};

const LineView: React.FC<{
  line: CaptionLine;
  ms: number;
  fps: number;
  style: CaptionStyle;
  opt: ReturnType<typeof withDefaults>;
  textStyle: CSSProperties;
}> = ({ line, ms, fps, style, opt, textStyle }) => {
  const frame = useCurrentFrame();
  // line-level entrance: how long has THIS line been on screen (ms since its start)
  const sinceStart = ms - line.startMs;
  const lineInProgress = Math.max(0, sinceStart);

  // container pop for reels/tiktok
  const lineSpring = opt.animateIn
    ? spring({ frame: Math.max(0, frame - msToFrames(line.startMs, fps)), fps, config: { damping: 14, mass: 0.6 } })
    : 1;

  const wrapStyle: CSSProperties = {
    ...textStyle,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: style === 'reels' ? '0.12em 0.28em' : '0.1em 0.26em',
    transform: style === 'reels' || style === 'tiktok' ? `scale(${0.86 + 0.14 * lineSpring})` : undefined,
  };

  const box = opt.box
    ? {
        background: 'rgba(0,0,0,0.42)',
        borderRadius: 14,
        padding: '0.28em 0.6em',
        backdropFilter: 'blur(2px)' as any,
      }
    : null;

  return (
    <div style={box ? { ...box } : undefined}>
      <div style={wrapStyle}>
        {line.words.map((w, i) => (
          <WordView
            key={i}
            word={w}
            ms={ms}
            fps={fps}
            idx={i}
            style={style}
            opt={opt}
            lineInProgress={lineInProgress}
          />
        ))}
      </div>
    </div>
  );
};

const WordView: React.FC<{
  word: CaptionWord;
  ms: number;
  fps: number;
  idx: number;
  style: CaptionStyle;
  opt: ReturnType<typeof withDefaults>;
  lineInProgress: number;
}> = ({ word, ms, fps, idx, style, opt, lineInProgress }) => {
  const frame = useCurrentFrame();
  const active = isWordActive(word, ms);
  const spoken = ms >= word.startMs;

  const wordFrame = Math.max(0, frame - msToFrames(word.startMs, fps));
  const pop = spring({ frame: wordFrame, fps, config: { damping: 12, mass: 0.5 } });

  let color = opt.accent;
  let transform = '';
  let opacity = 1;

  if (style === 'classic') {
    // words fade + rise in at their own start; whole line stays
    opacity = interpolate(lineInProgress, [0, 160], [0, 1], { extrapolateRight: 'clamp', easing: easeOut });
    if (active) color = lighten(opt.accent);
  } else if (style === 'minimal') {
    opacity = interpolate(lineInProgress, [0, 130], [0, 1], { extrapolateRight: 'clamp', easing: easeOut });
  } else if (style === 'karaoke') {
    // every word visible; active word colored + small bounce
    if (active) {
      color = opt.highlight;
      transform = `scale(${1 + 0.08 * Math.sin(Math.min(1, (ms - word.startMs) / Math.max(1, word.endMs - word.startMs)) * Math.PI)})`;
    } else if (!spoken) {
      color = dim(opt.accent);
    }
  } else if (style === 'tiktok') {
    // typed-on: only words up to now are shown; active word colored + wobble
    if (!spoken) return null;
    opacity = interpolate(wordFrame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });
    transform = `scale(${0.7 + 0.3 * pop})`;
    if (active) {
      color = opt.highlight;
      transform += ` rotate(${interpolate(Math.sin(frame / 2), [-1, 1], [-2, 2])}deg)`;
    }
  } else if (style === 'reels') {
    // big bold; whole short line pops together, active word highlighted
    transform = `scale(${0.6 + 0.4 * pop}) translateY(${interpolate(pop, [0, 1], [10, 0])}px)`;
    opacity = interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
    if (active) color = opt.highlight;
  }

  return (
    <span
      style={{
        color,
        display: 'inline-block',
        opacity,
        transform: transform || undefined,
        transformOrigin: 'center bottom',
        transition: 'color 90ms linear',
        willChange: 'transform, opacity',
      }}
    >
      {word.text}
    </span>
  );
};

// ── helpers ──────────────────────────────────────────────────────────────────
function msToFrames(ms: number, fps: number): number {
  return (ms / 1000) * fps;
}
function lighten(hex: string): string {
  return hex; // classic keeps the base color; placeholder for future brightening
}
function dim(hex: string): string {
  // render un-spoken karaoke words at ~55% so the highlight pops
  const c = hex.replace('#', '');
  if (c.length !== 6) return 'rgba(255,255,255,0.55)';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.5)`;
}
