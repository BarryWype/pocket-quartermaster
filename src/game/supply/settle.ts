import type { SaveData } from '../save';
import { settleCart } from './cart';
import { settleBuildings } from './production';
import { resolveRaid, settleRaids } from './raids';

/**
 * Removes the buildings whose life ended at `at`: their stock is lost, their
 * posted hero is simply free again, and a raid on one is dropped. Route points
 * naming them are skipped by the cart as missing.
 */
function dropExpiredBuildings(save: SaveData, at: number): SaveData {
  const gone = save.supply.buildings.filter((b) => b.expiresAt <= at).map((b) => b.id);
  if (gone.length === 0) return save;
  const raid = save.supply.raid && gone.includes(save.supply.raid.buildingId) ? null : save.supply.raid;
  return { ...save, supply: { ...save.supply, buildings: save.supply.buildings.filter((b) => b.expiresAt > at), raid } };
}

/**
 * Settles the whole network to `now`, in time order where it matters: the cart
 * up to a raid's landing (a call there first saves its cargo), the raid, then
 * each expired building's moment — the cart and the buildings settle up to it
 * (a cart call just before still collects the stock) before it goes — and
 * finally the cart, raids and buildings to now.
 */
export function settleNetwork(save: SaveData, now: number): SaveData {
  let next = save;
  const raid = next.supply.raid;
  if (raid && !raid.result && raid.landsAt <= now) next = resolveRaid(settleCart(next, raid.landsAt));
  for (const expiresAt of [...new Set(next.supply.buildings.filter((b) => b.expiresAt <= now).map((b) => b.expiresAt))].sort((a, b) => a - b)) {
    next = dropExpiredBuildings(settleBuildings(settleCart(next, expiresAt), expiresAt), expiresAt);
  }
  next = settleCart(next, now);
  next = settleRaids(next, now);
  return settleBuildings(next, now);
}
