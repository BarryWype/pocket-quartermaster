import type { SaveData } from '../save';
import { settleCart } from './cart';
import { settleCamps } from './production';
import { resolveRaid, settleRaids } from './raids';

/**
 * Settles the whole network to `now`, in time order where it matters: the cart
 * up to a raid's landing (a call there first saves its cargo), the raid, then
 * the cart, raids and camps to now.
 */
export function settleNetwork(save: SaveData, now: number, periodOffset = 0): SaveData {
  let next = save;
  const raid = next.supply.raid;
  if (raid && !raid.result && raid.landsAt <= now) next = resolveRaid(settleCart(next, raid.landsAt, periodOffset), periodOffset);
  next = settleCart(next, now, periodOffset);
  next = settleRaids(next, now, periodOffset);
  return settleCamps(next, now, periodOffset);
}
