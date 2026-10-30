import { lootConfig } from '@/content/loot/config';
import { valuables, type ValuableBuyer, type ValuableRarity } from '@/content/loot/valuables';

import { localDayKey } from '../gathering/gathering';
import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { valuablePrice } from './catalogue';
import type { LootRequest } from './roll';

/** A valuable drop: rarity by weight, then one of that rarity's valuables. */
export function rollValuable(req: LootRequest): { valuableId: string; tier: number; amount: number } {
  const rarity = req.rng.weighted(
    ['common', 'uncommon', 'rare'] as ValuableRarity[],
    (rarity) => lootConfig.valuables.rarityWeights[rarity],
  );
  const pool = valuables.filter((valuable) => valuable.rarity === rarity);
  return { valuableId: pool[req.rng.int(0, pool.length - 1)].id, tier: req.tier, amount: 1 };
}

/** The valuable the market's collector wants on a day, seeded on the spawn and the day. */
export function collectorWants(spawnId: string, dayKey: string): string {
  return createRng(`collector|${spawnId}|${dayKey}`).weighted(
    valuables,
    (valuable) => lootConfig.valuables.collectorWeights[valuable.id] ?? 1,
  ).id;
}

/** The collector this market uses today: the debug override on its day, else the daily pick. */
export function todaysCollector(save: SaveData, spawnId: string, now: number): string {
  const day = localDayKey(now);
  if (save.collectorOverride?.dayKey === day) return save.collectorOverride.valuableId;
  return collectorWants(spawnId, day);
}

/** What a buyer pays per valuable unit: 0 for non-buyers, full at some, half elsewhere, doubled when the market's collector wants it; `bonus` raises the price (Guild Hall). */
export function valuableSellPrice(id: string, tier: number, buyer: ValuableBuyer, wanted?: string | null, bonus = 0): number {
  const { fullPriceAt, elsewhereShare, buyers, collectorMultiplier } = lootConfig.valuables;
  if (!buyers.includes(buyer)) return 0;
  const price =
    valuablePrice(id, tier) *
    (fullPriceAt.includes(buyer) ? 1 : elsewhereShare) *
    (buyer === 'market' && wanted === id ? collectorMultiplier : 1) *
    (1 + bonus);
  return Math.max(1, Math.round(price));
}
