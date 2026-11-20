import type { SaveData } from '../save';
import { effectiveRoute } from './autoRoute';
import { isLastDay } from './buildings';
import { orderProgress, type Order } from './orders';
import { serves } from './planner';
import type { Building } from './types';

/**
 * A line of the Network tab's flow picture. `carried`: the delivery route
 * holds both, so the cart takes the building's goods to the place. `possible`:
 * the building makes what the place wants, but the route doesn't join them yet.
 */
export type FlowLink = { building: string; place: string; kind: 'carried' | 'possible' };

export type FlowModel = {
  /** The buildings, anything in its last day first, then by time left. */
  buildings: Building[];
  /** The live orders, last day first, then by time left. */
  places: Order[];
  links: FlowLink[];
  /** The building and place ids on the delivery route the cart drives next. */
  onRoute: Set<string>;
};

/** Last day first, then soonest to leave. */
const byUrgency = (now: number) => (a: { expiresAt: number }, b: { expiresAt: number }) =>
  Number(isLastDay(b.expiresAt, now)) - Number(isLastDay(a.expiresAt, now)) || a.expiresAt - b.expiresAt;

/** What flows where: which building feeds which place now, and which could if the route joined them. */
export function flowModel(save: SaveData, now: number): FlowModel {
  const buildings = [...save.supply.buildings].sort(byUrgency(now));
  const places = Object.values(save.supply.orders)
    .filter((order) => order.expiresAt > now)
    .sort(byUrgency(now));
  const onRoute = new Set(
    effectiveRoute(save).flatMap((point) => ('building' in point ? [point.building] : 'place' in point ? [point.place] : [])),
  );
  const links: FlowLink[] = [];
  for (const building of buildings) {
    for (const order of places) {
      // A filled order wants nothing more: no line to it.
      if (orderProgress(order) >= 1 || !serves(order.wants, building.kind)) continue;
      links.push({
        building: building.id,
        place: order.placeId,
        kind: onRoute.has(building.id) && onRoute.has(order.placeId) ? 'carried' : 'possible',
      });
    }
  }
  return { buildings, places, links, onRoute };
}

/** The good the cart carries most of, or null when it is empty: the map and the flow picture show it as one icon. */
export const mainCargo = (cargo: Record<string, number>): string | null =>
  Object.entries(cargo).reduce<[string, number] | null>((best, [good, n]) => (n > 0 && (best === null || n > best[1]) ? [good, n] : best), null)?.[0] ?? null;
