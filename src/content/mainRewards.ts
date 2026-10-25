import type { MainRewardKind } from '@/game/types';

/** What a successful expedition's main reward roll can give, by weight. Add items here. */
export const mainRewardPool: { kind: MainRewardKind; weight: number }[] = [
  { kind: 'goldPouch', weight: 30 },
  { kind: 'sigil', weight: 20 },
  { kind: 'treasureMap', weight: 15 },
  { kind: 'lure', weight: 15 },
];

export const mainRewardRules = {
  /** A gold pouch is this many times the dungeon's normal gold roll. */
  goldPouchMultiplier: [2, 3] as [min: number, max: number],
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
