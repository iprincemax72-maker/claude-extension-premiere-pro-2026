/**
 * TEMPLATE: 3-5 item bullet list with staggered reveal
 *
 * Use when the prompt is: "3 reasons", "5 tips", "numbered list",
 * "key takeaways", "highlights".
 *
 * Vibe: items stagger in left-to-right with numeric prefixes, hold,
 * fade out together at the end. Right-aligned panel so it doesn't
 * conflict with talking-head footage on the left.
 *
 * EDIT: ITEMS, TITLE.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { fadeIn, slideIn, fadeOut } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const ListReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const TITLE = '3 reasons';
  const ITEMS = [
    'It saves time on every render',
    'Looks consistent across prompts',
    'Catches layout bugs automatically',
  ];

  const titleOp = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const out = fadeOut(frame, { start: durationInFrames - 14, dur: 14 });

  return (
    <AbsoluteFill style={{ background: p.bg, opacity: out }}>
      <div style={{
        position: 'absolute',
        right: '6%',
        top: '50%', transform: 'translateY(-50%)',
        width: '46%',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{
          ...TYPE.caption,
          color: p.accent,
          opacity: titleOp,
          marginBottom: 14,
        }}>{TITLE}</div>
        {ITEMS.map((item, i) => {
          const op = fadeIn(frame, { start: 8 + i * 6, dur: FRAMES.short });
          const tx = slideIn(frame, { start: 8 + i * 6, dur: FRAMES.short, from: 60 });
          return (
            <div key={i} style={{
              display: 'flex', gap: 22, alignItems: 'baseline',
              opacity: op, transform: `translateX(${tx}px)`,
            }}>
              <span style={{
                ...TYPE.caption,
                color: p.accent,
                fontSize: 22,
                minWidth: 36,
              }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{
                fontFamily: '"SF Pro Display","Inter",sans-serif',
                fontWeight: 700, fontSize: 42,
                letterSpacing: -0.8,
                lineHeight: 1.3,
                color: p.fg,
              }}>{item}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
