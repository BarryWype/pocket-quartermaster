import { gatheringConfig } from '@/content/gatheringConfig';
import { treasureRules, treasureTiers } from '@/content/treasure';

import { convertShards, ELEMENTS, shardId, type Element } from '../elements';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import { sigilCap } from '../guild/guild';
import type { SaveData } from '../save';
import type { MaterialStack, TreasureMap } from '../types';
import { rollLoot } from './loot';

export type TreasureContents = {
  gold: number;
  shards: { element: Element; amount: number };
  materials: MaterialStack[];
  special: { kind: 'sigil'; tier: number } | { kind: 'jackpot'; gold: number } | { kind: 'charter' } | null;
};

export const liveTreasureMaps = (save: SaveData, now: number) => save.treasureMaps.filter((m) => m.expiresAt > now);

/**
 * Where a map's treasure lies, fixed by the map's id: 200–800 m from where
 * the player stood when first reading it.
 */
export function treasureLocation(mapId: string, from: LatLng): LatLng {
  const rng = createRng(`treasure|${mapId}`);
  const [min, max] = treasureRules.distanceMeters;
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
    treasureMaps: save.treasureMaps.map((m) => (m.id === mapId ? { ...m, location: treasureLocation(mapId, position) } : m)),
  };
}

export function treasureContents(map: TreasureMap): TreasureContents {
  const rng = createRng(`treasure|${map.id}|loot`);
  const tier = treasureTiers[map.tier - 1];
  const gold = rng.int(tier.gold[0], tier.gold[1]);
  const shards = { element: ELEMENTS[rng.int(0, ELEMENTS.length - 1)], amount: tier.shards };
  const materials = rollLoot(rng, tier.materials);
  if (!rng.chance(treasureRules.specialChance)) return { gold, shards, materials, special: null };
  const kind = rng.weighted(treasureRules.specials, (s) => s.weight).kind;
  const special: TreasureContents['special'] =
    kind === 'sigil' ? { kind, tier: map.tier } : kind === 'jackpot' ? { kind, gold: gold * treasureRules.jackpotMultiplier } : { kind };
  return { gold, shards, materials, special };
}

/**
 * Digs up a read map's treasure once the player is in range of where it shows
 * on the map (`treasureAt`, its walkable position). A Sigil found at the cap
 * turns into the jackpot.
 */
export function collectTreasure(
  save: SaveData,
  mapId: string,
  player: LatLng,
  treasureAt: LatLng,
  now: number,
): { save: SaveData; contents: TreasureContents } {
  const map = liveTreasureMaps(save, now).find((m) => m.id === mapId);
  if (!map?.location) throw new Error(`Treasure map ${mapId} has not been read`);
  if (distanceMeters(player, treasureAt) > gatheringConfig.collectRadiusMeters) throw new Error('Too far from the treasure');

  let contents = treasureContents(map);
  if (contents.special?.kind === 'sigil' && save.sigils.length >= sigilCap(save)) {
    contents = { ...contents, special: { kind: 'jackpot', gold: contents.gold * treasureRules.jackpotMultiplier } };
  }
  const special = contents.special;
  return {
    contents,
    save: {
      ...save,
      gold: save.gold + contents.gold + (special?.kind === 'jackpot' ? special.gold : 0),
      materials: convertShards(
        addMaterials(save.materials, [...contents.materials, { materialId: shardId(contents.shards.element), amount: contents.shards.amount }]),
      ),
      sigils: special?.kind === 'sigil' ? [...save.sigils, special.tier] : save.sigils,
      charters: save.charters + (special?.kind === 'charter' ? 1 : 0),
      treasureMaps: save.treasureMaps.filter((m) => m.id !== mapId),
    },
  };
}
