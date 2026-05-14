/**
 * TEMPLATE: 3-second logo / brand intro card
 *
 * Use when the prompt is: "3 second intro", "logo intro", "brand intro",
 * "channel intro", "opening card".
 *
 * Vibe: brand name kerns in tight with blur clearing, accent line draws
 * under it, holds, slight outro fade. Premium feel, single visual idea.
 *
 * EDIT: BRAND, TAGLINE, palette.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { kerningIn, blurIn, fadeIn, fadeOut } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const IntroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const p = palettes.modernDark;

  // EDIT THESE:
  const BRAND   = 'CRUXDEV';
  const TAGLINE = 'creative tools';

  // Total duration in this template: 90 frames at 30fps = 3s
  // Last 12 frames fade out
  const exitFade = fadeOut(frame, { start: 78, dur: 12 });

  return (
    <AbsoluteFill style={{ background: p.bg, opacity: exitFade }}>
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          ...TYPE.titleHero,
          color: p.fg,
          letterSpacing: kerningIn(frame, { start: 0, dur: FRAMES.long, from: 30, to: -4 }),
          opacity: blurIn(frame, { start: 0, dur: FRAMES.medium }).opacity,
          filter: `blur(${blurIn(frame, { start: 0, dur: FRAMES.medium }).blur}px)`,
        }}>{BRAND}</div>
        {/* Accent rule that draws in under the brand */}
        <div style={{
          width: `${fadeIn(frame, { start: 18, dur: FRAMES.medium }) * 100}%`,
          height: 4, background: p.accent,
          margin: '18px auto 14px',
          borderRadius: 2,
          transformOrigin: 'left center',
        }} />
        <div style={{
          ...TYPE.caption,
          color: p.muted,
          opacity: fadeIn(frame, { start: 28, dur: FRAMES.short }),
        }}>{TAGLINE}</div>
      </div>
    </AbsoluteFill>
  );
};
