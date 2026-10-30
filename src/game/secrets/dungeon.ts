import { underwaterDungeonId, underwaterThreatBase } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';
import { placeRules } from '@/content/places';
import { secretRules } from '@/content/secrets';
import { dungeonThreats, threatRules } from '@/content/threats';

import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { startExpedition, type Loadout } from '../expeditions/expeditions';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import type { ActiveThreat, Briefing, DungeonDef, ThreatId } from '../types';
import { hasKey, spendKey } from './keys';
import { tipForPlace } from './tips';

/** The underwater dungeon of the player's highest unlocked tier. */
export function underwaterDungeonFor(save: SaveData): DungeonDef {
  const tier = Math.min(5, Math.max(1, highestUnlockedTier(save)));
  return dungeonById[underwaterDungeonId(tier)];
}

/** The underwater dungeon's own briefing: Underwater first, then its base dungeon's other threats at the same level. */
export function underwaterBriefing(save: SaveData, place: { id: string }): Briefing {
  const dungeon = underwaterDungeonFor(save);
  const level = secretRules.underwaterLevelByTier[dungeon.tier - 1];
  const table = dungeonThreats[underwaterThreatBase[dungeon.id]];
  const rng = createRng(`underwater|${place.id}`);
  const threats: ActiveThreat[] = [{ id: 'underwater', level }];
  let eligible = (Object.entries(table.weights) as [ThreatId, number][])
    .filter(([id]) => id !== 'underwater')
    .map(([id, weight]) => ({ id, weight }));
  const count = threatRules.compose.threatCount[dungeon.tier - 1];
  while (threats.length < count && eligible.length > 0) {
    const pick = rng.weighted(eligible, (e) => e.weight);
    eligible = eligible.filter((e) => e.id !== pick.id);
    threats.push({ id: pick.id, level, ...(pick.id === 'element' && table.element ? { element: table.element } : {}) });
  }
  return { threats, restriction: null, opportunity: null };
}

export function underwaterLaunchProblem(save: SaveData, place: PlaceSpawn, player: LatLng, now: number): 'gone' | 'tooFar' | 'noKey' | null {
  const tip = tipForPlace(save, place.id);
  if (!tip || tip.expiresAt <= now || place.id in save.usedPlaces) return 'gone';
  if (distanceMeters(player, place.position) > placeRules.interactionMeters) return 'tooFar';
  if (!hasKey(save)) return 'noKey';
  return null;
}

/** Launches the tipped underwater dungeon: spends a key and uses the place up. */
export function launchUnderwater(
  save: SaveData,
  place: PlaceSpawn,
  heroIds: string[],
  player: LatLng,
  now: number,
  loadout: Loadout = {},
): SaveData {
  const problem = underwaterLaunchProblem(save, place, player, now);
  if (problem) throw new Error(`Cannot launch: ${problem}`);
  const spent = spendKey(save);
  const dungeon = underwaterDungeonFor(save);
  const next = startExpedition(spent, dungeon.id, heroIds, now, 1, undefined, loadout, underwaterBriefing(save, place));
  return { ...next, usedPlaces: { ...next.usedPlaces, [place.id]: place.expiresAt } };
}
