import { useEffect, useMemo } from 'react';

import { tavernRules } from '@/content/taverns';
import { walkableRules } from '@/content/walkable';
import { rotationDay } from '@/game/dungeons/rotation';
import type { LatLng } from '@/game/generation/types';
import { mapTileAt, mapTileKey, placePoint } from '@/game/generation/walkable';
import { isRevealed } from '@/game/reveal/reveal';
import type { SaveData } from '@/game/save';
import { personalTavernSpots, personalTaverns } from '@/game/taverns/personal';
import { isTavernUnlocked, type TavernSpawn } from '@/game/taverns/taverns';
import { useGameStore } from '@/store/gameStore';

import { useWalkableTiles } from './useWalkableTiles';

const placement = { ...walkableRules, ...tavernRules.placement };
const tileKey = (point: LatLng) => mapTileKey(mapTileAt(point, placement.mapZoom));

/**
 * The day's personal tavern. Once taverns are open, the first map position of
 * the day runs the guarantee check, but only once its candidate spots' map
 * tiles are in, so the tavern snaps onto a walkable place before it shows.
 */
export function usePersonalTavern(save: SaveData, position: LatLng | null, now: number): TavernSpawn[] {
  const checkPersonalTavern = useGameStore((state) => state.checkPersonalTavern);
  const day = rotationDay(now);
  const due = position !== null && isTavernUnlocked(save) && isRevealed(save, 'taverns') && save.personalTavern?.day !== day;
  // Keyed by the day, not the position: the origin stays the one where the check first became due.
  const spots = useMemo(() => (due && position ? personalTavernSpots(save, position, now) : []), [due, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => [...new Set(spots.map(tileKey))].sort().join(','), [spots]);
  const tiles = useWalkableTiles(keys);
  const ready = keys.split(',').filter(Boolean).every((key) => key in tiles);

  useEffect(() => {
    if (!due || !position || !ready) return;
    checkPersonalTavern(position, (p) => placePoint(p, tiles, placement) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, ready, tiles, checkPersonalTavern, position?.latitude, position?.longitude]);

  const minute = Math.floor(now / 60_000);
  return useMemo(() => personalTaverns(save, minute * 60_000), [save.personalTavern, save.stats.questsDone, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}
