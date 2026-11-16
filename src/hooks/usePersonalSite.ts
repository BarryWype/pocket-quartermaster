import { useEffect, useMemo } from 'react';

import { placePlacement } from '@/game/places/placement';
import type { LatLng } from '@/game/generation/types';
import { mapTileAt, mapTileKey, placePoint } from '@/game/generation/walkable';
import type { SaveData } from '@/game/save';
import { personalSites, personalSiteSpots } from '@/game/supply/sites';
import { tavernPeriod } from '@/game/taverns/personal';
import { useGameStore } from '@/store/gameStore';

import { useSupplyOn } from './useSupply';
import { useWalkableTiles } from './useWalkableTiles';

const tileKey = (point: LatLng) => mapTileKey(mapTileAt(point, placePlacement.mapZoom));

/**
 * The period's personal site, mirroring the personal tavern: once the switch is
 * on, the period's first map position runs the guarantee check, but only once
 * its candidate spots' map tiles are in, so the site snaps onto a walkable
 * place before it shows.
 */
export function usePersonalSite(save: SaveData, position: LatLng | null, now: number): ReturnType<typeof personalSites> {
  const on = useSupplyOn();
  const checkPersonalSite = useGameStore((state) => state.checkPersonalSite);
  const period = tavernPeriod(now);
  const due = on && position !== null && save.supply.personalSite?.period !== period;
  // Keyed by the period, not the position: the origin stays the one where the check first became due.
  const spots = useMemo(() => (due && position ? personalSiteSpots(save, position, now) : []), [due, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => [...new Set(spots.map(tileKey))].sort().join(','), [spots]);
  const tiles = useWalkableTiles(keys);
  const ready = keys.split(',').filter(Boolean).every((key) => key in tiles);

  useEffect(() => {
    if (!due || !position || !ready) return;
    checkPersonalSite(position, (point) => placePoint(point, tiles, placePlacement) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, ready, tiles, checkPersonalSite, position?.latitude, position?.longitude]);

  const minute = Math.floor(now / 60_000);
  return useMemo(() => (on ? personalSites(save, minute * 60_000) : []), [on, save.supply.personalSite, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}
