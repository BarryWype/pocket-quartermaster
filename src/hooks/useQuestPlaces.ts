import { useMemo } from 'react';

import { dockRules } from '@/content/placeActivities';
import { placeRules } from '@/content/places';
import { questRules } from '@/content/quests';
import { walkableRules } from '@/content/walkable';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { mapTileAt, mapTileKey, nearWater, placePoint } from '@/game/generation/walkable';
import { placesWithin, type PlaceSpawn } from '@/game/places/generate';
import { ruinReplacements } from '@/game/places/ruins';
import type { SaveData } from '@/game/save';

import { useWalkableTiles } from './useWalkableTiles';

const placement = { ...walkableRules, ...placeRules.placement };
const tileKey = (point: LatLng) => mapTileKey(mapTileAt(point, placement.mapZoom));
const longest = questRules.bandMeters.long[1];

/**
 * The places a quest can point at: every place within the long band of the
 * player and of each target's first fix, placed on walkable spots like the
 * map's (fishing docks only near water). `ready` once every map tile they
 * need is in, so a quest is never sent elsewhere for a tile still loading.
 */
export function useQuestPlaces(save: SaveData, player: LatLng | null, now: number): { places: PlaceSpawn[]; ready: boolean } {
  const minute = Math.floor(now / 60_000);
  const centres = useMemo(() => {
    const froms = save.quests.list.flatMap((quest) => (quest.doneAt === null && quest.target ? [quest.target.from] : []));
    return player ? [player, ...froms] : froms;
  }, [save.quests.list, player?.latitude, player?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = useMemo(() => {
    const reach = longest + placement.maxSnapMeters;
    const byId = new Map<string, PlaceSpawn>();
    for (const centre of centres) {
      for (const place of placesWithin(centre, reach, minute * 60_000)) byId.set(place.id, place);
    }
    for (const ruin of ruinReplacements(save, minute * 60_000)) {
      if (centres.some((centre) => distanceMeters(centre, ruin.position) <= reach)) byId.set(ruin.id, ruin);
    }
    return [...byId.values()];
  }, [centres, minute, save.dugRuins]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useMemo(() => [...new Set(raw.map((place) => tileKey(place.position)))].sort().join(','), [raw]);
  const tiles = useWalkableTiles(keys);
  return useMemo(() => {
    const ready = keys.split(',').filter(Boolean).every((key) => key in tiles);
    const places = raw.flatMap((place) => {
      const position = placePoint(place.position, tiles, placement);
      if (!position) return [];
      const tile = tiles[tileKey(place.position)];
      if (place.kind === 'fishingDock' && !(tile && nearWater(tile, position, dockRules.waterMeters))) return [];
      return [{ ...place, position }];
    });
    return { places, ready };
  }, [raw, tiles, keys]);
}
