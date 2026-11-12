import type { MaterialStack } from '@/game/types';
import type { Rarity } from '@/content/gear';

export const LOOT_CATEGORIES = [
  'gold',
  'xp',
  'materials',
  'shards',
  'blueprints',
  'gear',
  'trinkets',
  'trophies',
  'relics',
  'monsterParts',
  'consumables',
  'treasureMaps',
  'manuals',
  'keyFragments',
] as const;
export type LootCategory = (typeof LOOT_CATEGORIES)[number];

export const LOOT_MARKS = ['—', 'R/2', 'R', 'S', 'O', 'A'] as const;
export type LootMark = (typeof LOOT_MARKS)[number];

export const LOOT_SOURCES = [
  'dungeonRun',
  'firstWin',
  'firstTierClear',
  'firstDungeonClear',
  'tierBoss',
  'overnightExpedition',
  'patrol',
  'traveller',
  'banditCamp',
  'goblinRaid',
  'beastDen',
  'hauntedCrypt',
  'elementalRift',
  'abandonedCaravan',
  'wantedOutlaw',
  'monsterLair',
  'ruinsDig',
  'heist',
  'fishingDock',
  'treasureSpot',
  'sanctum',
  'stepChest',
  'questShort',
  'questMedium',
  'questLong',
  'secretQuest',
] as const;
export type LootSourceId = (typeof LOOT_SOURCES)[number];

export type LootSourceRow = {
  name: string;
  visitsPerDay: number;
  marks: Record<LootCategory, LootMark>;
  notes: string;
};

export type MapRarity = 'common' | 'rare' | 'legendary';
export type ManualRarity = MapRarity;

/** Charm hook: the same `id` from two heroes counts once. */
export type LootModifier =
  | { id: string; kind: 'chance'; category: LootCategory; multiplier: number }
  | { id: string; kind: 'luck'; add: number }
  | { id: string; kind: 'gold'; percent: number }
  | { id: string; kind: 'xp'; percent: number }
  | { id: string; kind: 'rarity'; steps: number };

/**
 * A looted piece before it is granted: its uid is filled in then, and its
 * rolls happen with it (makeGearPiece seeds everything by the uid).
 */
export type RolledGear = { uid: ''; itemId: string; rarity: Rarity };

/** What a roll gives. Shards, stones and monster parts go in `materials`; trinkets in `gear`. */
export type Loot = {
  gold: number;
  xp: number;
  materials: MaterialStack[];
  consumables: { itemId: string; amount: number }[];
  lures: number;
  gear: RolledGear[];
  recipeIds: string[];
  keyFragments: number;
  treasureMaps: { rarity: MapRarity; tier: number }[];
  manuals: ManualRarity[];
  relics: string[];
  /** Every category that rolled a drop. */
  dropped: LootCategory[];
  /** The work-tool scavenge merged into `materials`, kept apart so reports can tell it from rolled loot. */
  scavenged?: MaterialStack[];
  /** What trophies and a complete blueprint tier's overflow brought (merged above), kept apart for reports. */
  trophies?: TrophyDrop[];
};

/** One trophy or blueprint overflow: its kind and what it added. */
export type TrophyDrop = { kind: 'relic' | 'parts' | 'stone' | 'overflow'; gold: number; parts: number; relics: number; stones: number };

export const emptyLoot = (): Loot => ({
  gold: 0,
  xp: 0,
  materials: [],
  consumables: [],
  lures: 0,
  gear: [],
  recipeIds: [],
  keyFragments: 0,
  treasureMaps: [],
  manuals: [],
  relics: [],
  dropped: [],
});
