/**
 * TEMPLATE: Sticker callout ("WATCH THIS", "NEW", "KEY POINT")
 *
 * Use when the prompt is: "watch this callout", "key point sticker",
 * "important note", "highlight", "arrow + label".
 *
 * Vibe: rotated sticker drops in from above with elastic overshoot,
 * shakes briefly to draw the eye, then holds. Sits in the corner so
 * it never covers the main subject.
 *
 * EDIT: TEXT, corner placement.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { dropAndSettle, fadeOut } from '../lib/motion';
import { attentionShake } from '../lib/motion-extra';
import { Badge } from '../lib/shapes';
import { FRAMES } from '../lib/easings';

export const CalloutSticker: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.playfulPunch;

  // EDIT THESE:
  const TEXT = 'WATCH THIS';
  const CORNER = 'top-right' as 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

  const drop = dropAndSettle(frame, { start: 0, dur: FRAMES.medium, from: -200 });
  const shake = attentionShake(frame, { start: 24, dur: 14, intensity: 6 });
  const out = fadeOut(frame, { start: durationInFrames - 12, dur: 12 });

  const pos: React.CSSProperties = (() => {
    switch (CORNER) {
      case 'top-right':    return { top: '8%',  right:  '6%' };
      case 'bottom-right': return { bottom: '8%', right:  '6%' };
      case 'top-left':     return { top: '8%',  left:   '6%' };
      default:             return { bottom: '8%', left:   '6%' };
    }
  })();

  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <div style={{
        position: 'absolute',
        ...pos,
        transform: `translateY(${drop.ty}px) rotate(${shake}deg) scale(${drop.scale})`,
        opacity: out,
      }}>
        <Badge text={TEXT} bg={p.accent} color={p.bg} size={200} rotation={-10} />
      </div>
    </AbsoluteFill>
  );
};
