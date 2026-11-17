import { placeInfo, placeRules, type PlaceKind } from '@/content/places';
import { siteGroup, supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { passRoute, questEvent } from '../quests/progress';
import { localDayIndex } from '../generation/localDays';
import { tileAt, tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import type { WalkableTile } from '../generation/walkable';
import { placeGroupOf, placesAround, type PlaceSpawn } from '../places/generate';
import { placedPosition } from '../places/placement';
import type { SaveData } from '../save';
import { personalTaverns } from '../taverns/personal';
import { withTavernName } from '../taverns/taverns';
import { personalSites, sitesAround } from './sites';
import { isOrderKind, makeOrder } from './orders';
import { t, tr, type TextKey } from '@/i18n';

/** The place kinds the network trades with (see content/supplyLines.ts). */
export type NetworkKind = (typeof supplyRules.discovery.kinds)[number];

export const isNetworkKind = (kind: PlaceKind): kind is NetworkKind =>
  supplyRules.discovery.kinds.includes(kind as NetworkKind);

export const isDiscovered = (save: SaveData, placeId: string) => placeId in save.supply.discovered;

/**
 * The network places around a position at a time: the network kinds' groups,
 * the world's sites, and the save's personal tavern and site.
 */
export function networkPlacesAround(save: SaveData, position: LatLng, timeMs: number): PlaceSpawn[] {
  const groups = [...new Set(supplyRules.discovery.kinds.map((kind) => placeGroupOf(kind)))].filter((group) => group.id !== siteGroup.id);
  return [
    ...placesAround(position, timeMs, groups),
    ...sitesAround(position, timeMs),
    ...personalTaverns(save, timeMs),
    ...personalSites(save, timeMs),
  ];
}

/**
 * Discovers every live, undiscovered network place within interaction range of
 * the position. The same save object comes back when nothing was found.
 */
export function discoverAt(
  save: SaveData,
  places: PlaceSpawn[],
  position: LatLng,
  timeMs: number,
): { save: SaveData; found: PlaceSpawn[] } {
  const found = places.filter(
    (place) =>
      isNetworkKind(place.kind) &&
      place.startsAt <= timeMs &&
      timeMs < place.expiresAt &&
      !isDiscovered(save, place.id) &&
      distanceMeters(position, place.position) <= placeRules.interactionMeters,
  );
  // Every position also walks a Ride-the-route quest on.
  const passed = passRoute(save, position, save.supply.hall ? tileCenter(save.supply.hall.cell) : null, timeMs);
  if (found.length === 0) return { save: passed, found };
  const discovered = { ...passed.supply.discovered };
  const orders = { ...passed.supply.orders };
  // The seed save carries the orders made so far, so two places of one kind differ in their headline.
  const next = { ...passed, supply: { ...passed.supply, discovered, orders } };
  for (const place of found) {
    discovered[place.id] = place.expiresAt;
    if (isOrderKind(place.kind)) orders[place.id] = makeOrder(next, place, timeMs);
  }
  return { save: questEvent(next, { kind: 'discovered', count: found.length }, timeMs), found };
}

/**
 * Walks a path's fixes, discovering the network places it passes; each fix sees
 * the places of its own time. Network places only change at the change hour, so
 * the places around a fix are generated once per tile and local day, snapped
 * onto the map's walkable ground (a place that does not place is not there).
 */
export function discoverAlong(
  save: SaveData,
  fixes: { position: LatLng; timestamp: number }[],
  tiles: Record<string, WalkableTile | null>,
): { save: SaveData; found: PlaceSpawn[] } {
  let next = save;
  const found: PlaceSpawn[] = [];
  const around = new Map<string, PlaceSpawn[]>();
  const precision = Math.max(...supplyRules.discovery.kinds.map((kind) => placeGroupOf(kind).precision));
  for (const fix of fixes) {
    const key = `${tileAt(fix.position, precision)}|${localDayIndex(fix.timestamp, placeRules.changeHourLocal)}`;
    if (!around.has(key)) {
      const places = networkPlacesAround(next, fix.position, fix.timestamp).flatMap((place) => {
        const placed = placedPosition(place, tiles);
        return placed === null ? [] : [{ ...place, position: placed }];
      });
      around.set(key, places);
    }
    const step = discoverAt(next, around.get(key)!, fix.position, fix.timestamp);
    next = step.save;
    found.push(...step.found);
  }
  return { save: next, found };
}

const wantsKey: Record<NetworkKind, TextKey> = {
  tavern: 'supply.discover.wants.tavern',
  smithy: 'supply.discover.wants.smithy',
  apothecary: 'supply.discover.wants.apothecary',
  market: 'supply.discover.wants.market',
  site: 'supply.discover.wants.site',
};

/** The map's note for places just discovered: the first one's name and wants, plus a count when several came at once. */
export function discoveryNote(found: PlaceSpawn[]): string | null {
  if (found.length === 0) return null;
  const name = (place: PlaceSpawn) => (place.kind === 'tavern' ? withTavernName(place).name : tr(placeInfo[place.kind].name));
  const [first] = found;
  const note = t('supply.discover.found', { name: name(first), wants: t(wantsKey[first.kind as NetworkKind]) });
  return found.length > 1 ? `${note} ${t('supply.discover.more', { count: found.length - 1 })}` : note;
}
