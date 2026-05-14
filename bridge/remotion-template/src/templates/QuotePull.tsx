/**
 * TEMPLATE: Editorial pull quote
 *
 * Use when the prompt is: "pull quote", "quote card", "highlight quote",
 * "thesis line", "memorable line".
 *
 * Vibe: italic serif quote with a thick accent bar to the left. Slow
 * blur-in entry, holds, attribution sits beneath in muted caption case.
 *
 * EDIT: QUOTE_TEXT, ATTRIBUTION.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { blurIn, fadeOut } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const QuotePull: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const QUOTE_TEXT  = 'The biggest risk is not taking any risk.';
  const ATTRIBUTION = 'Mark Zuckerberg';

  const { opacity, blur } = blurIn(frame, { start: 4, dur: FRAMES.long });
  const out = fadeOut(frame, { start: durationInFrames - 14, dur: 14 });

  return (
    <AbsoluteFill style={{ background: p.bg }}>
      <div style={{
        position: 'absolute',
        left: '8%', right: '8%',
        top: '50%', transform: 'translateY(-50%)',
        opacity: opacity * out,
        filter: `blur(${blur}px)`,
        display: 'flex', alignItems: 'stretch', gap: 32,
      }}>
        <div style={{ width: 6, background: p.accent, borderRadius: 3 }} />
        <div style={{ flex: 1 }}>
          <div style={{
            ...TYPE.editorial,
            color: p.fg,
            fontSize: 72,
            lineHeight: 1.18,
          }}>&ldquo;{QUOTE_TEXT}&rdquo;</div>
          <div style={{
            ...TYPE.caption,
            color: p.muted,
            marginTop: 22,
          }}>— {ATTRIBUTION}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
