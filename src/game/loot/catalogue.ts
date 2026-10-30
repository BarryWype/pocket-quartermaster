import { lootConfig } from '@/content/loot/config';
import { valuableById } from '@/content/lookup';

/** A valuable's full price at the market: its base price times its source's tier. */
export function valuablePrice(id: string, tier: number): number {
  const valuable = valuableById[id];
  if (!valuable) throw new Error(`Unknown valuable ${id}`);
  return Math.round(valuable.basePrice * lootConfig.valuablePriceByTier[tier - 1]);
}
