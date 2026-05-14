/**
 * TEMPLATE: Big stat reveal (counter + kicker label)
 *
 * Use when the prompt is: "show 43%", "$1M revenue", "100K subscribers",
 * stat counter, percentage growth, big number reveal.
 *
 * Vibe: tiny uppercase kicker label fades in, then huge number counts up
 * with the expoOut easing, holds at the final value. Subtle gradient bg
 * tint behind for depth, no other distractions.
 *
 * EDIT: NUMBER, KICKER, FORMAT.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { CountUp } from '../lib/numbers';
import { fadeIn } from '../lib/motion';
import { FRAMES } from '../lib/easings';
import { GradientMesh } from '../lib/effects';

export const StatSlam: React.FC = () => {
  const frame = useCurrentFrame();
  const p = palettes.modernDark;

  // EDIT THESE:
  const KICKER = 'YoY growth';
  const TARGET = 43;
  const FORMAT = 'percent' as const;
  const DECIMALS = 0;

  return (
    <AbsoluteFill style={{ background: p.bg }}>
      <GradientMesh a={p.accent} b={p.accent2} c={p.bg} />
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          ...TYPE.caption,
          color: p.accent,
          opacity: fadeIn(frame, { start: 0, dur: FRAMES.short }),
          marginBottom: 18,
        }}>{KICKER}</div>
        <div style={{
          ...TYPE.titleHero,
          fontSize: 240,
          color: p.fg,
          letterSpacing: -8,
          textShadow: `0 12px 40px ${p.shadow}`,
        }}>
          <CountUp frame={frame} start={4} dur={28} to={TARGET}
                   format={FORMAT} decimals={DECIMALS} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
