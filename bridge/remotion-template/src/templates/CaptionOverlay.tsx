/**
 * TEMPLATE: Caption OVERLAY (transparent bg, for V2 placement)
 *
 * Use only when the user explicitly says: "overlay", "transparent", "for V2",
 * "caption on my speaker", or "alpha".
 *
 * Vibe: word-by-word pop in the bottom-third safe zone with transparent bg
 * so it composites over a speaker on V1. RENDER WITH ALPHA — use ProRes 4444
 * or webm with alpha so the transparency survives.
 *
 * When you render this, the MP4 viewer will show the background as black —
 * that's the transparency. It looks correct when dropped on V2 above the
 * speaker video.
 *
 * EDIT: WORDS, HERO_INDEX.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TIKTOK_CAPTION } from '../lib/typography';
import { wordPop } from '../lib/motion';

export const CaptionOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const WORDS = ['THIS', 'IS', 'WHAT', 'I', 'WANT', 'TO', 'SAY'];
  const HERO_INDEX = -1; // -1 for none, or index of word to accent

  const isVertical = height > width;
  const baseFont = isVertical ? Math.round(width * 0.075) : Math.round(width * 0.05);

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <div style={{
        position: 'absolute',
        left: '6%', right: '6%',
        bottom: '12%',           // bottom-third — never covers the speaker
        textAlign: 'center',
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'baseline',
        gap: `${baseFont * 0.15}px ${baseFont * 0.24}px`,
      }}>
        {WORDS.map((w, i) => {
          const { scale, opacity } = wordPop(frame, { start: 4, index: i, gap: 3 });
          const isHero = i === HERO_INDEX;
          return (
            <span key={i} style={{
              ...TIKTOK_CAPTION,
              fontSize: isHero ? baseFont * 1.1 : baseFont,
              color: isHero ? p.accent : '#fff',
              display: 'inline-block',
              transform: `scale(${scale})`,
              opacity,
            }}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
