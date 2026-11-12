import { tierMaterials } from '@/content/materials';

/** The base prices of the removed valuables, by id (see the version 45 migration). */
export const LEGACY_VALUABLE_PRICES: Record<string, number> = {
  oldCoins: 5,
  silverRing: 5,
  silverware: 5,
  roughGem: 5,
  goldChain: 12,
  silverChalice: 12,
  jadeIdol: 30,
  painting: 30,
  cutGem: 30,
};

/** Gold at each tier relative to tier 1, as the removed valuables were priced by their source's tier. */
export const LEGACY_GOLD_BY_TIER = [1, 1.9, 3, 4.2, 5.6];

/**
 * What each bought rank of the removed collector track refunds: its `rankPrice`
 * (gates [1, 2, 3], baseCost 150): 150, 270, 490 plus 15 copper on rank 3.
 */
export const LEGACY_COLLECTOR_TRACK_REFUND = [
  { gold: 150 },
  { gold: 270 },
  { gold: 490, materialId: tierMaterials[2], amount: 15 },
] as const;
