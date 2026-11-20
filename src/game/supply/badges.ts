import type { SaveData } from '../save';
import { effectiveRoute } from './autoRoute';
import { isLastDay } from './buildings';
import { buildingCap, buildingStockTotal, settleBuilding } from './production';
import { isAnnounced } from './raids';
import type { Building } from './types';

/**
 * A network marker's one badge, most urgent first: a raid coming, the last
 * day, full, nothing collecting it (off the delivery route or the cart
 * parked), no hero posted.
 */
export type NetworkBadge = 'raid' | 'last' | 'full' | 'idle' | 'nowork';

export const badgeOrder: NetworkBadge[] = ['raid', 'last', 'full', 'idle', 'nowork'];

/** The building's most urgent badge, or null when all is well. */
export function buildingBadge(save: SaveData, building: Building, now: number): NetworkBadge | null {
  const raid = save.supply.raid;
  if (raid && raid.buildingId === building.id && isAnnounced(save, raid, now)) return 'raid';
  if (isLastDay(building.expiresAt, now)) return 'last';
  const settled = settleBuilding(save, building, now);
  if (buildingStockTotal(settled) >= buildingCap(building)) return 'full';
  const onRoute = effectiveRoute(save).some((point) => 'building' in point && point.building === building.id);
  if (!onRoute || save.supply.cart.loop === null) return 'idle';
  if (!settled.heroId) return 'nowork';
  return null;
}
