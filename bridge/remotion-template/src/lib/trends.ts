/**
 * Trend packs — named bundles of (palette + typography + motion + effects)
 * matched to what's actually trending in short-form video right now.
 *
 * RESTRAINT IS THE POINT. Each pack lists 1-2 motion helpers and 0-1 effects.
 * That's not a starting checklist — that's the MAX. If you stack everything
 * a pack lists you'll get AI-slop. A real designer picks ONE idea and lets
 * it breathe.
 *
 * To USE a pack inside a component:
 *
 *   import { TRENDS } from '../lib/trends';
 *   import { palettes } from '../lib/palettes';
 *   import { TYPE } from '../lib/typography';
 *
 *   const pack = TRENDS.bratPunch;
 *   const p = palettes[pack.palette];
 *   const titleStyle = { ...TYPE[pack.titleType], color: p.fg };
 *
 * Then pick ONE motion helper from pack.motion[] (rarely two) and apply it.
 * Skip pack.effects unless the prompt specifically asks for that vibe.
 */

import type { PaletteName } from './palettes';

export type TrendPack = {
  name: string;
  description: string;
  keywords: string[];           // prompt phrases that trigger this pack
  palette: PaletteName;         // primary palette to use
  titleType: string;            // recipe name from typography.ts (TYPE[...])
  captionPreset: 'TIKTOK_CAPTION' | 'KARAOKE_CAPTION' | 'SOFT_CAPTION';
  // CORE motion helper(s) — pick ONE for most renders. Two only if the prompt
  // is genuinely complex (e.g. "build excitement, then drop the punchline").
  motion: string[];
  // Effect overlay. 0 or 1 per render. Most packs should be empty here.
  effects: string[];
  transitions: string[];        // only relevant for multi-scene renders
  restraint: string;            // the one-line "what to do, what NOT to do"
};

export const TRENDS: Record<string, TrendPack> = {
  // ─── #1: TikTok kinetic caption — the default short-form look ───
  tiktokKineticCaption: {
    name: 'TikTok Kinetic Caption',
    description: 'Word-by-word reveals on talking-head/podcast clips. The most-used motion graphic in short-form.',
    keywords: ['tiktok', 'caption', 'kinetic', 'word pop', 'podcast clip', 'subtitle', 'captions'],
    palette: 'modernDark',
    titleType: 'titleMd',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['wordPop'],
    effects: [],
    transitions: ['flashCutTransition'],
    restraint: 'wordPop with gap:3, NO jitter. Each word holds 8-12 frames before the next. No grain, no vignette, no zoomPunch — just clean reveals.',
  },

  // ─── #2: BRAT — Charli XCX lime-on-black, ironic lowercase ───
  bratPunch: {
    name: 'Brat',
    description: 'Acid lime, lowercase Arial, blown-out and dismissive.',
    keywords: ['brat', 'lime', 'green', 'club', 'ironic', 'lowercase', 'charli', 'y2k green'],
    palette: 'bratLime',
    titleType: 'bratLockup',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['kerningIn'],
    effects: [],
    transitions: ['flashCutTransition'],
    restraint: 'ONE lowercase word. kerningIn from 30 → -8. Black on lime. No effects. Hold 30+ frames after the word lands. That is the whole thing.',
  },

  // ─── #3: Coquette ribbon — pastel pink, italic serif ───
  coquetteRibbon: {
    name: 'Coquette Ribbon',
    description: 'Soft pink, italic serif, dainty motion.',
    keywords: ['coquette', 'soft', 'pink', 'girly', 'bow', 'dainty', 'feminine', 'pastel', 'pretty'],
    palette: 'coquetteCream',
    titleType: 'coquetteTitle',
    captionPreset: 'SOFT_CAPTION',
    motion: ['blurIn'],
    effects: ['SparkleField'],
    transitions: ['slideMorphTransition'],
    restraint: 'Italic serif. blurIn slowly (FRAMES.long). Sparkles count<=20 if you must. ONE accent (pink). No staggered words, no glow, no grain.',
  },

  // ─── #4: Chrome Y2K — silver gradient, optional grid ───
  chromeY2K: {
    name: 'Chrome Y2K',
    description: 'Metallic silver gradient text, early-2000s nostalgia.',
    keywords: ['y2k', 'chrome', '2000s', 'retro tech', 'nostalgic', 'metallic', 'silver', 'cyber'],
    palette: 'chromeY2K',
    titleType: 'y2kCaption',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['kerningIn'],
    effects: [],
    transitions: ['flashCutTransition'],
    restraint: 'CHROME_TEXT_STYLE on ONE word. kerningIn entrance. Background stays plain dark. Add Grid only if the prompt mentions "grid"/"floor"/"cyber".',
  },

  // ─── #5: Vaporwave sunset — synth grid + sunset gradient ───
  vaporwaveSunset: {
    name: 'Vaporwave Sunset',
    description: 'Magenta-purple-teal gradient, lo-fi music vibe.',
    keywords: ['vaporwave', 'synthwave', 'sunset', 'neon', '80s', 'lofi', 'synth'],
    palette: 'sunsetVapor',
    titleType: 'titleHero',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['blurIn'],
    effects: ['GradientMesh'],
    transitions: ['slideMorphTransition'],
    restraint: 'GradientMesh as background. Title fades in slow. Skip the grid AND scanlines unless the prompt asks for "synth grid". Less is more.',
  },

  // ─── #6: Editorial brutalist — high contrast, oversized type ───
  editorialBrutalist: {
    name: 'Editorial Brutalist',
    description: 'Massive uppercase type, raw black-and-white.',
    keywords: ['brutalist', 'editorial', 'magazine', 'minimal', 'monochrome', 'newspaper', 'bold', 'bw'],
    palette: 'noirHC',
    titleType: 'brutalistLabel',
    captionPreset: 'SOFT_CAPTION',
    motion: ['swipeReveal'],
    effects: [],
    transitions: ['pushTransition'],
    restraint: 'B/W only. ONE red accent block. Hard swipeReveal entrance. Hold long. No softness, no fades, no grain.',
  },

  // ─── #7: Mocha luxury — Pantone 2025 warm earthy ───
  mochaLuxury: {
    name: 'Mocha Luxury',
    description: 'Warm Pantone-2025 mocha, slow elegant motion.',
    keywords: ['mocha', 'cozy', 'coffee', 'luxury', 'warm', 'earthy', 'lifestyle', 'morning'],
    palette: 'mochaMousse',
    titleType: 'editorialXl',
    captionPreset: 'SOFT_CAPTION',
    motion: ['blurIn'],
    effects: ['LightLeak'],
    transitions: ['slideMorphTransition'],
    restraint: 'Italic serif. EASE.cinematic only. ONE soft warm light leak. No grain stacking on top. Slow, let it breathe.',
  },

  // ─── #8: Dark academia — moody library candles ───
  darkAcademia: {
    name: 'Dark Academia',
    description: 'Oxblood + cream + warm brown, literary mood.',
    keywords: ['dark academia', 'vintage', 'literary', 'books', 'moody', 'old money', 'gothic'],
    palette: 'darkAcademia',
    titleType: 'editorialXl',
    captionPreset: 'SOFT_CAPTION',
    motion: ['typewriter'],
    effects: ['Vignette'],
    transitions: ['flashCutTransition'],
    restraint: 'typewriter at cps:14 for the quote. ONE vignette at 0.5. Skip grain + light leak combo — vignette alone reads vintage enough.',
  },

  // ─── #9: Sage wellness — calm matcha green ───
  sageWellness: {
    name: 'Sage Wellness',
    description: 'Sage + cream + cocoa, slow calm motion.',
    keywords: ['sage', 'matcha', 'wellness', 'calm', 'morning', 'routine', 'spa', 'mindful', 'yoga'],
    palette: 'sageMatcha',
    titleType: 'coquetteTitle',
    captionPreset: 'SOFT_CAPTION',
    motion: ['fadeIn'],
    effects: [],
    transitions: ['slideMorphTransition'],
    restraint: 'Just fadeIn. EASE.cinematic, FRAMES.long. No sparkles, no glow, no nothing. The palette IS the design.',
  },

  // ─── #10: Karaoke pop — beat-synced highlight on each word ───
  karaokePop: {
    name: 'Karaoke Pop',
    description: 'Each word highlighter-yellow when it hits.',
    keywords: ['karaoke', 'lyric', 'song', 'hook', 'beat', 'music', 'lyrics', 'highlight', 'sync'],
    palette: 'noirHC',
    titleType: 'lyric',
    captionPreset: 'KARAOKE_CAPTION',
    motion: ['highlighter', 'wordPop'],
    effects: [],
    transitions: ['flashCutTransition'],
    restraint: 'wordPop reveals each word, highlighter slides behind the CURRENT word. No beatPulse on top, no vignette. Two helpers max, that is the look.',
  },

  // ─── #11: Stat slam — big number reveal ───
  statSlam: {
    name: 'Stat Slam',
    description: 'Big number reveal, optional bento context cards.',
    keywords: ['stat', 'number', 'data', 'metric', 'launch', 'bento', 'report', 'dashboard', 'kpi'],
    palette: 'modernDark',
    titleType: 'titleHero',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['counter'],
    effects: [],
    transitions: ['flashCutTransition'],
    restraint: 'counter() on the big number. Tiny label above it (TYPE.caption). Hold for 30+ frames after it lands. Skip bento unless prompt says "multiple stats".',
  },

  // ─── #12: News ticker ───
  newsTicker: {
    name: 'News Ticker',
    description: 'Bottom ticker strip + lower-third name card.',
    keywords: ['news', 'ticker', 'sports', 'espn', 'breaking', 'headline', 'broadcast'],
    palette: 'techBlue',
    titleType: 'brutalistLabel',
    captionPreset: 'SOFT_CAPTION',
    motion: ['slideIn'],
    effects: [],
    transitions: ['pushTransition'],
    restraint: 'LowerThird slides in from left. ONE accent stripe on the side. Headline center, hard cut. No swooping, no kerning animation.',
  },

  // ─── #13: Glitch hype ───
  glitchHype: {
    name: 'Glitch Hype',
    description: 'Brief RGB-split burst on the hero moment only.',
    keywords: ['glitch', 'hack', 'cyber', 'hacker', 'matrix', 'gaming', 'tech reveal', 'edgy'],
    palette: 'noirHC',
    titleType: 'brutalistLabel',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['glitch'],
    effects: [],
    transitions: ['glitchCutTransition'],
    restraint: 'ONE glitch burst, 6-8 frames, on the hero word ONLY. Hold clean after it. No scanlines + grid + shake stack — that is the AI tell.',
  },

  // ─── #14: Confetti celebration ───
  confettiHype: {
    name: 'Confetti Hype',
    description: 'Color confetti burst + big bouncy text on a win.',
    keywords: ['confetti', 'celebrate', 'win', 'milestone', 'launch', 'congrats', 'party', 'drop'],
    palette: 'playfulPunch',
    titleType: 'titleHero',
    captionPreset: 'TIKTOK_CAPTION',
    motion: ['dropAndSettle'],
    effects: ['Confetti'],
    transitions: ['zoomPunchTransition'],
    restraint: 'Hero word does dropAndSettle (elastic). Confetti starts on the same frame. That is it. No sparkles on top, no gradient mesh underneath.',
  },

  // ─── #15: Reels gradient — Instagram story style ───
  reelsStory: {
    name: 'Reels Story',
    description: 'Instagram-style gradient bg, soft motion.',
    keywords: ['instagram', 'reel', 'story', 'gradient', 'social', 'ig'],
    palette: 'reelsGradient',
    titleType: 'titleMd',
    captionPreset: 'SOFT_CAPTION',
    motion: ['blurIn'],
    effects: ['GradientMesh'],
    transitions: ['slideMorphTransition'],
    restraint: 'GradientMesh background. Soft blurIn on the title. Round corners on the card. No sparkles, no wordPop staggering.',
  },
};

/**
 * Pick a trend pack by matching prompt keywords. Returns the matched
 * pack name, or 'tiktokKineticCaption' as the safe default.
 *
 * Note: Claude usually picks the pack directly based on the prompt; this
 * helper exists for components that want to auto-pick from a description.
 */
export function pickTrend(promptText: string): keyof typeof TRENDS {
  const t = promptText.toLowerCase();
  let best: keyof typeof TRENDS = 'tiktokKineticCaption';
  let bestScore = 0;
  for (const [key, pack] of Object.entries(TRENDS) as [keyof typeof TRENDS, TrendPack][]) {
    const score = pack.keywords.reduce((acc, kw) => acc + (t.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

export type TrendName = keyof typeof TRENDS;
