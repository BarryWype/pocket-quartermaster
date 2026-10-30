/**
 * Shop prices and stock for map places. Placeholder prices, to be tuned with
 * the loot rework/balancing.
 */
import type { PlaceKind } from './places';

import type { Quality } from '@/game/types';

/** Gold per unit, at the market and as the base for shop prices. */
export const materialPrices: Record<string, number> = {
  wood: 1,
  stone: 1,
  copper: 2,
  iron: 3,
  coal: 4,
  hide: 1,
  meat: 1,
  bone: 1,
  herb: 1,
  berries: 1,
  mushroom: 2,
  fish: 2,
};

export const itemPrices: Record<string, number> = {
  healingPotion: 8,
  standardHealingPotion: 16,
  greaterHealingPotion: 32,
  emberWardSalve: 10,
  tideWardSalve: 10,
  stormWardSalve: 10,
  stoneWardSalve: 10,
  thornWardSalve: 10,
  trailMix: 3,
  jerky: 5,
  lantern: 12,
  roguesRoll: 12,
  huntersPack: 12,
};

export const shopRules = {
  /** Base price of a Normal gear piece, by item tier. */
  gearPrice: [10, 20, 40, 80, 160],
  qualityPrice: { crappy: 0.5, normal: 1, uncommon: 1.5, rare: 2, legendary: 4 } as Record<Quality, number>,
  /** Share of the buy price a smithy pays for a piece. */
  gearSellShare: 0.3,
  /** Share of the unit price the market pays for a material. */
  materialSellShare: 0.4,
  /** Places that buy monster parts, at the part's own price. */
  partBuyers: ['huntingLodge', 'apothecary'] as PlaceKind[],
  /** Base price of a recipe, by its tier. */
  recipePrice: [30, 60, 120, 240, 480],
  smithy: { gearLines: [2, 3] as [min: number, max: number], rareChance: 0.2 },
  market: { lines: 4, amount: [3, 8] as [min: number, max: number] },
  /**
   * Healing potions, weakest first. A stock line naming any of them sells the
   * strongest the player can brew, or with `weakerChance` the one below.
   */
  potions: { ladder: ['healingPotion', 'standardHealingPotion', 'greaterHealingPotion'], weakerChance: 0.5 },
};

/** One stock line of a place kind; `pool` picks the id at random instead of `id`. */
export type StockDef = { kind: 'material' | 'item'; id?: string; amount: [min: number, max: number]; pool?: string[] };

export const shopStock: Partial<Record<PlaceKind, StockDef[]>> = {
  sawmill: [{ kind: 'material', id: 'wood', amount: [5, 10] }],
  quarry: [{ kind: 'material', id: 'stone', amount: [5, 10] }],
  copperMine: [{ kind: 'material', id: 'copper', amount: [5, 10] }],
  ironMine: [{ kind: 'material', id: 'iron', amount: [5, 10] }],
  coalPit: [{ kind: 'material', id: 'coal', amount: [5, 10] }],
  huntingLodge: [
    { kind: 'material', id: 'hide', amount: [2, 4] },
    { kind: 'material', id: 'meat', amount: [2, 4] },
    { kind: 'material', id: 'bone', amount: [2, 4] },
  ],
  apothecary: [
    { kind: 'item', id: 'healingPotion', amount: [2, 4] },
    { kind: 'material', id: 'herb', amount: [3, 6] },
    { kind: 'item', pool: ['emberWardSalve', 'tideWardSalve', 'stormWardSalve', 'stoneWardSalve', 'thornWardSalve'], amount: [1, 2] },
  ],
};

export type MarketPoolEntry = { kind: 'material' | 'item'; id: string };

/** What a market can draw its lines from; ores above the player's pickaxe tier are left out at runtime. */
export const marketPool: MarketPoolEntry[] = [
  { kind: 'material', id: 'wood' },
  { kind: 'material', id: 'stone' },
  { kind: 'material', id: 'copper' },
  { kind: 'material', id: 'iron' },
  { kind: 'material', id: 'coal' },
  { kind: 'material', id: 'hide' },
  { kind: 'material', id: 'meat' },
  { kind: 'material', id: 'bone' },
  { kind: 'material', id: 'herb' },
  { kind: 'material', id: 'berries' },
  { kind: 'material', id: 'mushroom' },
  { kind: 'item', id: 'trailMix' },
  { kind: 'item', id: 'jerky' },
  { kind: 'item', id: 'healingPotion' },
  { kind: 'item', id: 'lantern' },
];

/** Pickaxe tier an ore needs before a market sells it. */
export const oreTier: Record<string, number> = { stone: 1, copper: 2, iron: 3, coal: 4 };
