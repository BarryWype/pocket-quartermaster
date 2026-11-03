import { classSpecials } from '@/content/classSpecials';
import { specialRules } from '@/content/specials';
import type { HeroClassId, SpecialId } from '@/game/types';

import { createRng, type Rng } from '../generation/rng';

/**
 * Rolls a hero's special from its class's pool: the rare one with
 * specialRules.rareChance, else one of the three commons uniformly.
 */
export function rollSpecial(rng: Rng, classId: HeroClassId): SpecialId {
  const pool = classSpecials[classId];
  if (rng.chance(specialRules.rareChance)) return pool.rare;
  return pool.common[rng.int(0, pool.common.length - 1)];
}

/** Whether a hero's special is its class's rare one. */
export const isRareSpecial = (classId: HeroClassId, special: SpecialId) => classSpecials[classId].rare === special;

/** The special a hero or offer with this id rolls: seeded on the id alone, so it never changes. */
export const rolledSpecial = (id: string, classId: HeroClassId) => rollSpecial(createRng(`special|${id}`), classId);
