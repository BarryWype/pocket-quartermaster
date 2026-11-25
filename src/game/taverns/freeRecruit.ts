import { newHero } from '@/content/heroes';
import { heroNames, recruitRules } from '@/content/roster';
import { traits } from '@/content/traits';

import { highestUnlockedTier } from '../expeditions/expeditions';
import { rosterCap } from '../guild/guild';
import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { rolledTrade } from '../supply/trades';
import { rolledSpecial } from '../team/specials';
import type { FreeRecruit } from '../types';
import { recruitGrade, rollRecruit } from './roll';
import { offerLevel, pickRecruitClass } from './taverns';

export type { FreeRecruit };

/**
 * A free recruit offer, rolled from its seed: a pool class for the player's
 * tier, at the tavern offers' level. `positiveTrait` is the traveller's
 * always-positive behaviour, or `'roll'` to draw the trait pool like the
 * tavern offers do.
 */
export function rollFreeRecruit(save: SaveData, seedKey: string, id: string, positiveTrait: boolean | 'roll'): FreeRecruit {
  const rng = createRng(seedKey);
  const classId = pickRecruitClass(rng, highestUnlockedTier(save), undefined, new Set(save.heroes.map((h) => h.classId)));
  const names = heroNames[classId];
  const positive = positiveTrait === 'roll' ? rng.chance(recruitRules.positiveTraitChance) : positiveTrait;
  const pool = traits.filter((t) => t.positive === positive);
  const roll = rollRecruit(id, undefined, classId);
  return {
    id,
    classId,
    name: names[rng.int(0, names.length - 1)],
    trait: pool[rng.int(0, pool.length - 1)].id,
    special: rolledSpecial(id, classId),
    level: offerLevel(save),
    roll,
    grade: recruitGrade(roll),
  };
}

/** Takes a free recruit up on joining the roster. */
export function joinFreeRecruit(save: SaveData, offer: FreeRecruit): SaveData {
  if (save.heroes.length >= rosterCap(save)) throw new Error('Roster is full');
  const hero = { ...newHero(`h${save.nextUid}`, offer.name, offer.classId, offer.trait, offer.level, offer.special, rolledTrade(offer.id)), roll: offer.roll };
  return { ...save, heroes: [...save.heroes, hero], nextUid: save.nextUid + 1 };
}

/** What a free recruit came to: joined, or paid gold with no room on the roster. */
export type RecruitOutcome = { offer: FreeRecruit; joined: boolean; gold: number };

/** A free recruit joins when the roster has room, else pays the tier's full-roster gold. */
export function freeRecruitOrGold(save: SaveData, offer: FreeRecruit, tier: number): { save: SaveData; outcome: RecruitOutcome } {
  if (save.heroes.length < rosterCap(save)) return { save: joinFreeRecruit(save, offer), outcome: { offer, joined: true, gold: 0 } };
  const gold = recruitRules.fullRosterGold[tier - 1];
  return { save: { ...save, gold: save.gold + gold }, outcome: { offer, joined: false, gold } };
}
