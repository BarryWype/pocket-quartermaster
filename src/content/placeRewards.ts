// PLACEHOLDER reward tables, replaced by the loot rework; only rollPlaceReward reads them.
import type { PlaceKind } from './places';
import type { LootEntry, Quality } from '@/game/types';

/** What a win at one kind of place can pay, as shares of the tier's short dungeon. */
export type PlaceRewardTable = {
  goldShareOfShort: number;
  /** The loot holds about this many gathering nodes' worth of materials. */
  cacheNodes?: number;
  /** Loot rolled on a win. */
  loot?: LootEntry[];
  /** Shards of the place's element (the rift's spawn-chosen, the lair's rolled). */
  shards?: [min: number, max: number];
  /** Chance of one consumable from the pool. */
  consumableChance?: number;
  consumablePool?: string[];
  /** Chance of one key fragment. */
  keyFragmentChance?: number;
  /** Chance of teaching one unknown forge recipe within the player's tier. */
  recipeChance?: number;
  /** Chance of one forged gear piece within the player's tier. */
  gearChance?: number;
  gearQuality?: Quality;
};

export const placeRewardTables: Partial<Record<PlaceKind, PlaceRewardTable>> = {
  banditCamp: { goldShareOfShort: 2, cacheNodes: 2, gearChance: 0.2, gearQuality: 'normal' },
  goblinRaid: {
    goldShareOfShort: 0.5,
    cacheNodes: 3,
    consumableChance: 0.25,
    consumablePool: ['healingPotion', 'strengthDraught', 'ironskinBrew', 'firebomb', 'smokeBomb'],
  },
  beastDen: {
    goldShareOfShort: 0.5,
    loot: [
      { materialId: 'hide', min: 2, max: 4, chance: 1 },
      { materialId: 'bone', min: 2, max: 3, chance: 1 },
      { materialId: 'meat', min: 3, max: 5, chance: 1 },
    ],
  },
  hauntedCrypt: {
    goldShareOfShort: 0.5,
    loot: [{ materialId: 'bone', min: 3, max: 5, chance: 1 }],
    keyFragmentChance: 0.3,
  },
  elementalRift: { goldShareOfShort: 0, shards: [2, 4] },
  abandonedCaravan: {
    goldShareOfShort: 1,
    cacheNodes: 3,
    consumableChance: 0.4,
    consumablePool: ['healingPotion', 'strengthDraught', 'ironskinBrew', 'firebomb', 'smokeBomb', 'jerky', 'trailMix'],
    recipeChance: 0.1,
  },
  wantedOutlaw: { goldShareOfShort: 3, gearChance: 0.15, gearQuality: 'rare' },
  monsterLair: {
    goldShareOfShort: 6,
    cacheNodes: 6,
    shards: [4, 4],
    gearChance: 0.5,
    gearQuality: 'rare',
    keyFragmentChance: 0.25,
  },
};
