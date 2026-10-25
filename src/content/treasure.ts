import type { LootEntry } from '@/game/types';

type TreasureTier = {
  /** About 3–5 gathering nodes' worth of the tier's materials. */
  materials: LootEntry[];
  gold: [min: number, max: number];
};

export const treasureRules = {
  /** Where the treasure lies, measured from the player when the map is first read. */
  distanceMeters: [300, 1500] as [min: number, max: number],
  /** Chance of a special find on top: a Sanctum Sigil or a gold jackpot. */
  specialChance: 0.25,
  /** Special finds by weight. A Sigil found at the cap becomes the jackpot. */
  specials: [
    { kind: 'sigil', weight: 1 },
    { kind: 'jackpot', weight: 1 },
  ] as const,
  /** A jackpot is this many times the treasure's gold. */
  jackpotMultiplier: 5,
};

/** Loot by the tier of the dungeon that dropped the map (index 0 = tier 1). */
export const treasureTiers: TreasureTier[] = [
  {
    materials: [
      { materialId: 'wood', min: 4, max: 7, chance: 1 },
      { materialId: 'hide', min: 1, max: 3, chance: 0.7 },
      { materialId: 'herb', min: 1, max: 3, chance: 0.5 },
    ],
    gold: [15, 30],
  },
  {
    materials: [
      { materialId: 'stone', min: 4, max: 7, chance: 1 },
      { materialId: 'wood', min: 2, max: 4, chance: 0.7 },
      { materialId: 'bone', min: 1, max: 3, chance: 0.5 },
    ],
    gold: [30, 60],
  },
  {
    materials: [
      { materialId: 'copper', min: 4, max: 7, chance: 1 },
      { materialId: 'stone', min: 2, max: 4, chance: 0.7 },
      { materialId: 'hide', min: 2, max: 3, chance: 0.5 },
    ],
    gold: [60, 120],
  },
  {
    materials: [
      { materialId: 'iron', min: 4, max: 7, chance: 1 },
      { materialId: 'coal', min: 2, max: 4, chance: 0.7 },
      { materialId: 'bone', min: 2, max: 3, chance: 0.5 },
    ],
    gold: [120, 240],
  },
  {
    materials: [
      { materialId: 'iron', min: 5, max: 8, chance: 1 },
      { materialId: 'coal', min: 3, max: 5, chance: 1 },
      { materialId: 'steel', min: 1, max: 2, chance: 0.5 },
    ],
    gold: [240, 480],
  },
];
