import { placeRules } from '@/content/places';
import { heistRules } from '@/content/placeActivities';

import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import type { PlaceSpawn } from './generate';
import type { SaveData } from '../save';
import { isExhausted } from '../team/health';
import { isAway } from '../team/team';
import { answersMemberOf, prepareParty } from '../expeditions/simulate';
import { heroAnswers } from '../threats/answers';
import { scoreThreat, type ThreatState } from '../threats/score';
import type { ActiveThreat, Heist } from '../types';
import type { LatLng } from '../generation/types';

const MINUTE = 60_000;

/** The Locked threat's level at the player's highest unlocked tier. */
export function heistLevel(save: SaveData): number {
  return heistRules.levelByTier[Math.min(heistRules.levelByTier.length - 1, Math.max(0, highestUnlockedTier(save) - 1))];
}

/**
 * How one hero fares against the guild's locks: the existing approach scoring
 * for a Locked threat at the heist's level, with the hero alone (kit included).
 */
export function heistScore(save: SaveData, heroId: string): ThreatState {
  const threat: ActiveThreat = { id: heistRules.threat, level: heistLevel(save) as 1 | 2 | 3 };
  const party = prepareParty(save, [heroId]).map((member) => heroAnswers(answersMemberOf(member)));
  return scoreThreat(threat, party).state;
}

export type HeistProblem = 'gone' | 'tooFar' | 'away' | 'exhausted';

/** Why this hero cannot rob this guild from here now, or null. */
export function heistProblem(save: SaveData, spawn: PlaceSpawn, heroId: string, player: LatLng, now: number): HeistProblem | null {
  if (
    spawn.kind !== 'thievesGuild' ||
    spawn.startsAt > now ||
    spawn.expiresAt <= now ||
    save.heists.some((h) => h.placeId === spawn.id)
  ) {
    return 'gone';
  }
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero || isAway(save, heroId)) return 'away';
  if (isExhausted(hero, now)) return 'exhausted';
  return null;
}

/**
 * Sends one hero on a heist: the minutes and the outcome are rolled now, the
 * pay waits for the heist's end. The hero counts as away until then.
 */
export function startHeist(save: SaveData, spawn: PlaceSpawn, heroId: string, player: LatLng, now: number): SaveData {
  const problem = heistProblem(save, spawn, heroId, player, now);
  if (problem) throw new Error(`Cannot start this heist: ${problem}`);
  const id = `heist${save.nextUid}`;
  const rng = createRng(`${id}|${spawn.id}`);
  const minutes = rng.int(...heistRules.minutes);
  const success = rng.chance(heistRules.successChance[heistScore(save, heroId)]);
  // A success pays the heist row of the loot matrix, rolled now and paid at the end.
  const reward = success ? rollForSave(save, 'heist', rng) : emptyLoot();
  return {
    ...save,
    heists: [
      ...save.heists,
      { id, placeId: spawn.id, heroId, startedAt: now, endsAt: now + minutes * MINUTE, success, reward } satisfies Heist,
    ],
    nextUid: save.nextUid + 1,
  };
}

/**
 * Settles the heists whose time is up: a success pays its reward, the hero is
 * free to go again. A failure pays nothing.
 */
export function resolveHeists(save: SaveData, now: number): { save: SaveData; resolved: Heist[] } {
  const due = save.heists.filter((heist) => heist.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  if (due.length === 0) return { save, resolved: [] };
  let next: SaveData = { ...save, heists: save.heists.filter((heist) => heist.endsAt > now) };
  for (const heist of due) {
    if (heist.success) next = grantLoot(next, [], heist.reward, heist.endsAt);
  }
  return { save: next, resolved: due };
}

/** The hero's chance of pulling the heist off, for display. */
export function heistOdds(save: SaveData, heroId: string): number {
  return heistRules.successChance[heistScore(save, heroId)];
}
