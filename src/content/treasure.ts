import type { LootEntry } from '@/game/types';

type TreasureTier = {
  gold: [min: number, max: number];
  /** Shards of an element picked by the map. */
  shards: number;
  /** A little of the common materials at most: ore and ingots come from walking. */
  materials: LootEntry[];
};

export const treasureRules = {
  /** Where the treasure lies, measured from the player when the map is first read. */
  distanceMeters: [300, 1500] as [min: number, max: number],
  /** Chance of a special find on top: a Sanctum Sigil, a gold jackpot or a Guild Hall charter. */
  specialChance: 0.25,
  /** Special finds by weight. A Sigil found at the cap becomes the jackpot. */
  specials: [
    { kind: 'sigil', weight: 1 },
    { kind: 'jackpot', weight: 1 },
    { kind: 'charter', weight: 0.5 },
  ] as const,
  /** A jackpot is this many times the treasure's gold. */
  jackpotMultiplier: 5,
};

const commonFinds: LootEntry[] = [
  { materialId: 'herb', min: 1, max: 2, chance: 0.5 },
  { materialId: 'hide', min: 1, max: 2, chance: 0.3 },
];

/** Loot by the tier of the dungeon that dropped the map (index 0 = tier 1). Gold follows dungeon gold, ×2 per tier. */
export const treasureTiers: TreasureTier[] = [
  { gold: [15, 30], shards: 1, materials: commonFinds },
  { gold: [30, 60], shards: 2, materials: commonFinds },
  { gold: [60, 120], shards: 3, materials: commonFinds },
  { gold: [120, 240], shards: 4, materials: commonFinds },
  { gold: [240, 480], shards: 5, materials: commonFinds },
];
