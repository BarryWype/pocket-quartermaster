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
};
