import { cullingRules } from '@/content/map';

import type { Bounds } from './foliage';
import type { LatLng } from './types';

/** Something drawn on the map at a position, with the id its marker uses. */
export type Cullable = { id: string; position: LatLng };

/**
 * The ids to draw: everything inside the visible bounds plus the margin (a
 * share of the view per side), plus the always-drawn ids (the selected patrol,
 * the open panel's place) wherever they stand. With no bounds yet — the map
 * has not told us where it looks — everything is drawn.
 */
export function cullIds(
  items: Cullable[],
  bounds: Bounds | null,
  always: string[],
  marginShare: number = cullingRules.marginShare,
): string[] {
  if (bounds === null) return items.map((item) => item.id);
  const [west, south, east, north] = bounds;
  const marginLng = (east - west) * marginShare;
  const marginLat = (north - south) * marginShare;
  const inside = ({ longitude, latitude }: LatLng) =>
    longitude >= west - marginLng &&
    longitude <= east + marginLng &&
    latitude >= south - marginLat &&
    latitude <= north + marginLat;
  return items.filter((item) => inside(item.position) || always.includes(item.id)).map((item) => item.id);
}

/**
 * Whether two id lists hold the same ids in the same order, so the caller can
 * skip an update that would change nothing the player sees.
 */
export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
