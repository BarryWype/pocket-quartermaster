import type { PlaceKind } from '@/content/places';
import { placeRules } from '@/content/places';
import { serviceRules } from '@/content/services';
import { xpRules } from '@/content/heroes';

import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import type { SaveData } from '../save';
import { currentHp, isExhausted, maxHp, settleHp, withHp } from '../team/health';
import { addXp, isAway } from '../team/team';
import type { HeroState } from '../types';
import type { PlaceSpawn } from './generate';
import { questEvent } from '../quests/progress';

export type CareKind = 'heal' | 'rest';

/** Problems every place service shares: the spawn has moved on, or the player is not at it. */
export type PlaceProblem = 'gone' | 'tooFar';

function placeProblem(spawn: PlaceSpawn, kind: PlaceKind, player: LatLng, now: number): PlaceProblem | null {
  if (spawn.kind !== kind || spawn.expiresAt <= now) return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  return null;
}

export type HeroCareProblem = 'away' | 'nothingToDo';

/** Whether the hero is home and the care would do something: a heal needs missing HP, a rest an exhaustion. */
export function heroCareProblem(save: SaveData, heroId: string, care: CareKind, now: number): HeroCareProblem | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero || isAway(save, heroId)) return 'away';
  const useful = care === 'heal' ? currentHp(save, hero, now) < maxHp(save, hero) : isExhausted(hero, now);
  return useful ? null : 'nothingToDo';
}

/** Cares for a hero at home: a heal restores full HP (exhaustion keeps pausing further healing); a rest ends the exhaustion, healing restarting from now. */
export function careForHero(save: SaveData, heroId: string, care: CareKind, now: number): SaveData {
  const settled = settleHp(save, now);
  return {
    ...settled,
    heroes: settled.heroes.map((hero) => {
      if (hero.id !== heroId) return hero;
      const max = maxHp(settled, hero);
      const hp = care === 'heal' ? max : currentHp(settled, hero, now);
      return withHp(hero, hp, max, now, care === 'heal' ? hero.exhaustedUntil : undefined);
    }),
  };
}

export type ChapelCareProblem = PlaceProblem | HeroCareProblem | 'visited';

/** Chapel care is free, but only once per visit. */
export function chapelCareProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  heroId: string,
  care: CareKind,
  player: LatLng,
  now: number,
): ChapelCareProblem | null {
  return (
    placeProblem(spawn, 'chapel', player, now) ??
    (spawn.id in save.chapelVisits ? 'visited' : heroCareProblem(save, heroId, care, now))
  );
}

/** Applies the chapel's free care and marks the visit used until the place moves on. */
export function chapelCare(save: SaveData, spawn: PlaceSpawn, heroId: string, care: CareKind, player: LatLng, now: number): SaveData {
  const problem = chapelCareProblem(save, spawn, heroId, care, player, now);
  if (problem) throw new Error(`Cannot give chapel care: ${problem}`);
  const cared = { ...careForHero(save, heroId, care, now), chapelVisits: { ...save.chapelVisits, [spawn.id]: spawn.expiresAt } };
  return questEvent(cared, { kind: 'placeUsed', placeId: spawn.id }, now);
}

export type BlessRelicsProblem = PlaceProblem | 'noRelics';

/** Blessing needs a stock of holy symbols; the ones in a hero's slot stay as they are. */
export function blessRelicsProblem(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): BlessRelicsProblem | null {
  return placeProblem(spawn, 'chapel', player, now) ?? ((save.consumables.holyRelics ?? 0) < 1 ? 'noRelics' : null);
}

/** Turns every held holy symbol into a blessed one; not limited by the visit. */
export function blessRelics(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): SaveData {
  const problem = blessRelicsProblem(save, spawn, player, now);
  if (problem) throw new Error(`Cannot bless holy symbols: ${problem}`);
  const held = save.consumables.holyRelics ?? 0;
  const blessed = {
    ...save,
    consumables: {
      ...save.consumables,
      holyRelics: 0,
      blessedRelics: (save.consumables.blessedRelics ?? 0) + held,
    },
  };
  return questEvent(blessed, { kind: 'placeUsed', placeId: spawn.id }, now);
}

export type ChapelBlessingProblem = PlaceProblem | 'alreadyBlessed';

export function chapelBlessingProblem(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): ChapelBlessingProblem | null {
  return placeProblem(spawn, 'chapel', player, now) ?? (save.expeditionBlessing ? 'alreadyBlessed' : null);
}

/** Takes the chapel's blessing, held until the next real expedition (patrols don't spend it). */
export function takeChapelBlessing(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): SaveData {
  const problem = chapelBlessingProblem(save, spawn, player, now);
  if (problem) throw new Error(`Cannot take the blessing: ${problem}`);
  return questEvent({ ...save, expeditionBlessing: true }, { kind: 'placeUsed', placeId: spawn.id }, now);
}

export type ApothecaryCareProblem = PlaceProblem | HeroCareProblem | 'gold';

/** Care at the apothecary, priced by the highest unlocked tier. */
export function apothecaryCarePrice(save: SaveData, care: CareKind) {
  const tier = highestUnlockedTier(save);
  return serviceRules.apothecary[care === 'heal' ? 'healPrice' : 'restPrice'][tier - 1];
}

export function apothecaryCareProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  heroId: string,
  care: CareKind,
  player: LatLng,
  now: number,
): ApothecaryCareProblem | null {
  return (
    placeProblem(spawn, 'apothecary', player, now) ??
    heroCareProblem(save, heroId, care, now) ??
    (save.gold < apothecaryCarePrice(save, care) ? 'gold' : null)
  );
}

/** Charges for care and applies it; the apothecary is never used up. */
export function apothecaryCare(
  save: SaveData,
  spawn: PlaceSpawn,
  heroId: string,
  care: CareKind,
  player: LatLng,
  now: number,
): SaveData {
  const problem = apothecaryCareProblem(save, spawn, heroId, care, player, now);
  if (problem) throw new Error(`Cannot give apothecary care: ${problem}`);
  return { ...careForHero(save, heroId, care, now), gold: save.gold - apothecaryCarePrice(save, care) };
}

/** Library training, priced and paid in XP by the highest unlocked tier. */
export const trainPrice = (save: SaveData) => serviceRules.library.trainPrice[highestUnlockedTier(save) - 1];
export const trainXp = (save: SaveData) => serviceRules.library.trainXp[highestUnlockedTier(save) - 1];

export type TrainProblem = PlaceProblem | 'away' | 'maxLevel' | 'gold';

export function trainProblem(save: SaveData, spawn: PlaceSpawn, heroId: string, player: LatLng, now: number): TrainProblem | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  return (
    placeProblem(spawn, 'library', player, now) ??
    (!hero || isAway(save, heroId) ? 'away' : hero.level >= xpRules.maxLevel ? 'maxLevel' : save.gold < trainPrice(save) ? 'gold' : null)
  );
}

/** Charges for a training session and gives the hero its XP; the library is never used up. */
export function trainHero(save: SaveData, spawn: PlaceSpawn, heroId: string, player: LatLng, now: number): SaveData {
  const problem = trainProblem(save, spawn, heroId, player, now);
  if (problem) throw new Error(`Cannot train ${heroId}: ${problem}`);
  return {
    ...save,
    gold: save.gold - trainPrice(save),
    heroes: save.heroes.map((hero): HeroState => (hero.id === heroId ? addXp(hero, trainXp(save), highestUnlockedTier(save)) : hero)),
  };
}
