/**
 * TEMPLATE: Section / chapter divider card
 *
 * Use when the prompt is: "chapter break", "section title", "part 2",
 * "next topic", "divider".
 *
 * Vibe: brief full-frame card with a chapter number above + section title
 * below. Kerning closes in tight on the title. Quick fades on entry/exit
 * — this is a beat, not a destination.
 *
 * EDIT: CHAPTER, TITLE.
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { palettes } from '../lib/palettes';
import { TYPE } from '../lib/typography';
import { fadeIn, fadeOut, kerningIn } from '../lib/motion';
import { FRAMES } from '../lib/easings';

export const SectionDivider: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = palettes.editorialLight;

  // EDIT THESE:
  const CHAPTER = 'CHAPTER 02';
  const TITLE   = 'The shift';

  const inFade  = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const outFade = fadeOut(frame, { start: durationInFrames - 12, dur: 12 });

  return (
    <AbsoluteFill style={{ background: p.bg, opacity: inFade * outFade }}>
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          ...TYPE.caption,
          color: p.accent,
          marginBottom: 18,
        }}>{CHAPTER}</div>
        <div style={{
          ...TYPE.titleHero,
          color: p.fg,
          fontSize: 140,
          letterSpacing: kerningIn(frame, { start: 4, dur: FRAMES.medium, from: 16, to: -2 }),
        }}>{TITLE}</div>
      </div>
    </AbsoluteFill>
  );
};
