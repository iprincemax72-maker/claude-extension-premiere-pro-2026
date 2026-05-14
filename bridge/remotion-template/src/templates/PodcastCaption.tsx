/**
 * TEMPLATE: Kinetic caption — STANDALONE version
 *
 * Use when the prompt is: "caption", "kinetic caption", "title caption",
 * "make a caption that says X" — ANY caption ask that doesn't say
 * "overlay" or "transparent" or "for V2".
 *
 * Vibe: big bold word-by-word reveal CENTERED in the frame, with a
 * subtle dark vignette so the text has presence on its own (no need
 * to drop on V2 to look right). Looks great standalone, also fine to
 * place on V1 with footage above it.
 *
 * If you specifically need a TRANSPARENT caption that overlays a speaker
 * on V2, use CaptionOverlay.tsx instead.
 *
 * EDIT: WORDS, HERO_INDEX (which word gets the accent color), palette.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TIKTOK_CAPTION } from '../lib/typography';
import { wordPop } from '../lib/motion';
import { Vignette } from '../lib/effects';

export const PodcastCaption: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE: the caption broken into word tokens.
  const WORDS = ['MY', 'SECRET', 'TO', 'FOCUS'];
  // Which word gets the accent color (-1 for none, last word is common).
  const HERO_INDEX = WORDS.length - 1;

  // Auto-scale font for aspect ratio — keep it readable on horizontal AND
  // vertical without manual tuning.
  const isVertical = height > width;
  const baseFont = isVertical ? Math.round(width * 0.075) : Math.round(width * 0.058);

  return (
    <AbsoluteFill style={{ background: p.bg }}>
      <Vignette strength={0.55} />
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '88%',
        textAlign: 'center',
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'baseline',
        gap: `${baseFont * 0.15}px ${baseFont * 0.24}px`,
      }}>
        {WORDS.map((w, i) => {
          const { scale, opacity } = wordPop(frame, { start: 4, index: i, gap: 4 });
          const isHero = i === HERO_INDEX;
          return (
            <span key={i} style={{
              ...TIKTOK_CAPTION,
              fontSize: isHero ? baseFont * 1.15 : baseFont,
              color: isHero ? p.accent : '#fff',
              display: 'inline-block',
              transform: `scale(${scale})`,
              opacity,
              textShadow: isHero
                ? `0 0 24px ${p.accent}66, 0 6px 12px rgba(0,0,0,0.7), 4px 4px 0 rgba(0,0,0,0.6)`
                : TIKTOK_CAPTION.textShadow,
            }}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
