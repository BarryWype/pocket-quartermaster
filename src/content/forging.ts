import type { MasteryType, Quality } from '@/game/types';

export const QUALITIES: Quality[] = ['crappy', 'normal', 'rare', 'legendary'];

/** Every stat of a forged piece is multiplied by its quality; Normal is the item's listed stats. */
export const qualities: Record<Quality, { name: string; multiplier: number; color: string }> = {
  crappy: { name: 'Crappy', multiplier: 0.85, color: '#8a8278' },
  // The usual ink: white would not show on parchment.
  normal: { name: 'Normal', multiplier: 1, color: '#3b2a1a' },
  rare: { name: 'Rare', multiplier: 1.15, color: '#2f6fd6' },
  legendary: { name: 'Legendary', multiplier: 1.3, color: '#c99a1a' },
};

export const MASTERY_TYPES: MasteryType[] = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'bow',
  'spear',
  'warhammer',
  'wand',
  'staff',
  'lute',
  'censer',
  'knuckles',
  'plate',
  'mail',
  'leather',
  'robes',
  'shield',
  'buckler',
  'offhandBlade',
  'quiver',
  'tome',
  'focus',
];

export const masteryTypeNames: Record<MasteryType, { name: string; plural: string }> = {
  sword: { name: 'Sword', plural: 'swords' },
  axe: { name: 'Axe', plural: 'axes' },
  mace: { name: 'Mace', plural: 'maces' },
  dagger: { name: 'Dagger', plural: 'daggers' },
  bow: { name: 'Bow', plural: 'bows' },
  spear: { name: 'Spear', plural: 'spears' },
  warhammer: { name: 'Warhammer', plural: 'warhammers' },
  wand: { name: 'Wand', plural: 'wands' },
  staff: { name: 'Staff', plural: 'staves' },
  lute: { name: 'Lute', plural: 'lutes' },
  censer: { name: 'Censer', plural: 'censers' },
  knuckles: { name: 'Knuckles', plural: 'knuckles' },
  plate: { name: 'Plate', plural: 'plate' },
  mail: { name: 'Mail', plural: 'mail' },
  leather: { name: 'Leather', plural: 'leather' },
  robes: { name: 'Robes', plural: 'robes' },
  shield: { name: 'Shield', plural: 'shields' },
  buckler: { name: 'Buckler', plural: 'bucklers' },
  offhandBlade: { name: 'Parrying dagger', plural: 'parrying daggers' },
  quiver: { name: 'Quiver', plural: 'quivers' },
  tome: { name: 'Tome', plural: 'tomes' },
  focus: { name: 'Focus', plural: 'focuses' },
};

/** Material names by tier, for mastery messages. */
export const TIER_NAMES = ['Wood', 'Stone', 'Copper', 'Iron', 'Steel'];

export const masteryRules = {
  /** Highest mastery level a material tier allows: base + perTier × tier (wood 4 … steel 12). */
  cap: { base: 2, perTier: 2 },
  /** Forges needed per level, by band: levels below `upTo` cost `forges` each. Tuned to simulated walks. */
  bands: [
    { name: 'wood', upTo: 4, forges: 3 },
    { name: 'stone', upTo: 6, forges: 3 },
    { name: 'copper', upTo: 8, forges: 4 },
    { name: 'iron', upTo: 10, forges: 4 },
    { name: 'steel', upTo: 12, forges: 4 },
  ],
  /** Quality odds (%) by levels below the item's cap: index 0 is maxed, the last row is 3 or more. */
  odds: [
    { crappy: 10, normal: 75, rare: 12, legendary: 3 },
    { crappy: 30, normal: 65, rare: 5, legendary: 0 },
    { crappy: 58, normal: 40, rare: 2, legendary: 0 },
    { crappy: 80, normal: 20, rare: 0, legendary: 0 },
  ] satisfies Record<Quality, number>[],
  /** Maxed odds for cheap tiers, where Legendary is rarer. Higher tiers use `odds[0]`. */
  maxedOddsByTier: {
    1: { crappy: 12, normal: 75, rare: 12, legendary: 1 },
    2: { crappy: 11, normal: 75, rare: 12, legendary: 2 },
  } as Partial<Record<number, Record<Quality, number>>>,
};

/** Every forged piece also rolls a stat factor on top of its quality, seeded by its uid. */
export const rollRules = {
  /**
   * Multiplier range. ±6% keeps the quality order intact: the lowest roll of
   * a quality still beats the highest roll of the quality below (0.85×1.06 < 1×0.94,
   * 1×1.06 < 1.15×0.94, 1.15×1.06 < 1.3×0.94).
   */
  range: { min: 0.94, max: 1.06 },
  /** Share of rolls that land in the upper half when mastery is at the item tier's cap; lower mastery tilts less. */
  tilt: { capUpperHalf: 2 / 3 },
};

export const salvageRules = {
  /** Share of each recipe input returned, rounded down; the first input always returns at least 1. */
  returned: { crappy: 0.25, normal: 0.4, rare: 0.6, legendary: 1 } satisfies Record<Quality, number>,
  /** Shards of its element an infused piece gives back. */
  infusedShards: 5,
  /** A Legendary piece also gives this many shards per material tier, of an element picked from its uid. */
  legendaryShardsPerTier: 1,
};
