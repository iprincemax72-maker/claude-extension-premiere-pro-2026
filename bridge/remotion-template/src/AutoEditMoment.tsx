/**
 * AutoEditMoment — parameterized motion-graphic component used by the AUTO
 * EDIT button. The bridge passes a `moment` prop describing what to render,
 * and this component routes to the right sub-template.
 *
 * Schema (must match bridge.js detectMoments + renderMomentsParallel):
 *   moment: {
 *     id: string,
 *     type: 'stat'|'quote'|'name'|'list'|'callout'|'question'|'section'|'fact',
 *     startSec: number,
 *     endSec:   number,
 *     label:    string,
 *     payload:  object,            // template-specific fields
 *     trendPack: string,           // e.g. 'tiktokKineticCaption', 'editorialBrutalist'
 *     confidence: number,
 *   }
 *   durationFrames: number         // total render length (drives all internal timing)
 *
 * Restraint policy (anti-AI-slop):
 * - ONE motion idea per template. No glitch+wordPop+sparkles stacked.
 * - Hold frames are sacred. Each template lands at ~25% and holds until ~85%
 *   before starting any exit motion.
 * - Single accent color per shot, drawn from the trend pack's palette.
 * - Safe zone: most templates render in bottom-third / top-third with a
 *   transparent center to keep speaker's face uncovered.
 */

import React, { type CSSProperties } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { palettes, type PaletteName } from './lib/palettes';
import { EASE, FRAMES } from './lib/easings';
import { TYPE, TIKTOK_CAPTION, SOFT_CAPTION } from './lib/typography';
import {
  wordPop, kerningIn, blurIn, fadeIn, fadeOut, typewriter, counter, dropAndSettle,
  swipeReveal, slideIn,
} from './lib/motion';

// ─── Trend pack → palette mapping. Used when moment.trendPack is set. ──
function paletteForPack(pack?: string): keyof typeof palettes {
  const map: Record<string, PaletteName> = {
    tiktokKineticCaption: 'modernDark',
    bratPunch: 'bratLime',
    coquetteRibbon: 'coquetteCream',
    chromeY2K: 'chromeY2K',
    vaporwaveSunset: 'sunsetVapor',
    editorialBrutalist: 'noirHC',
    mochaLuxury: 'mochaMousse',
    darkAcademia: 'darkAcademia',
    sageWellness: 'sageMatcha',
    karaokePop: 'noirHC',
    statSlam: 'modernDark',
    newsTicker: 'techBlue',
    glitchHype: 'noirHC',
    confettiHype: 'playfulPunch',
    reelsStory: 'reelsGradient',
  };
  return map[pack || ''] || 'modernDark';
}

// ─── Moment prop type ─────────────────────────────────────────────────
export type Moment = {
  id: string;
  type: 'stat' | 'quote' | 'name' | 'list' | 'callout' | 'question' | 'section' | 'fact';
  startSec: number;
  endSec: number;
  label?: string;
  payload?: any;
  trendPack?: string;
  confidence?: number;
};

export type AutoEditMomentProps = {
  moment: Moment;
  durationFrames?: number;
};

// ─── The router ───────────────────────────────────────────────────────
export const AutoEditMoment: React.FC<AutoEditMomentProps> = ({ moment, durationFrames }) => {
  const { durationInFrames } = useVideoConfig();
  const total = durationFrames || durationInFrames;
  const palName = paletteForPack(moment.trendPack);
  const p = palettes[palName];

  switch (moment.type) {
    case 'stat':     return <StatMoment moment={moment} total={total} palette={p} />;
    case 'quote':    return <QuoteMoment moment={moment} total={total} palette={p} />;
    case 'name':     return <NameMoment moment={moment} total={total} palette={p} />;
    case 'list':     return <ListMoment moment={moment} total={total} palette={p} />;
    case 'callout':  return <CalloutMoment moment={moment} total={total} palette={p} />;
    case 'question': return <QuestionMoment moment={moment} total={total} palette={p} />;
    case 'section':  return <SectionMoment moment={moment} total={total} palette={p} />;
    case 'fact':     return <FactMoment moment={moment} total={total} palette={p} />;
    default:         return <CalloutMoment moment={moment} total={total} palette={p} />;
  }
};

type SubProps = { moment: Moment; total: number; palette: typeof palettes.modernDark };

// ─── Helpers ──────────────────────────────────────────────────────────
function exitFade(frame: number, total: number, fadeDur = 9) {
  // Fade out across the LAST `fadeDur` frames of the clip.
  return interpolate(frame, [total - fadeDur, total], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.hero,
  });
}

// Bottom-third safe zone — vertical position for most templates so the
// speaker's face stays clear. Override per template when needed.
const BOTTOM_THIRD: CSSProperties = {
  position: 'absolute',
  left: '6%', right: '6%',
  bottom: '12%',
};

// ─── STAT — big number with kicker label ──────────────────────────────
const StatMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const number = String(moment.payload?.number ?? '');
  const subject = String(moment.payload?.subject ?? '');

  // Parse a leading numeric value (with optional % or other suffix) so
  // counter() can animate from 0. Falls back to a static label.
  const m = number.match(/^([\d.,]+)(.*)$/);
  const target = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  const suffix = m ? m[2] : '';

  const display = Number.isFinite(target)
    ? counter(frame, { start: 4, dur: Math.min(28, Math.max(12, total - 24)), to: target, suffix, decimals: m && m[1].includes('.') ? 1 : 0 })
    : number;

  const labelOp = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const out = exitFade(frame, total, 9);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={BOTTOM_THIRD}>
        {subject && (
          <div style={{
            ...TYPE.caption,
            color: p.accent,
            opacity: labelOp,
            marginBottom: 10,
          }}>{subject}</div>
        )}
        <div style={{
          ...TYPE.titleHero,
          fontSize: 200,
          color: p.fg,
          textShadow: '0 6px 28px rgba(0,0,0,0.45)',
        }}>{display}</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── QUOTE — pulled quote with vertical accent bar ────────────────────
const QuoteMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const text = String(moment.payload?.text ?? moment.label ?? '');
  const attribution = String(moment.payload?.attribution ?? '');
  const { opacity, blur } = blurIn(frame, { start: 2, dur: FRAMES.medium });
  const out = exitFade(frame, total, 12);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        ...BOTTOM_THIRD,
        bottom: '14%',
        opacity,
        filter: `blur(${blur}px)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>
          <div style={{ width: 6, background: p.accent, borderRadius: 3 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...TYPE.editorial, color: p.fg, fontSize: 64, lineHeight: 1.18 }}>
              {text}
            </div>
            {attribution && (
              <div style={{ ...TYPE.caption, color: p.muted, marginTop: 14 }}>
                — {attribution}
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── NAME — bottom-left lower-third ───────────────────────────────────
const NameMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const name = String(moment.payload?.name ?? moment.label ?? '');
  const subtitle = String(moment.payload?.subtitle ?? '');
  const tx = slideIn(frame, { start: 0, dur: FRAMES.medium, from: -80 });
  const op = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const out = exitFade(frame, total, 12);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        position: 'absolute',
        bottom: '12%',
        left: '6%',
        transform: `translateX(${tx}px)`,
        opacity: op,
        background: p.surface + 'e6',
        padding: '22px 36px',
        borderLeft: `5px solid ${p.accent}`,
        borderRadius: 6,
        boxShadow: `0 18px 50px ${p.shadow}`,
      }}>
        <div style={{
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 800,
          fontSize: 56,
          letterSpacing: -1.2,
          color: p.fg,
        }}>{name}</div>
        {subtitle && (
          <div style={{
            fontFamily: '"SF Pro Display","Inter",sans-serif',
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: 0.4,
            color: p.muted,
            marginTop: 6,
          }}>{subtitle}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─── LIST — staggered bullets ─────────────────────────────────────────
const ListMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const items: string[] = Array.isArray(moment.payload?.items) ? moment.payload.items : [];
  const out = exitFade(frame, total, 12);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        position: 'absolute',
        right: '6%', top: '14%', bottom: '14%',
        width: '46%',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18,
      }}>
        {items.slice(0, 5).map((item, i) => {
          const op = fadeIn(frame, { start: 4 + i * 6, dur: FRAMES.short });
          const tx = slideIn(frame, { start: 4 + i * 6, dur: FRAMES.short, from: 40 });
          return (
            <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'baseline', opacity: op, transform: `translateX(${tx}px)` }}>
              <span style={{
                ...TYPE.caption,
                color: p.accent,
                fontSize: 18,
                minWidth: 28,
              }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{
                fontFamily: '"SF Pro Display","Inter",sans-serif',
                fontWeight: 700,
                fontSize: 38,
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

// ─── CALLOUT — sticker badge bottom-right ─────────────────────────────
const CalloutMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const text = String(moment.payload?.text ?? moment.label ?? '!').toUpperCase();
  const drop = dropAndSettle(frame, { start: 0, dur: FRAMES.medium, from: -160 });
  const out = exitFade(frame, total, 9);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        position: 'absolute',
        bottom: '14%',
        right: '6%',
        transform: `translateY(${drop.ty}px) scale(${drop.scale}) rotate(-8deg)`,
        background: p.accent,
        color: p.bg,
        padding: '22px 38px',
        borderRadius: 14,
        boxShadow: `0 14px 36px ${p.shadow}`,
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontWeight: 900,
        fontSize: 56,
        letterSpacing: -1,
        textTransform: 'uppercase',
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ─── QUESTION — text + accent mark ────────────────────────────────────
const QuestionMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const text = String(moment.payload?.text ?? moment.label ?? '');
  const { opacity, blur } = blurIn(frame, { start: 0, dur: FRAMES.medium });
  const out = exitFade(frame, total, 12);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        ...BOTTOM_THIRD,
        opacity,
        filter: `blur(${blur}px)`,
        display: 'flex', alignItems: 'baseline', gap: 22,
      }}>
        <span style={{ ...TYPE.editorialXl, color: p.accent, fontSize: 110 }}>?</span>
        <span style={{ ...TYPE.titleMd, color: p.fg, fontSize: 56, lineHeight: 1.2 }}>{text}</span>
      </div>
    </AbsoluteFill>
  );
};

// ─── SECTION — chapter card, brief full-frame moment ─────────────────
const SectionMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const title = String(moment.payload?.title ?? moment.label ?? '');
  const op = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const out = exitFade(frame, total, 12);
  const kern = kerningIn(frame, { start: 2, dur: FRAMES.medium, from: 18, to: -1 });

  return (
    <AbsoluteFill style={{ background: p.bg + 'ee', opacity: out }}>
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{ ...TYPE.caption, color: p.accent, opacity: op, marginBottom: 14 }}>
          {moment.payload?.chapter || '— Chapter —'}
        </div>
        <div style={{
          ...TYPE.titleHero,
          color: p.fg,
          fontSize: 120,
          letterSpacing: kern,
          opacity: op,
        }}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── FACT — corner card ──────────────────────────────────────────────
const FactMoment: React.FC<SubProps> = ({ moment, total, palette: p }) => {
  const frame = useCurrentFrame();
  const text = String(moment.payload?.text ?? moment.label ?? '');
  const op = fadeIn(frame, { start: 0, dur: FRAMES.short });
  const tx = slideIn(frame, { start: 0, dur: FRAMES.medium, from: 60 });
  const out = exitFade(frame, total, 9);

  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: out }}>
      <div style={{
        position: 'absolute',
        top: '10%',
        right: '6%',
        maxWidth: '34%',
        background: p.surface + 'e6',
        padding: '18px 24px',
        borderTop: `4px solid ${p.accent}`,
        borderRadius: 4,
        opacity: op,
        transform: `translateX(${tx}px)`,
        boxShadow: `0 14px 34px ${p.shadow}`,
      }}>
        <div style={{ ...TYPE.caption, color: p.accent, marginBottom: 6 }}>FACT</div>
        <div style={{
          fontFamily: '"SF Pro Display","Inter",sans-serif',
          fontWeight: 600,
          fontSize: 26,
          lineHeight: 1.35,
          color: p.fg,
        }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};
