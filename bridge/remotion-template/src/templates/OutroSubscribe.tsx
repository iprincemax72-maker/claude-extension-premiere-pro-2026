/**
 * TEMPLATE: YouTube-style outro with subscribe button
 *
 * Use when the prompt is: "outro", "end card", "thanks for watching",
 * "subscribe outro", "sign-off".
 *
 * Vibe: "Thanks for watching" headline, subscribe button below pulses
 * once on entry, channel handle in caption case. Static dot-grid bg.
 *
 * EDIT: HEADLINE, CHANNEL_HANDLE.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { fadeIn, fadeOut, dropAndSettle, breathe } from '../lib/motion';
import { FRAMES } from '../lib/easings';
import { SubscribeButton } from '../lib/buttons';
import { DotGrid } from '../lib/backgrounds';

export const OutroSubscribe: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.modernDark;

  // EDIT THESE:
  const HEADLINE       = 'Thanks for watching';
  const CHANNEL_HANDLE = '@CRUXDEV';

  const headlineOp = fadeIn(frame, { start: 0, dur: FRAMES.medium });
  const drop = dropAndSettle(frame, { start: 14, dur: FRAMES.medium, from: -80 });
  const handleOp = fadeIn(frame, { start: 30, dur: FRAMES.short });
  const out = fadeOut(frame, { start: durationInFrames - 14, dur: 14 });
  const btnBreathe = breathe(frame, 0.02, 1);

  return (
    <AbsoluteFill style={{ background: p.bg, opacity: out }}>
      <DotGrid color={p.muted} spacing={40} size={2} opacity={0.18} />
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          ...TYPE.titleMd,
          color: p.fg,
          fontSize: 80,
          opacity: headlineOp,
          marginBottom: 36,
        }}>{HEADLINE}</div>
        <div style={{
          transform: `translateY(${drop.ty}px) scale(${drop.scale * btnBreathe})`,
          opacity: Math.min(1, drop.scale * 2),
        }}>
          <SubscribeButton />
        </div>
        <div style={{
          ...TYPE.caption,
          color: p.muted,
          marginTop: 28,
          opacity: handleOp,
        }}>{CHANNEL_HANDLE}</div>
      </div>
    </AbsoluteFill>
  );
};
