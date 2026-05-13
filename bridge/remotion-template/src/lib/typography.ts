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
