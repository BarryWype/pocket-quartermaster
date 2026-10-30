import { useEffect, useMemo } from 'react';

import { dockRules } from '@/content/placeActivities';
import { placeRules } from '@/content/places';
import { questRules } from '@/content/quests';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { mapTileAt, mapTileKey, nearWater } from '@/game/generation/walkable';
import type { SaveData } from '@/game/save';
import { tipSpots } from '@/game/secrets/tips';
import { useGameStore } from '@/store/gameStore';

import { useWalkableTiles } from './useWalkableTiles';

const zoom = placeRules.placement.mapZoom;
const tileKey = (point: LatLng) => mapTileKey(mapTileAt(point, zoom));

/**
 * Resolves secret quests whose strange mark the player is at, or reached
 * while the app was closed: once the map tiles around the underwater
 * dungeon's possible spots are in, so the water check can run.
 */
export function useQuestMarks(save: SaveData, player: LatLng | null) {
  const reachMark = useGameStore((state) => state.reachMark);
  const reached = save.quests.list.filter(
    (quest) =>
      quest.objective === 'mark' &&
      quest.doneAt === null &&
      quest.acceptedAt !== null &&
      quest.target !== null &&
      (quest.reachedAt !== undefined || (player !== null && distanceMeters(player, quest.target.position) <= questRules.arrivalMeters)),
  );
  const ids = reached.map((quest) => quest.id).join(',');
  const keys = useMemo(
    () =>
      [
        ...new Set(
          reached.flatMap((quest) =>
            tipSpots({ id: `underwaterDungeon|${quest.id}`, secret: 'underwaterDungeon', source: 'quest', anchor: quest.target!.position }).map(tileKey),
          ),
        ),
      ]
        .sort()
        .join(','),
    [ids], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tiles = useWalkableTiles(keys);
  const ready = keys.split(',').filter(Boolean).every((key) => key in tiles);

  useEffect(() => {
    if (!ids || !ready) return;
    const isNearWater = (point: LatLng) => {
      const tile = tiles[tileKey(point)];
      return tile ? nearWater(tile, point, dockRules.waterMeters) : false;
    };
    for (const id of ids.split(',')) reachMark(id, isNearWater);
  }, [ids, ready, tiles, reachMark]);
}
