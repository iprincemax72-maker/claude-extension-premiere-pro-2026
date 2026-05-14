/**
 * TEMPLATE: Lower third (name + role bottom-left)
 *
 * Use when the prompt is: "lower third", "name card", "introduce guest",
 * "speaker label".
 *
 * Vibe: slides in from left, holds, slides out at end. Thick accent stripe
 * on the left edge. Bottom-left placement so it never covers the face.
 *
 * EDIT: NAME, ROLE.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { slideIn, fadeIn, fadeOut } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const LowerThird: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const NAME = 'Jane Doe';
  const ROLE = 'Founder · Acme Inc.';

  const tx = slideIn(frame, { start: 0, dur: FRAMES.medium, from: -80 });
  const inOp = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const outOp = fadeOut(frame, { start: durationInFrames - 14, dur: 14 });

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <div style={{
        position: 'absolute',
        left: '6%',
        bottom: '12%',
        transform: `translateX(${tx}px)`,
        opacity: inOp * outOp,
        background: p.surface + 'ee',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '22px 36px 22px 30px',
        borderLeft: `6px solid ${p.accent}`,
        borderRadius: 4,
        boxShadow: `0 18px 50px ${p.shadow}`,
      }}>
        <div style={{
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 800, fontSize: 56,
          letterSpacing: -1.2,
          color: p.fg,
          lineHeight: 1.05,
        }}>{NAME}</div>
        <div style={{
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 500, fontSize: 24,
          letterSpacing: 0.4,
          color: p.muted,
          marginTop: 6,
        }}>{ROLE}</div>
      </div>
    </AbsoluteFill>
  );
};
