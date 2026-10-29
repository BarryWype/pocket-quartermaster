import { growthRules } from '@/content/heroes';
import { recruitRules } from '@/content/roster';

import { createRng } from '../generation/rng';
import { rollGamblerPrimary, STAT_KEYS } from '../team/stats';
import type { Approach, HeroClassId, HeroRoll, StatKey } from '../types';

type RecruitRules = typeof recruitRules;

/** A recruit's grade, by the total of their roll's 16 sums. */
export type Grade = 'S' | 'A' | 'B' | 'C';

const APPROACHES: Approach[] = ['might', 'finesse', 'wits', 'faith', 'presence'];

/** One 3d6 sum, 3–18. */
const d6x3 = (rng: ReturnType<typeof createRng>) => rng.int(1, 6) + rng.int(1, 6) + rng.int(1, 6);

/**
 * A recruit's roll, drawn from the offer id alone: base 3d6 sums per stat in
 * STAT_KEYS order, then growth sums in the same order, then a chance of +1 on
 * a random approach. Luck isn't rolled. A Gambler also gets their third
 * primary stat, from its own seed.
 */
export function rollRecruit(offerId: string, rules: RecruitRules = recruitRules, classId?: HeroClassId): HeroRoll {
  const rng = createRng(`recruitRoll|${offerId}`);
  const draw = () => Object.fromEntries(STAT_KEYS.map((stat) => [stat, d6x3(rng)])) as Record<StatKey, number>;
  const roll: HeroRoll = { base: draw(), growth: draw() };
  if (rng.chance(rules.roll.approachChance)) roll.approach = APPROACHES[rng.int(0, APPROACHES.length - 1)];
  if (classId === 'gambler') roll.primary = rollGamblerPrimary(offerId);
  return roll;
}

/** The total of the roll's 16 sums against the average (168). */
const rollTotal = (roll: HeroRoll) =>
  Math.round(
    STAT_KEYS.reduce((sum, stat) => sum + roll.base[stat] + roll.growth[stat], 0) - 2 * STAT_KEYS.length * growthRules.roll.average,
  );

/** S from +18, A from +6, B from −6, else C. */
export function recruitGrade(roll: HeroRoll, rules: RecruitRules = recruitRules): Grade {
  const total = rollTotal(roll);
  if (total >= rules.roll.grade.S) return 'S';
  if (total >= rules.roll.grade.A) return 'A';
  if (total >= rules.roll.grade.B) return 'B';
  return 'C';
}

/** The grade's price multiplier, applied on top of today's factors. */
export function gradePriceMultiplier(grade: Grade, rules: RecruitRules = recruitRules) {
  return rules.roll.gradePrice[grade];
}

/** Per-stat arrows: 'up' when the pair of sums is well above 21 (the pair's average), 'down' well below. */
export function statArrows(roll: HeroRoll, rules: RecruitRules = recruitRules): Partial<Record<StatKey, 'up' | 'down'>> {
  const average = growthRules.roll.average * 2;
  const arrows: Partial<Record<StatKey, 'up' | 'down'>> = {};
  for (const stat of STAT_KEYS) {
    const sum = roll.base[stat] + roll.growth[stat];
    if (sum >= average + rules.roll.arrowThreshold) arrows[stat] = 'up';
    else if (sum <= average - rules.roll.arrowThreshold) arrows[stat] = 'down';
  }
  return arrows;
}
