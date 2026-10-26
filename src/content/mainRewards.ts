import type { MainRewardKind } from '@/game/types';

/** What a successful expedition's main reward roll can give, by weight. Add items here. */
export const mainRewardPool: { kind: MainRewardKind; weight: number }[] = [
  { kind: 'goldPouch', weight: 15 },
  { kind: 'sigil', weight: 20 },
  { kind: 'treasureMap', weight: 15 },
  { kind: 'lure', weight: 15 },
];

export const mainRewardRules = {
  /** A gold pouch is this many times a fresh roll of the dungeon's gold. */
  goldPouchMultiplier: 1,
  /** A Sigil at the cap becomes this many shards per tier, of an element picked by the expedition's seed. */
  capShardsPerTier: 2,
  /** A treasure map at the cap becomes this share of a gold roll. */
  mapCapGoldShare: 0.5,
  /** A boss's guaranteed reward and extra roll come with its first win each rotation day; later wins that day roll this chance once. */
  repeatMainRewardChance: 0.5,
  sigilCap: 3,
  /** Successful expeditions in a row without a Sigil before the next one is guaranteed one. */
  sigilPityAfter: 10,
  treasureMapCap: 3,
  treasureMapLifetimeHours: 48,
  lure: {
    durationMinutes: 30,
    /** Extra spawns appear within this distance of where the lure was used. */
    radiusMeters: 200,
    herbs: 6,
    animals: 3,
  },
};
