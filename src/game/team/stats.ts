import { gamblerRules, growthRules, heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { approachRules } from '@/content/threats';

import { itemById } from '@/content/lookup';

import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import type { Approach, GearDef, HeroClassDef, HeroClassId, HeroRoll, HeroState, StatKey, Stats } from '../types';

export const STAT_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit'];
const APPROACHES: Approach[] = ['might', 'finesse', 'wits', 'faith', 'presence'];

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

/** A Gambler's approach scores for one rotation day: the points dealt one at a time to random approaches, none past the cap. */
export function rollGamble(heroId: string, day: number): Record<Approach, number> {
  const rng = createRng(`gamble|${heroId}|${day}`);
  const scores: Record<Approach, number> = { might: 0, finesse: 0, wits: 0, faith: 0, presence: 0 };
  for (let i = 0; i < gamblerRules.approachPoints; i++) {
    const open = APPROACHES.filter((approach) => scores[approach] < approachRules.max);
    scores[open[rng.int(0, open.length - 1)]] += 1;
  }
  return scores;
}

/** The hero's class approach scores: the class's, or a Gambler's roll of the day. */
export const classApproaches = (hero: HeroState): Record<Approach, number> =>
  hero.gamble?.approaches ?? heroClasses[hero.classId].approaches;

/** How many approach picks the hero still owes: milestones reached minus picks made. */
export function pendingApproachPicks(hero: HeroState, rules: GrowthRules = growthRules) {
  const reached = rules.approachMilestones.filter((milestone) => milestone <= hero.level).length;
  return Math.max(0, reached - (hero.approachPicks?.length ?? 0));
}

/** The +1s a hero's roll and picks add to their approaches (on top of class and trait). */
export function heroApproachBonus(hero: HeroState): Partial<Record<Approach, number>> {
  const bonus: Partial<Record<Approach, number>> = {};
  if (hero.roll?.approach) bonus[hero.roll.approach] = (bonus[hero.roll.approach] ?? 0) + 1;
  for (const pick of hero.approachPicks ?? []) bonus[pick] = (bonus[pick] ?? 0) + 1;
  return bonus;
}

/** What a hero's equipped gear adds to their approaches: a lute +1 Presence, a tome +1 Wits. */
export function gearApproachBonus(save: SaveData, hero: HeroState): Partial<Record<Approach, number>> {
  const bonus: Partial<Record<Approach, number>> = {};
  for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
    const gear = save.gear.find((g) => g.uid === hero.equipment[slot]);
    if (!gear) continue;
    const item = itemById[gear.itemId] as GearDef;
    const type = item.gearType;
    if (type === 'lute') bonus.presence = (bonus.presence ?? 0) + 1;
    if (type === 'tome') bonus.wits = (bonus.wits ?? 0) + 1;
    if (item.approach) bonus[item.approach] = (bonus[item.approach] ?? 0) + 1;
  }
  return bonus;
}

/** The hero's score for one approach: class base, trait modifiers and roll/pick/gear bonus, clamped. */
export function approachScore(hero: HeroState, approach: Approach, gearBonus: Partial<Record<Approach, number>> = {}) {
  const effects = traitById[hero.trait]?.effects ?? [];
  const add = effects.reduce((sum, e) => sum + (e.kind === 'approach' && e.approach === approach ? e.add : 0), 0);
  const base = classApproaches(hero)[approach];
  const score = base + add + (heroApproachBonus(hero)[approach] ?? 0) + (gearBonus[approach] ?? 0);
  return Math.min(approachRules.max, Math.max(approachRules.min, score));
}

/** Spends a pending approach pick; throws when nothing is pending or the approach is at the cap. */
export function pickApproach(save: SaveData, heroId: string, approach: Approach): SaveData {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`Unknown hero ${heroId}`);
  if (pendingApproachPicks(hero) < 1) throw new Error(`${hero.name} has no approach pick pending`);
  if (approachScore(hero, approach, gearApproachBonus(save, hero)) >= approachRules.max) {
    throw new Error(`${hero.name}'s ${approach} is already at ${approachRules.max}`);
  }
  return {
    ...save,
    heroes: save.heroes.map((h) => (h.id === heroId ? { ...h, approachPicks: [...(h.approachPicks ?? []), approach] } : h)),
  };
}
