import { localized } from '@/i18n/locale';

import { frTavernName } from './fr/taverns';

/** Taverns sit in fixed places on the map; their recruits change every rotation day. */
export const tavernRules = {
  /** Geohash precision 5 ≈ 4.9 × 4.9 km, like Sanctums. */
  precision: 5,
  perTile: [1, 2] as [min: number, max: number],
  visibilityMeters: 4500,
  interactionMeters: 50,
  /** Snapped to walkable places with coarse map tiles, like Sanctums. */
  placement: { mapZoom: 12, maxSnapMeters: 150 },
  /** Taverns open once this boss has been beaten. */
  unlockedBy: 'banditStockade',
};

/** Tavern names: "The {adjective} {noun}". */
export const tavernNames = {
  adjectives: ['Rusty', 'Prancing', 'Drowsy', 'Gilded', 'Crooked', 'Merry', 'Leaky', 'Golden', 'Sleeping', 'Lucky'],
  nouns: ['Tankard', 'Pony', 'Dragon', 'Goose', 'Barrel', 'Lantern', 'Anvil', 'Fiddler', 'Boar', 'Kettle'],
};

/** A tavern's name from its picks in `tavernNames`, in the current language. */
export const tavernName = (adjective: number, noun: number) =>
  localized({
    en: () => `The ${tavernNames.adjectives[adjective]} ${tavernNames.nouns[noun]}`,
    fr: () => frTavernName(adjective, noun),
  })();
