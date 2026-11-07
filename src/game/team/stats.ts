import { gamblerRules, growthRules, heroClasses } from '@/content/heroes';

import { createRng } from '../generation/rng';
import type { HeroClassDef, HeroClassId, HeroRoll, StatKey, Stats } from '../types';

export const STAT_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit'];

type GrowthRules = typeof growthRules;

/** A roll's pull on every stat: (sum − average) ÷ spread × the share, so a missing roll (the average) pulls nothing. */
export function rollFactors(roll: HeroRoll | undefined, rules: GrowthRules = growthRules) {
  const factor = (sum: number | undefined, share: number) => (((sum ?? rules.roll.average) - rules.roll.average) / rules.roll.spread) * share;
  return {
    base: Object.fromEntries(STAT_KEYS.map((stat) => [stat, factor(roll?.base[stat], rules.roll.base)])) as Record<StatKey, number>,
    growth: Object.fromEntries(STAT_KEYS.map((stat) => [stat, factor(roll?.growth[stat], rules.roll.growth)])) as Record<StatKey, number>,
  };
}

/** The class's stats at `level`: primaries grow every level, secondaries at the milestones, Luck at the cap. */
export function classBaseStats(
  def: HeroClassDef,
  level: number,
  roll: HeroRoll | undefined,
  rules: GrowthRules = growthRules,
): Stats {
  const { base, growth } = rollFactors(roll, rules);
  const milestones = rules.milestones.filter((milestone) => milestone <= level).length;
  // The Gambler's third primary comes from their roll.
  const primary = roll?.primary ? [...def.primary, roll.primary] : def.primary;
  const stats = {} as Stats;
  for (const stat of STAT_KEYS) {
    const steps = primary.includes(stat)
      ? rules.steps[stat] * (level - 1)
      : def.halfRate === stat
        ? (rules.steps[stat] / 2) * (level - 1)
        : rules.steps[stat] * milestones;
    stats[stat] = def.baseStats[stat] * (1 + base[stat]) + steps * (1 + growth[stat]);
  }
  stats.luck = level >= rules.luckLevel ? rules.luck : 0;
  return stats;
}

/** A hero's class stats at their level, with their recruit roll's pull. */
export function baseHeroStats(classId: HeroClassId, level: number, roll?: HeroRoll, rules: GrowthRules = growthRules) {
  return classBaseStats(heroClasses[classId], level, roll, rules);
}

/** A Gambler's third primary stat, drawn from the recruit's seed. */
export function rollGamblerPrimary(seed: string): StatKey {
  const rng = createRng(`gamblerPrimary|${seed}`);
  return gamblerRules.primaryChoices[rng.int(0, gamblerRules.primaryChoices.length - 1)];
}
