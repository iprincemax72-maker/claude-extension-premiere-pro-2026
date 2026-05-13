/**
 * Typography scales + recipes. Premium short-form needs HEAVY, tight,
 * letter-spaced text. These defaults are tuned for 1080×1920 vertical
 * and 1920×1080 horizontal at the same time.
 *
 * Use a recipe in your component:
 *   const titleStyle = TYPE.titleHero;
 *   return <div style={titleStyle}>HELLO</div>;
 */

import type { CSSProperties } from 'react';

// Stack tuned for impact: SF Pro Display → Inter → Helvetica → system
const SANS_HEAVY = '"SF Pro Display","Inter","Helvetica Neue",Helvetica,Arial,sans-serif';
const SERIF      = '"Charter","Georgia","Times New Roman",serif';
const MONO       = '"SF Mono","JetBrains Mono","Menlo",monospace';
const ARIAL_BOLD = 'Arial,Helvetica,sans-serif';

export const TYPE: Record<string, CSSProperties> = {
  // Big hero title — fills the screen, max impact
  titleHero: {
    fontFamily: SANS_HEAVY,
    fontWeight: 800,
    fontSize: 160,
    letterSpacing: -4,
    lineHeight: 1.02,
  },
  // Medium title — cards, lower thirds
  titleMd: {
    fontFamily: SANS_HEAVY,
    fontWeight: 700,
    fontSize: 88,
    letterSpacing: -2,
    lineHeight: 1.08,
  },
  // Body — descriptions, dialogue, subtitles
  body: {
    fontFamily: SANS_HEAVY,
    fontWeight: 500,
    fontSize: 38,
    letterSpacing: -0.4,
    lineHeight: 1.4,
  },
  // Caption — small label, kicker, timestamp
  caption: {
    fontFamily: SANS_HEAVY,
    fontWeight: 600,
    fontSize: 22,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    lineHeight: 1,
  },
  // Mono — code, technical readouts
  mono: {
    fontFamily: MONO,
    fontWeight: 500,
    fontSize: 32,
    letterSpacing: 0,
    lineHeight: 1.4,
  },
  // Editorial — quote / definition / serif accent
  editorial: {
    fontFamily: SERIF,
    fontWeight: 500,
    fontSize: 64,
    letterSpacing: -0.5,
    lineHeight: 1.2,
    fontStyle: 'italic',
  },

  // ─── TRENDING 2025-2026 ───

  // BRAT — lowercase Arial 900, tight tracking. Charli XCX album style.
  bratLockup: {
    fontFamily: ARIAL_BOLD,
    fontWeight: 900,
    fontSize: 220,
    letterSpacing: -8,
    lineHeight: 0.9,
    textTransform: 'lowercase',
  },

  // Coquette — italic serif, dainty, ribbon-pretty.
  coquetteTitle: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: 110,
    letterSpacing: 1,
    lineHeight: 1.1,
    fontStyle: 'italic',
  },

  // Brutalist label — massive uppercase, condensed feel.
  brutalistLabel: {
    fontFamily: SANS_HEAVY,
    fontWeight: 900,
    fontSize: 180,
    letterSpacing: -2,
    lineHeight: 0.88,
    textTransform: 'uppercase',
  },

  // Caption Y2K — chunky monospace, retro tech.
  y2kCaption: {
    fontFamily: MONO,
    fontWeight: 700,
    fontSize: 56,
    letterSpacing: 0,
    lineHeight: 1.1,
    textTransform: 'uppercase',
  },

  // Lyric — center-screen song-lyric overlay, big and tight.
  lyric: {
    fontFamily: SANS_HEAVY,
    fontWeight: 800,
    fontSize: 100,
    letterSpacing: -2,
    lineHeight: 1.05,
    textAlign: 'center',
  },

  // Editorial xl — for "headline" magazine moments. Large italic serif.
  editorialXl: {
    fontFamily: SERIF,
    fontWeight: 500,
    fontSize: 140,
    letterSpacing: -1.5,
    lineHeight: 1.05,
    fontStyle: 'italic',
  },
};

// Common TikTok-style caption (white-on-dark, heavy stroke).
// Use as the base for word-by-word caption pops.
export const TIKTOK_CAPTION: CSSProperties = {
  fontFamily: SANS_HEAVY,
  fontWeight: 800,
  fontSize: 80,
  letterSpacing: -1,
  color: '#fff',
  textTransform: 'uppercase',
  textAlign: 'center',
  // Stroke is faked via multiple text-shadows for fat outline
  textShadow:
    '0 0 6px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95),' +
    '0 0 6px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95),' +
    '4px 4px 0 rgba(0,0,0,0.6)',
};

// Beat-caption — yellow karaoke highlight on currently-spoken word.
// Use the `highlighter()` motion helper with this style.
export const KARAOKE_CAPTION: CSSProperties = {
  ...TIKTOK_CAPTION,
  color: '#ffe600',
  textShadow:
    '0 0 4px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1),' +
    '0 0 4px rgba(0,0,0,1), 3px 3px 0 rgba(0,0,0,0.8)',
};

// Subtle subtitle — for talking-head clips where you don't want to
// scream. Smaller, neutral, soft stroke.
export const SOFT_CAPTION: CSSProperties = {
  fontFamily: SANS_HEAVY,
  fontWeight: 700,
  fontSize: 54,
  letterSpacing: -0.5,
  color: '#fff',
  textAlign: 'center',
  textShadow: '0 2px 14px rgba(0,0,0,0.7)',
};

// Highlighted-keyword wrap — for inline highlighter look. Pair with
// `highlighter()` motion helper on a sibling absolute-positioned bar.
export const HIGHLIGHT_BAR_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0, right: 0, bottom: 0, top: 0,
  background: '#ffe600',
  zIndex: -1,
  transformOrigin: 'left center',
  borderRadius: 6,
};

// Chrome / metallic text — Y2K reflective look.
export const CHROME_TEXT_STYLE: CSSProperties = {
  fontFamily: SANS_HEAVY,
  fontWeight: 900,
  fontSize: 180,
  letterSpacing: -4,
  textTransform: 'uppercase',
  background: 'linear-gradient(180deg, #fafbff 0%, #c0c5d4 35%, #6e7088 50%, #c0c5d4 65%, #fafbff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  filter: 'drop-shadow(0 4px 12px rgba(0,200,255,0.5))',
};

// Glitch base — three offset copies of the same text in different colors.
// Component should render three absolutely-stacked spans with these colors
// and offset by the `glitch()` helper output.
export const GLITCH_LAYERS = {
  red:   { color: '#ff0044', mixBlendMode: 'screen' as const },
  green: { color: '#fff' },
  blue:  { color: '#00ffe1', mixBlendMode: 'screen' as const },
};

/* ═══════════════════════════════════════════════════════════════════════
   TEXT EFFECT RECIPES — drop-in text styles for common visual effects.
   Each is a CSSProperties object you spread onto a text element.

   Examples:
     <h1 style={{ ...TYPE.titleHero, ...TEXT_FX.outlined('#fff', 6) }}>BOLD</h1>
     <h1 style={{ ...TYPE.titleHero, ...TEXT_FX.neon('#ff3d8a') }}>GLOW</h1>
     <h1 style={{ ...TYPE.titleHero, ...TEXT_FX.gradient('#ff3d8a', '#6b3df5') }}>HOT</h1>
   ═══════════════════════════════════════════════════════════════════════ */
export const TEXT_FX = {
  /** Outlined / stroked text — visible text fill with a contrasting border. */
  outlined: (strokeColor: string, strokeWidth: number = 6, fillColor: string = '#fff'): CSSProperties => ({
    color: fillColor,
    WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
    paintOrder: 'stroke fill',
  }),

  /** Outline-only — transparent fill, only the stroke is visible. */
  outlineOnly: (strokeColor: string, strokeWidth: number = 4): CSSProperties => ({
    color: 'transparent',
    WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
  }),

  /** Neon glow — colored text with a multi-layered halo. */
  neon: (color: string = '#ff3d8a', intensity: number = 1): CSSProperties => ({
    color,
    textShadow: [
      `0 0 ${4 * intensity}px ${color}`,
      `0 0 ${10 * intensity}px ${color}`,
      `0 0 ${22 * intensity}px ${color}80`,
      `0 0 ${44 * intensity}px ${color}40`,
    ].join(', '),
  }),

  /** Soft glow — subtle halo, no oversaturation. */
  softGlow: (color: string = '#fff', intensity: number = 1): CSSProperties => ({
    color,
    textShadow: `0 0 ${18 * intensity}px ${color}aa, 0 0 ${36 * intensity}px ${color}55`,
  }),

  /** Hard shadow drop — comic-book / sticker style. */
  hardDrop: (color: string = '#000', x: number = 6, y: number = 6): CSSProperties => ({
    textShadow: `${x}px ${y}px 0 ${color}`,
  }),

  /** Stacked hard drops — layered 3D / retro feel. */
  stackDrop: (color: string = '#ff5e5b', steps: number = 4, step: number = 4): CSSProperties => {
    const shadows = [];
    for (let i = 1; i <= steps; i++) shadows.push(`${i * step}px ${i * step}px 0 ${color}`);
    return { textShadow: shadows.join(', ') };
  },

  /** Vertical gradient fill (linear). */
  gradient: (top: string, bottom: string, angle: number = 180): CSSProperties => ({
    background: `linear-gradient(${angle}deg, ${top} 0%, ${bottom} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }),

  /** Chrome / metallic gradient (silver). */
  chrome: (): CSSProperties => ({
    background: 'linear-gradient(180deg, #fafbff 0%, #c0c5d4 35%, #6e7088 50%, #c0c5d4 65%, #fafbff 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    filter: 'drop-shadow(0 4px 12px rgba(0,200,255,0.5))',
  }),

  /** Gold foil gradient. */
  gold: (): CSSProperties => ({
    background: 'linear-gradient(180deg, #fff4d4 0%, #f0c460 35%, #b8860b 55%, #f0c460 75%, #fff4d4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }),

  /** Holographic shift — multi-color iridescent gradient. */
  holographic: (): CSSProperties => ({
    background: 'linear-gradient(90deg, #ff3d8a 0%, #ffd43d 20%, #5eb6e8 40%, #6b3df5 60%, #ff3d8a 80%, #ffd43d 100%)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }),

  /** Embossed — raised look using inset shadow trickery. */
  embossed: (color: string = '#1a1a1c', light: string = 'rgba(255,255,255,0.4)', dark: string = 'rgba(0,0,0,0.6)'): CSSProperties => ({
    color,
    textShadow: `-1px -1px 0 ${light}, 2px 2px 4px ${dark}`,
  }),

  /** Debossed — pressed-in look. */
  debossed: (color: string = '#1a1a1c'): CSSProperties => ({
    color,
    textShadow: '1px 1px 0 rgba(255,255,255,0.4), -1px -1px 1px rgba(0,0,0,0.5)',
  }),

  /** Letterpress — vintage paper-pressed feel. */
  letterpress: (bg: string = '#f4ead3'): CSSProperties => ({
    color: bg,
    textShadow: '0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.3)',
  }),

  /** Sticker style — text on solid pad with rotation hint. */
  sticker: (bg: string = '#ff5e5b', color: string = '#fff', rotation: number = -2): CSSProperties => ({
    display: 'inline-block',
    background: bg,
    color,
    padding: '8px 18px',
    borderRadius: 8,
    transform: `rotate(${rotation}deg)`,
    boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
  }),

  /** Tape strip — text on a piece of washi-tape style background. */
  tapeStrip: (bg: string = '#ffe178'): CSSProperties => ({
    display: 'inline-block',
    background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%), ${bg}`,
    padding: '6px 24px',
    transform: 'rotate(-3deg)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
  }),

  /** Highlighter marker behind text. */
  highlight: (markerColor: string = '#ffe600'): CSSProperties => ({
    background: `linear-gradient(180deg, transparent 60%, ${markerColor} 60%, ${markerColor} 90%, transparent 90%)`,
    display: 'inline',
    padding: '0 4px',
  }),

  /** Underline — solid thick underline that lives in the text baseline. */
  underline: (color: string = 'currentColor', thickness: number = 4): CSSProperties => ({
    textDecoration: `underline ${color} ${thickness}px`,
    textUnderlineOffset: `${thickness + 2}px`,
  }),

  /** Strikethrough. */
  strikethrough: (color: string = 'currentColor'): CSSProperties => ({
    textDecoration: `line-through ${color} 3px`,
  }),

  /** Magazine-style condensed mega-title (very tight + very wide). */
  magazineCondensed: (): CSSProperties => ({
    fontStretch: 'condensed',
    letterSpacing: '-2px',
    lineHeight: 0.85,
  }),

  /** Wide tracking — luxury / spaced-out caps. */
  wideTrack: (px: number = 8): CSSProperties => ({
    letterSpacing: px + 'px',
    textTransform: 'uppercase',
  }),
};
