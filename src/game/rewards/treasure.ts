import { gatheringConfig } from '@/content/gatheringConfig';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { guildBonus } from '../guild/guild';
import { rollForSave, sourceAmounts } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { mapDistanceRange } from '../loot/treasure';
import type { Loot, MapRarity } from '../loot/types';
import type { SaveData } from '../save';
import type { TreasureMap } from '../types';

export const liveTreasureMaps = (save: SaveData, now: number) => save.treasureMaps.filter((m) => m.expiresAt > now);

/**
 * Where a map's treasure lies, fixed by the map's id: further from where the
 * player stood when first reading it the rarer the map.
 */
export function treasureLocation(mapId: string, from: LatLng, rarity: MapRarity): LatLng {
  const rng = createRng(`treasure|${mapId}`);
  const [min, max] = mapDistanceRange(rarity);
  const distance = min + rng.next() * (max - min);
  const bearing = rng.next() * 2 * Math.PI;
  return offsetPosition(from, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
}

/** Reading a map for the first time pins its treasure; later reads change nothing. */
export function readTreasureMap(save: SaveData, mapId: string, position: LatLng, now: number): SaveData {
  const map = liveTreasureMaps(save, now).find((m) => m.id === mapId);
  if (!map) throw new Error(`No live treasure map ${mapId}`);
  if (map.location) return save;
  return {
    ...save,
    treasureMaps: save.treasureMaps.map((m) => (m.id === mapId ? { ...m, location: treasureLocation(mapId, position, map.rarity) } : m)),
  };
}

/** What a map's treasure holds: the treasure spot row at the map's tier, scaled by its rarity, fixed by the map's id. */
export function treasureContents(save: SaveData, map: TreasureMap): Loot {
  const amounts = sourceAmounts('treasureSpot', map.tier);
  return rollForSave(save, 'treasureSpot', createRng(`treasure|${map.id}|loot`), {
    tier: map.tier,
    mapRarity: map.rarity,
    base: { gold: Math.round(amounts.gold * (1 + guildBonus(save, 'gold'))), xp: 0 },
  });
}

/**
 * Digs up a read map's treasure once the player is in range of where it shows
 * on the map (`treasureAt`, its walkable position).
 */
export function collectTreasure(
  save: SaveData,
  mapId: string,
  player: LatLng,
  treasureAt: LatLng,
  now: number,
): { save: SaveData; contents: Loot } {
  const map = liveTreasureMaps(save, now).find((m) => m.id === mapId);
  if (!map?.location) throw new Error(`Treasure map ${mapId} has not been read`);
  if (distanceMeters(player, treasureAt) > gatheringConfig.collectRadiusMeters) throw new Error('Too far from the treasure');
  const contents = treasureContents(save, map);
  const granted = grantLoot({ ...save, treasureMaps: save.treasureMaps.filter((m) => m.id !== mapId) }, [], contents, now);
  return { contents, save: granted };
}
