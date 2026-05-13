/**
 * Color palettes — curated for short-form motion graphics.
 *
 * Use a palette as a base and override individual colors when needed.
 * Add your own palettes by appending below; Claude will pick the closest
 * match to the user's prompt.
 *
 * Picking rule (in the system prompt): if the prompt mentions a vibe
 * ("warm", "cinematic", "playful", "tech", "brat", "coquette", "y2k"),
 * pick the matching palette. Otherwise default to `modernDark`.
 */

export type Palette = {
  bg: string;       // main background
  surface: string;  // card / panel surface
  fg: string;       // primary text / shape
  accent: string;   // hero accent
  accent2: string;  // secondary accent / gradient stop
  muted: string;    // de-emphasised text
  shadow: string;   // shadow color (with low alpha)
};

export const palettes = {
  // Premium dark — Anthropic-ish, suitable for tech/podcast
  modernDark: {
    bg: '#0d0d10', surface: '#1a1a1f', fg: '#f2efe6',
    accent: '#d97757', accent2: '#e89a6c', muted: '#9b9588',
    shadow: 'rgba(0,0,0,0.4)',
  } as Palette,

  // Warm cinematic — film stocks, golden hour
  warmCinema: {
    bg: '#1a1410', surface: '#28201a', fg: '#f5ead4',
    accent: '#e8a04a', accent2: '#f1c878', muted: '#a89880',
    shadow: 'rgba(20,10,0,0.45)',
  } as Palette,

  // Playful punch — TikTok / Reels energy
  playfulPunch: {
    bg: '#fff6e8', surface: '#ffffff', fg: '#1a1a2e',
    accent: '#ff5e5b', accent2: '#ffb84a', muted: '#5b5b6e',
    shadow: 'rgba(0,0,0,0.12)',
  } as Palette,

  // Tech blue — SaaS, product explainer
  techBlue: {
    bg: '#0a1220', surface: '#152033', fg: '#e8eef9',
    accent: '#5eb6e8', accent2: '#7fc6ec', muted: '#7a8aa3',
    shadow: 'rgba(0,5,20,0.5)',
  } as Palette,

  // Pure white — minimal editorial
  editorialLight: {
    bg: '#fafaf7', surface: '#ffffff', fg: '#1a1a1c',
    accent: '#1a1a1c', accent2: '#666', muted: '#8a8a8e',
    shadow: 'rgba(0,0,0,0.08)',
  } as Palette,

  // Vibrant — gradients, party, music
  vibrantNight: {
    bg: '#0d0118', surface: '#1f0a35', fg: '#fff',
    accent: '#ff3d8a', accent2: '#6b3df5', muted: '#a48dbe',
    shadow: 'rgba(80,0,80,0.5)',
  } as Palette,

  // ─── TRENDING 2025-2026 ───

  // BRAT — Charli XCX. Acid lime on flat black. Arial lowercase.
  // Use when the prompt says "brat", "lime", "y2k green", "ironic", "club".
  bratLime: {
    bg: '#8ace00', surface: '#76b800', fg: '#000000',
    accent: '#000000', accent2: '#1a1a1a', muted: '#3a3a3a',
    shadow: 'rgba(0,0,0,0.18)',
  } as Palette,

  // Coquette — soft pastel pink, cream, sage. Bows, ribbons, lace.
  // Use for "coquette", "soft", "pink", "girly", "dainty", "pastel".
  coquetteCream: {
    bg: '#fbe9ec', surface: '#ffffff', fg: '#5a2c3b',
    accent: '#ff8aa8', accent2: '#c9b8a8', muted: '#a8889a',
    shadow: 'rgba(180,100,130,0.16)',
  } as Palette,

  // Chrome Y2K — silver gradient, electric blue, hot pink. Reflective.
  // Use for "y2k", "chrome", "early-2000s", "retro tech", "nostalgia".
  chromeY2K: {
    bg: '#0a0a14', surface: '#1c1c2e', fg: '#e8eaf0',
    accent: '#c0c5d4', accent2: '#ff2e7e', muted: '#6e7088',
    shadow: 'rgba(0,200,255,0.4)',
  } as Palette,

  // Mocha Mousse — Pantone 2025 color of the year. Warm earthy brown.
  // Use for "warm", "earthy", "cozy", "podcast", "luxury".
  mochaMousse: {
    bg: '#a47864', surface: '#8c6450', fg: '#f4ebe1',
    accent: '#3a2820', accent2: '#d4b5a0', muted: '#7a5a48',
    shadow: 'rgba(40,20,10,0.35)',
  } as Palette,

  // Dark Academia — warm browns, cream, oxblood. Library candles.
  // Use for "dark academia", "vintage", "books", "literary", "moody".
  darkAcademia: {
    bg: '#1c1410', surface: '#2a1f17', fg: '#e8d8b8',
    accent: '#8a2a1c', accent2: '#c4a060', muted: '#8c7858',
    shadow: 'rgba(20,10,0,0.55)',
  } as Palette,

  // Vaporwave Sunset — magenta to purple to teal. Synth grid energy.
  // Use for "vaporwave", "sunset", "synth", "80s", "neon".
  sunsetVapor: {
    bg: '#1a0830', surface: '#2c0d4a', fg: '#fff5fa',
    accent: '#ff5ec4', accent2: '#5ef0ff', muted: '#b48cce',
    shadow: 'rgba(255,80,200,0.4)',
  } as Palette,

  // High-contrast noir — pure b/w with one accent. Editorial brutalism.
  // Use for "brutalist", "minimal", "monochrome", "magazine".
  noirHC: {
    bg: '#000000', surface: '#0a0a0a', fg: '#ffffff',
    accent: '#ff3b30', accent2: '#ffffff', muted: '#888888',
    shadow: 'rgba(0,0,0,0.8)',
  } as Palette,

  // Sage matcha — muted green + cream + cocoa. Wellness / lifestyle.
  // Use for "sage", "matcha", "wellness", "calm", "spa", "morning".
  sageMatcha: {
    bg: '#e8e4d8', surface: '#f4f1e8', fg: '#2c3a2c',
    accent: '#7a9268', accent2: '#c4a878', muted: '#8a907a',
    shadow: 'rgba(60,80,60,0.18)',
  } as Palette,

  // Reels Gradient — Instagram-style multi-stop sunset gradient backdrop.
  // Use for "instagram", "reel", "gradient bg", "story".
  reelsGradient: {
    bg: '#feda77', surface: '#ffffff', fg: '#262626',
    accent: '#f58529', accent2: '#dd2a7b', muted: '#8a3ab9',
    shadow: 'rgba(221,42,123,0.3)',
  } as Palette,
};

export type PaletteName = keyof typeof palettes;
