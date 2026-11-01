import type { Difficulty } from '@/content/difficulty';

// Shared UI colours, picked to sit with the map palette in `content/mapStyle.ts`.
export const colors = {
  wood: '#8a5a35',
  woodDark: '#5e3622',
  woodLight: '#b0704a',
  parchment: '#f4ead2',
  parchmentDark: '#e9d9a6',
  ink: '#3b2a1a',
  muted: '#7a6650',
  highlight: '#fff6a8',
  danger: '#c0392b',
  success: '#2f7d32',
  gold: '#c99a00',
  /** Bevel edges drawn over any fill colour, for the pixel-art frames. */
  bevelLight: 'rgba(255,255,255,0.35)',
  bevelDark: 'rgba(0,0,0,0.3)',
};

/** Border widths of the pixel-art frames: a dark outline, then a bevel inside it. */
export const pixel = { outline: 3, bevel: 3 };

export const fonts = {
  /** Loaded in `app/_layout.tsx` from `assets/fonts/FantaisieArtistique.ttf`. */
  body: 'FantaisieArtistique',
  /** Body text and numbers, loaded from `@expo-google-fonts/alegreya`. */
  serif: 'Alegreya_500Medium',
  serifBold: 'Alegreya_700Bold',
};

/** The wood & brass palette: dark wood frames, parchment surfaces, brass accents. */
export const ui = {
  outline: '#1E120A',
  woodDeep: '#2A180D',
  woodDark: '#3A2314',
  woodMid: '#5A3820',
  woodSeam: '#4E301B',
  woodSelected: '#7A4A26',
  brass: '#C9A04E',
  brassDim: '#8A6A34',
  brassLight: '#F6D98E',
  parchment: '#F2E4C2',
  parchmentShade: '#E6D3A8',
  parchmentRule: '#B9A27A',
  ink: '#3A2314',
  inkMuted: '#6A4A2C',
  onWood: '#F2E4C2',
  onWoodMuted: '#C9B48A',
  ember: '#B4471C',
  emberLight: '#E07A3E',
  emberDark: '#6E2A0E',
  onEmber: '#FFF1DC',
  good: '#2F6B32',
  goodBg: '#DDE8C8',
  bad: '#8A2E1C',
  badBg: '#F2D3C2',
  keyword: '#2E4E8A',
  keywordBg: '#D3DCEE',
  hp: '#4E9A3E',
  hpLow: '#D98A2E',
  xp: '#C9A04E',
  gold: '#E8B83A',
};

/** Difficulty rings: colour, ring width and pip count (a crown for bosses); the pips repeat the signal for colour-blind players. */
export const difficultyTokens: Record<Difficulty, {
  ring: string;
  width: number;
  pips: number;
  outerRing?: { colour: string; width: number };
}> = {
  easy: { ring: '#4E9A3E', width: 2, pips: 1 },
  medium: { ring: '#D98A2E', width: 3, pips: 2 },
  hard: { ring: '#C9473A', width: 4, pips: 3 },
  boss: { ring: '#C9473A', width: 4, pips: 0, outerRing: { colour: ui.brass, width: 2 } },
};
