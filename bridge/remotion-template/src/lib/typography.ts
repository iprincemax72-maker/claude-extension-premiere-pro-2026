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
