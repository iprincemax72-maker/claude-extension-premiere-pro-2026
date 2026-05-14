/**
 * TEMPLATE: Before vs After split-screen
 *
 * Use when the prompt is: "before/after", "then vs now", "comparison",
 * "transformation", "Day 1 vs Day 30".
 *
 * Vibe: vertical split, left label faded, right label punchy. Thin
 * accent rule down the middle. Labels fade in staggered.
 *
 * EDIT: LEFT_LABEL, RIGHT_LABEL, LEFT_BG, RIGHT_BG.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { fadeIn, fadeOut } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const BeforeAfter: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const LEFT_LABEL  = 'BEFORE';
  const RIGHT_LABEL = 'AFTER';
  const LEFT_BG  = '#2a2620';   // dim, drained
  const RIGHT_BG = '#3a2418';   // warm, alive

  const leftOp  = fadeIn(frame, { start: 0,  dur: FRAMES.short });
  const rightOp = fadeIn(frame, { start: 10, dur: FRAMES.short });
  const out = fadeOut(frame, { start: durationInFrames - 14, dur: 14 });

  return (
    <AbsoluteFill style={{ display: 'flex', opacity: out }}>
      <div style={{
        flex: 1, background: LEFT_BG,
        filter: 'grayscale(0.5) brightness(0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: leftOp,
      }}>
        <div style={{ ...TYPE.titleMd, color: p.muted, letterSpacing: 2 }}>
          {LEFT_LABEL}
        </div>
      </div>
      {/* center accent stripe */}
      <div style={{
        width: 4, background: p.accent,
        boxShadow: `0 0 30px ${p.accent}`,
      }} />
      <div style={{
        flex: 1, background: RIGHT_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: rightOp,
      }}>
        <div style={{ ...TYPE.titleMd, color: p.fg, letterSpacing: 2 }}>
          {RIGHT_LABEL}
        </div>
      </div>
    </AbsoluteFill>
  );
};
