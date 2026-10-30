import { placeRules } from '@/content/places';
import { ruinRules } from '@/content/placeActivities';

import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { rollForSave } from '../loot/context';
import { randomRelic } from '../loot/generators';
import { grantLoot } from '../loot/grant';
import type { Loot } from '../loot/types';
import type { PlaceSpawn } from './generate';
import type { SaveData } from '../save';
import type { DugRuin } from '../types';
import { questEvent } from '../quests/progress';

const HOUR_MS = 3_600_000;

/**
 * The ruins that grew where dug ones stood: each entry in `dugRuins` becomes a
 * replacement ruin a day later, elsewhere nearby, living its own window — and
 * diggable in turn, so chains form on their own.
 */
export function ruinReplacements(save: SaveData, now: number): PlaceSpawn[] {
  return Object.entries(save.dugRuins).flatMap(([id, dug]): PlaceSpawn[] => {
    const startsAt = dug.dugAt + ruinRules.respawnHours * HOUR_MS;
    const expiresAt = startsAt + ruinRules.lifetimeHours * HOUR_MS;
    if (!(startsAt <= now && now < expiresAt) || `${id}+` in save.usedPlaces) return [];
    const rng = createRng(`ruin-again|${id}`);
    const distance = rng.int(...ruinRules.replacementMeters);
    const bearing = rng.next() * 2 * Math.PI;
    return [
      {
        id: `${id}+`,
        kind: 'ruins',
        group: 'ruins',
        tile: 'replacement',
        position: offsetPosition(dug.position, Math.cos(bearing) * distance, Math.sin(bearing) * distance),
        startsAt,
        expiresAt,
        roll: 0,
      },
    ];
  });
}

export type DigProblem = 'gone' | 'tooFar';

/** Why this ruin cannot be dug from here now, or null. */
export function digProblem(save: SaveData, spawn: PlaceSpawn, player: { latitude: number; longitude: number }, now: number): DigProblem | null {
  if (spawn.kind !== 'ruins' || spawn.startsAt > now || spawn.expiresAt <= now || spawn.id in save.usedPlaces) {
    return 'gone';
  }
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  return null;
}

/** What a dig pays: the ruins row of the loot matrix, plus a relic on the dig that completes the set. */
export function ruinDig(save: SaveData, spawn: PlaceSpawn): { reward: Loot; relic: boolean } {
  const rng = createRng(`dig|${spawn.id}`);
  const relic = save.ruinsProgress + 1 >= ruinRules.relicEvery;
  const loot = rollForSave(save, 'ruinsDig', rng);
  return { reward: relic ? { ...loot, relics: [...loot.relics, randomRelic(highestUnlockedTier(save), rng)] } : loot, relic };
}

/**
 * Digs a ruin: pays the reward, hides the ruin for its window and records the
 * dig so a replacement grows elsewhere a day later. The dig that completes the
 * set pays a relic and starts the count again.
 */
export function digRuin(
  save: SaveData,
  spawn: PlaceSpawn,
  player: { latitude: number; longitude: number },
  now: number,
): { save: SaveData; reward: Loot; relic: boolean } {
  const problem = digProblem(save, spawn, player, now);
  if (problem) throw new Error(`Cannot dig this ruin: ${problem}`);
  const { reward, relic } = ruinDig(save, spawn);
  const granted = grantLoot(save, [], reward, now);
  return {
    save: questEvent({
      ...granted,
      ruinsProgress: relic ? 0 : save.ruinsProgress + 1,
      usedPlaces: { ...granted.usedPlaces, [spawn.id]: spawn.expiresAt },
      dugRuins: { ...granted.dugRuins, [spawn.id]: { dugAt: now, position: spawn.position } satisfies DugRuin },
    }, { kind: 'placeUsed', placeId: spawn.id }, now),
    reward,
    relic,
  };
}

/** Drops dug-ruin entries whose replacement has come and gone. */
export function pruneDugRuins(dugRuins: SaveData['dugRuins'], now: number): SaveData['dugRuins'] {
  const horizon = (ruinRules.respawnHours + ruinRules.lifetimeHours) * HOUR_MS;
  return Object.fromEntries(Object.entries(dugRuins).filter(([, dug]) => dug.dugAt + horizon > now));
}

/** The dig progress as dots, filled ones first: '●●●○○' for 2 of 5. */
export function ruinsDots(progress: number, every = ruinRules.relicEvery): string {
  return `${'●'.repeat(Math.min(progress, every))}${'○'.repeat(Math.max(0, every - progress))}`;
}
