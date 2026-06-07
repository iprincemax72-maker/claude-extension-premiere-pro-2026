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
 *   props.style:  one of the styles
 *   props.options: look/behaviour knobs (color, font, shadow, stroke, position,
 *                  per-line variety, …)
 *   props.fps / props.width / props.height  (used by Root.tsx calculateMetadata)
 *
 * Timing is REAL: every word carries startMs/endMs from the ASR, so captions
 * land exactly on the spoken word.
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';

export type CaptionWord = { text: string; startMs: number; endMs: number; kw?: boolean };
export type CaptionLine = { words: CaptionWord[]; startMs: number; endMs: number };
export type CaptionStyle = 'classic' | 'karaoke' | 'reels' | 'tiktok' | 'minimal' | 'hormozi'
  | 'fadeup' | 'fadedown' | 'fadeleft' | 'faderight'
  | 'wordup' | 'worddown' | 'wordleft' | 'wordright';

export type CaptionOptions = {
  accent?: string;          // base text color
  highlight?: string;       // active-word highlight color
  fontSize?: number;        // px override (else a per-style default)
  fontScale?: number;       // multiplier on the per-style default size (0.7–1.5)
  fontFamily?: string;
  fontWeight?: number;      // 400–900
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;   // em
  lineHeight?: number;
  position?: 'top' | 'middle' | 'bottom' | 'custom';
  customX?: number;         // 0..1 — caption block CENTER x (only when position==='custom')
  customY?: number;         // 0..1 — caption block CENTER y
  uppercase?: boolean;
  animateIn?: boolean;      // entrance motion on/off
  box?: boolean;            // semi-opaque pill behind the line for readability
  shadow?: number;          // 0..1 drop-shadow strength (0 = off)
  stroke?: number;          // px text outline width (0 = off; per-style default otherwise)
  strokeColor?: string;
  varyPerLine?: boolean;    // each line a different color + entrance animation
  keywords?: boolean;       // colour important keywords persistently (submagic-style)
};

export type CaptionsProps = {
  lines: CaptionLine[];
  style: CaptionStyle;
  options?: CaptionOptions;
  fps?: number;
  width?: number;
  height?: number;
};

const DEFAULTS = {
  accent: '#FFFFFF',
  highlight: '#E2885F',
  fontSize: null as number | null,
  fontScale: 1,
  fontFamily:
    '"Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  fontWeight: 800,
  align: 'center' as 'left' | 'center' | 'right',
  letterSpacing: null as number | null,
  lineHeight: 1.12,
  position: 'bottom' as 'top' | 'middle' | 'bottom' | 'custom',
  customX: 0.5,
  customY: 0.85,
  uppercase: false,
  animateIn: true,
  box: false,
  shadow: 0.55,
  stroke: null as number | null,
  strokeColor: 'rgba(0,0,0,0.92)',
  varyPerLine: false,
  keywords: false,
};

// per-style default font size as a fraction of comp height
const SIZE_FRACTION: Record<CaptionStyle, number> = {
  classic: 0.046,
  karaoke: 0.05,
  reels: 0.082,
  tiktok: 0.072,
  minimal: 0.04,
  hormozi: 0.078,
  fadeup: 0.05,
  fadedown: 0.05,
  fadeleft: 0.05,
  faderight: 0.05,
  wordup: 0.05,
  worddown: 0.05,
  wordleft: 0.05,
  wordright: 0.05,
};

// Directional fade family — axis + sign of each unit's initial offset, and
// whether it animates per word (true) or per letter (false). Up is the original
// Fade Up / Word by Word; down/left/right are siblings.
const FADE_DEFS: Record<string, { axis: 'x' | 'y'; sign: number; word: boolean }> = {
  fadeup:    { axis: 'y', sign:  1, word: false },
  fadedown:  { axis: 'y', sign: -1, word: false },
  fadeleft:  { axis: 'x', sign: -1, word: false },
  faderight: { axis: 'x', sign:  1, word: false },
  wordup:    { axis: 'y', sign:  1, word: true  },
  worddown:  { axis: 'y', sign: -1, word: true  },
  wordleft:  { axis: 'x', sign: -1, word: true  },
  wordright: { axis: 'x', sign:  1, word: true  },
};

// colors cycled across lines when varyPerLine is on
const LINE_PALETTE = ['#E2885F', '#5AA9FF', '#4ECB71', '#F5C542', '#FF5D8F', '#B98CFF'];

function withDefaults(o: CaptionOptions | undefined, style: CaptionStyle, height: number) {
  const m = { ...DEFAULTS, ...(o || {}) };
  const base = m.fontSize ?? Math.round(height * SIZE_FRACTION[style]);
  const scale = typeof m.fontScale === 'number' && m.fontScale > 0 ? m.fontScale : 1;
  const fontSize = Math.round(base * scale);
  return { ...m, fontSize };
}

const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Per-line entrance animations (cycled by line index when varyPerLine is on).
// Each takes eased progress p (0..1) and returns a transform + opacity.
const ENTRANCES: Array<(p: number) => { transform: string; opacity: number }> = [
  (p) => ({ transform: `scale(${(0.62 + 0.38 * p).toFixed(3)})`, opacity: clamp01(p * 1.6) }),            // pop
  (p) => ({ transform: `translateY(${((1 - p) * 64).toFixed(1)}px)`, opacity: clamp01(p * 1.6) }),         // slide-up
  (p) => ({ transform: `translateX(${((1 - p) * -76).toFixed(1)}px)`, opacity: clamp01(p * 1.6) }),        // slide-in
  (p) => ({ transform: `scale(${(1.28 - 0.28 * p).toFixed(3)})`, opacity: clamp01(p * 1.6) }),             // zoom
  (p) => ({ transform: `translateY(${((1 - p) * -48).toFixed(1)}px)`, opacity: clamp01(p * 1.6) }),        // drop
];

// The line that should be on screen at `ms` (and its index). Small lead-in so
// the line appears a hair before the first word is spoken (feels snappier).
function activeLineIndex(lines: CaptionLine[], ms: number, leadMs = 80): number {
  for (let i = 0; i < lines.length; i++) {
    if (ms >= lines[i].startMs - leadMs && ms <= lines[i].endMs + 120) return i;
  }
  return -1;
}

function isWordActive(w: CaptionWord, ms: number): boolean {
  return ms >= w.startMs && ms < w.endMs;
}

export const Captions: React.FC<CaptionsProps> = ({ lines, style, options }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const opt = withDefaults(options, style, height);
  const all = lines || [];

  const lineIdx = activeLineIndex(all, ms);
  const line = lineIdx >= 0 ? all[lineIdx] : null;

  const isCustom = opt.position === 'custom';
  const justify =
    opt.position === 'top' ? 'flex-start' : opt.position === 'middle' ? 'center' : 'flex-end';
  const pad = opt.position === 'middle' ? 0 : Math.round(height * 0.11);
  const cx = clamp01(typeof opt.customX === 'number' ? opt.customX : 0.5);
  const cy = clamp01(typeof opt.customY === 'number' ? opt.customY : 0.85);

  // shadow + stroke (explicit options, else sensible per-style defaults)
  const shadowAmt = typeof opt.shadow === 'number' ? opt.shadow : 0.55;
  const strokeW = typeof opt.stroke === 'number'
    ? opt.stroke
    : (style === 'reels' || style === 'tiktok' || style === 'hormozi' ? 2 : 0);
  const textShadow = shadowAmt > 0
    ? `0 ${(2.5 * shadowAmt).toFixed(1)}px ${Math.round(12 * shadowAmt)}px rgba(0,0,0,${(0.7 * shadowAmt).toFixed(2)}), 0 0 2px rgba(0,0,0,${(0.5 * shadowAmt).toFixed(2)})`
    : 'none';
  const ls = typeof opt.letterSpacing === 'number'
    ? `${opt.letterSpacing}em`
    : (opt.uppercase ? '0.01em' : 0);

  const baseTextStyle: CSSProperties = {
    fontFamily: opt.fontFamily,
    fontWeight: opt.fontWeight,
    fontSize: opt.fontSize,
    lineHeight: opt.lineHeight,
    color: opt.accent,
    textAlign: opt.align,
    textTransform: opt.uppercase ? 'uppercase' : 'none',
    letterSpacing: ls,
    textShadow,
    // Premiere-Pro-style stroke: a clean OUTER stroke (paint-order draws the
    // stroke BEHIND the fill so it never eats the letter). Width is proportional
    // to the type size (resolution-independent) and doubled because the centered
    // webkit stroke only shows its outer half once the fill paints over the inner
    // half — so the slider value reads as the true outer thickness.
    WebkitTextStroke: strokeW > 0 ? `${(strokeW * 0.02 * opt.fontSize).toFixed(2)}px ${opt.strokeColor}` : undefined,
    paintOrder: 'stroke fill' as any,
    padding: '0 6%',
    maxWidth: '92%',
  };

  const lineNode = line ? (
    <LineView
      line={line}
      lineIndex={lineIdx}
      ms={ms}
      fps={fps}
      style={style}
      opt={opt}
      textStyle={baseTextStyle}
    />
  ) : null;

  if (isCustom) {
    return (
      <AbsoluteFill style={{ background: 'transparent' }}>
        {lineNode ? (
          <div
            style={{
              position: 'absolute',
              left: `${cx * 100}%`,
              top: `${cy * 100}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '86%',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {lineNode}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

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
      {lineNode}
    </AbsoluteFill>
  );
};

const LineView: React.FC<{
  line: CaptionLine;
  lineIndex: number;
  ms: number;
  fps: number;
  style: CaptionStyle;
  opt: ReturnType<typeof withDefaults>;
  textStyle: CSSProperties;
}> = ({ line, lineIndex, ms, fps, style, opt, textStyle }) => {
  const frame = useCurrentFrame();
  const { width: vidW } = useVideoConfig();
  const sinceStart = ms - line.startMs;
  const lineInProgress = Math.max(0, sinceStart);

  // Keep every word of the line on ONE row — shrink the font to fit the frame width
  // (deterministic estimate; no DOM measurement needed in headless render). Matches
  // the panel preview so "N words per line" looks the same on the timeline.
  const baseFont = (typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 40);
  const lineText = line.words.map((w) => w.text).join(' ');
  const estWidth = lineText.length * baseFont * 0.6;            // ~avg glyph width for bold sans
  const availWidth = vidW * 0.86 * (opt.box ? 0.9 : 1);
  const fitScale = estWidth > availWidth ? Math.max(0.4, availWidth / estWidth) : 1;
  const fittedFont = Math.round(baseFont * fitScale);

  // per-line variety: a rotating color + a rotating entrance animation
  const vary = !!opt.varyPerLine;
  const hlColor = vary ? LINE_PALETTE[lineIndex % LINE_PALETTE.length] : opt.highlight;

  // line entrance (used by reels/tiktok always; by every style when varyPerLine)
  const lineSpring = opt.animateIn
    ? spring({ frame: Math.max(0, frame - msToFrames(line.startMs, fps)), fps, config: { damping: 14, mass: 0.6 } })
    : 1;
  const entranceP = clamp01(interpolate(lineInProgress, [0, 300], [0, 1], { extrapolateRight: 'clamp', easing: easeOut }));
  const varyEntrance = vary ? ENTRANCES[lineIndex % ENTRANCES.length](entranceP) : null;

  const wrapStyle: CSSProperties = {
    ...textStyle,
    fontSize: fittedFont,                 // shrink-to-fit so the line never wraps
    maxWidth: 'none',
    display: 'flex',
    flexWrap: 'nowrap',
    whiteSpace: 'nowrap',
    justifyContent: opt.align === 'left' ? 'flex-start' : opt.align === 'right' ? 'flex-end' : 'center',
    gap: style === 'reels' || style === 'hormozi' ? '0.12em 0.28em' : '0.1em 0.26em',
    transform: varyEntrance
      ? varyEntrance.transform
      : (style === 'reels' || style === 'tiktok' ? `scale(${0.86 + 0.14 * lineSpring})` : undefined),
    opacity: varyEntrance ? varyEntrance.opacity : 1,
  };

  const box = opt.box
    ? { background: 'rgba(0,0,0,0.42)', borderRadius: 14, padding: '0.28em 0.6em' }
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
            hlColor={hlColor}
            vary={vary}
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
  hlColor: string;
  vary: boolean;
  lineInProgress: number;
}> = ({ word, ms, fps, idx, style, opt, hlColor, vary, lineInProgress }) => {
  const frame = useCurrentFrame();
  const active = isWordActive(word, ms);
  const spoken = ms >= word.startMs;

  const wordFrame = Math.max(0, frame - msToFrames(word.startMs, fps));
  const pop = spring({ frame: wordFrame, fps, config: { damping: 12, mass: 0.5 } });

  // keyword highlighting: important words stay coloured even when not the active word
  const isKw = !!(opt.keywords && word.kw);
  const baseColor = isKw ? hlColor : opt.accent;

  // DIRECTIONAL FADE FAMILY — letters (fadeXxx) or whole words (wordXxx) fade in
  // while sliding from a direction (up/down/left/right). Up is the original Fade
  // Up / Word by Word. Clean & professional: plain colour throughout; highlight
  // only in keyword mode. ms-based, so it's smooth at 30 or 60fps.
  const fadeDef = FADE_DEFS[style];
  if (fadeDef) {
    const col = isKw ? hlColor : opt.accent;
    const slide = (p: number, mag: number) => {
      const d = ((1 - p) * fadeDef.sign * mag).toFixed(3);
      return fadeDef.axis === 'x' ? `translateX(${d}em)` : `translateY(${d}em)`;
    };
    if (fadeDef.word) {
      // word-by-word: each whole word fades in + slides as it's spoken. Words
      // reserve their space (fade in place) so the line stays centered/stable.
      const DUR = 300;
      const p = clamp01(interpolate(ms, [word.startMs, word.startMs + DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut }));
      return (
        <span style={{ display: 'inline-block', color: col, opacity: p, transform: slide(p, 0.4), transformOrigin: 'center bottom', transition: 'color 90ms linear', willChange: 'transform, opacity' }}>{word.text}</span>
      );
    }
    // letter-by-letter: each character fades in + slides, staggered.
    const letters = Array.from(word.text);
    const PER = 26, DUR = 320;   // ms stagger per letter, ms per-letter fade
    return (
      <span style={{ display: 'inline-block', color: col, transformOrigin: 'center bottom', transition: 'color 90ms linear' }}>
        {letters.map((ch, li) => {
          const st = word.startMs + li * PER;
          const p = clamp01(interpolate(ms, [st, st + DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut }));
          return (
            <span key={li} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: p, transform: slide(p, 0.5), willChange: 'transform, opacity' }}>{ch}</span>
          );
        })}
      </span>
    );
  }

  let color = baseColor;
  let transform = '';
  let opacity = 1;
  let background: string | undefined;
  let padding: string | undefined;
  let borderRadius: number | undefined;

  if (style === 'hormozi') {
    // big bold, all words visible; the active word gets a solid highlight BOX
    // behind it (the viral subtitle look). Stroke comes from baseTextStyle.
    if (active) {
      color = '#15110d';
      background = hlColor;
      padding = '0.02em 0.12em';
      borderRadius = 8;
      transform = `scale(${(1 + 0.06 * Math.sin(clamp01((ms - word.startMs) / Math.max(1, word.endMs - word.startMs)) * Math.PI)).toFixed(3)})`;
    } else {
      color = baseColor;
    }
  } else if (style === 'classic') {
    opacity = interpolate(lineInProgress, [0, 160], [0, 1], { extrapolateRight: 'clamp', easing: easeOut });
    if (vary) color = hlColor;
  } else if (style === 'minimal') {
    opacity = interpolate(lineInProgress, [0, 130], [0, 1], { extrapolateRight: 'clamp', easing: easeOut });
    if (vary) color = hlColor;
  } else if (style === 'karaoke') {
    if (active) {
      color = hlColor;
      transform = `scale(${1 + 0.08 * Math.sin(Math.min(1, (ms - word.startMs) / Math.max(1, word.endMs - word.startMs)) * Math.PI)})`;
    } else if (!spoken) {
      color = dim(opt.accent);
    }
  } else if (style === 'tiktok') {
    if (!spoken) return null;
    opacity = interpolate(wordFrame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });
    transform = `scale(${0.7 + 0.3 * pop})`;
    if (active) {
      color = hlColor;
      transform += ` rotate(${interpolate(Math.sin(frame / 2), [-1, 1], [-2, 2])}deg)`;
    }
  } else if (style === 'reels') {
    transform = `scale(${0.6 + 0.4 * pop}) translateY(${interpolate(pop, [0, 1], [10, 0])}px)`;
    opacity = interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
    if (active) color = hlColor;
  }

  return (
    <span
      style={{
        color,
        background,
        padding,
        borderRadius,
        display: 'inline-block',
        opacity,
        transform: transform || undefined,
        transformOrigin: 'center bottom',
        transition: 'color 90ms linear',
        willChange: 'transform, opacity',
        // when there's a highlight box, drop the per-letter stroke so the box reads clean
        WebkitTextStroke: background ? '0' : undefined,
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
function dim(hex: string): string {
  // render un-spoken karaoke words at ~50% so the highlight pops
  const c = (hex || '').replace('#', '');
  if (c.length !== 6) return 'rgba(255,255,255,0.5)';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.5)`;
}
