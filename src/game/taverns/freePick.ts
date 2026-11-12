import { heroClasses, newHero } from '@/content/heroes';
import { heroNames, recruitRules } from '@/content/roster';
import { traits } from '@/content/traits';

import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { rosterFull } from '../team/team';
import { rolledSpecial } from '../team/specials';
import type { HeroClassId } from '../types';
import { rollRecruit } from './roll';
import { offerLevel, recruitPool } from './taverns';

type RecruitRules = typeof recruitRules;

/**
 * The free pick a tier boss's first clear offers (`recruitRules.freePick`):
 * `choices` classes of the next tier's tavern pool, each of a different
 * family the roster has none of (families it has come in only when too few
 * are left), drawn from the player's seed.
 */
export function freePickClasses(save: SaveData, rules: RecruitRules = recruitRules): HeroClassId[] {
  const { poolTier, choices } = rules.freePick;
  const rng = createRng(`freePick|${save.playerSeed}`);
  const held = new Set(save.heroes.map((h) => heroClasses[h.classId].familyTag));
  const pool = recruitPool(poolTier, rules).map(({ classId }) => classId);
  const fresh = pool.filter((classId) => !held.has(heroClasses[classId].familyTag));
  const picked: HeroClassId[] = [];
  for (const candidates of [fresh, pool]) {
    while (picked.length < choices) {
      const left = candidates.filter((c) => !picked.some((p) => heroClasses[p].familyTag === heroClasses[c].familyTag));
      if (left.length === 0) break;
      picked.push(left[rng.int(0, left.length - 1)]);
    }
  }
  return picked;
}

export type FreePickProblem = 'none' | 'rosterFull';

export function freePickProblem(save: SaveData, classId: HeroClassId): FreePickProblem | null {
  if (!save.freePick?.includes(classId)) return 'none';
  if (rosterFull(save)) return 'rosterFull';
  return null;
}

/** Takes the free pick: a recruit of that class at the tavern offers' level, a positive trait, at no cost. The pick is then gone. */
export function claimFreePick(save: SaveData, classId: HeroClassId): SaveData {
  const problem = freePickProblem(save, classId);
  if (problem) throw new Error(`Cannot take the free pick ${classId}: ${problem}`);
  const id = `freePick:${save.playerSeed}:${classId}`;
  const rng = createRng(id);
  const names = heroNames[classId];
  const positive = traits.filter((t) => t.positive);
  const roll = rollRecruit(id, recruitRules, classId);
  const hero = {
    ...newHero(`h${save.nextUid}`, names[rng.int(0, names.length - 1)], classId, positive[rng.int(0, positive.length - 1)].id, offerLevel(save), rolledSpecial(id, classId)),
    roll,
  };
  return { ...save, heroes: [...save.heroes, hero], freePick: null, nextUid: save.nextUid + 1 };
}
