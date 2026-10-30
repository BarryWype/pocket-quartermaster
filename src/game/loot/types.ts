import type { GearInstance, MasteryType, MaterialStack } from '@/game/types';

export const LOOT_CATEGORIES = [
  'gold',
  'xp',
  'materials',
  'shards',
  'blueprints',
  'gear',
  'trinkets',
  'components',
  'relics',
  'monsterParts',
  'valuables',
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
  'tierBoss',
  'overnightExpedition',
  'patrolGoblins',
  'patrolHerd',
  'patrolBandits',
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
  | { id: string; kind: 'quality'; steps: number };

/** What a roll gives. Shards, monster parts and components go in `materials`; trinkets in `gear`. */
export type Loot = {
  gold: number;
  xp: number;
  materials: MaterialStack[];
  consumables: { itemId: string; amount: number }[];
  lures: number;
  gear: GearInstance[]; // uid '' until granted
  recipeIds: string[];
  mastery: { type: MasteryType; tier: number; forges: number }[];
  keyFragments: number;
  treasureMaps: { rarity: MapRarity; tier: number }[];
  manuals: ManualRarity[];
  valuables: { valuableId: string; tier: number; amount: number }[];
  relics: string[];
  /** Every category that rolled a drop, even when its generator gave nothing (a tier boss's component without its boss). */
  dropped: LootCategory[];
};

export const emptyLoot = (): Loot => ({
  gold: 0,
  xp: 0,
  materials: [],
  consumables: [],
  lures: 0,
  gear: [],
  recipeIds: [],
  mastery: [],
  keyFragments: 0,
  treasureMaps: [],
  manuals: [],
  valuables: [],
  relics: [],
  dropped: [],
});
