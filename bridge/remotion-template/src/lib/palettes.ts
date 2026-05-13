/**
 * Color palettes — curated for short-form motion graphics.
 *
 * Use a palette as a base and override individual colors when needed.
 * Add your own palettes by appending below; Claude will pick the closest
 * match to the user's prompt.
 *
 * Picking rule (in the system prompt): if the prompt mentions a vibe
 * ("warm", "cinematic", "playful", "tech"), pick the matching palette.
 * Otherwise default to `modernDark`.
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
};

export type PaletteName = keyof typeof palettes;
