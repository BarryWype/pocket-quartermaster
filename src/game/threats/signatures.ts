import { heroClasses } from '@/content/heroes';
import { threatRules, type ThreatRules } from '@/content/threats';

import type { Ability, ActiveThreat, Briefing, HeroClassId, MealEffect, ThreatId, ThreatLevel } from '../types';
import { heroAnswers, type AnswersMember } from './answers';
import { scoreThreat, type ThreatState } from './score';

/** A briefing after the party's class signatures, before it is scored. */
export type SignatureBriefing = {
  briefing: Briefing;
  /** The hero whose signature cancelled the restriction (Curse-breaker, or a Cook for Spoiled stores). */
  cancelledBy: string | null;
  /** The threat a Scout lowered one level (`to` 0: gone from the briefing), and that Scout. */
  lowered: { threatId: ThreatId; heroId: string; from: ThreatLevel; to: number } | null;
};

const signaturesOf = <K extends Ability['kind']>(classId: HeroClassId, kind: K) =>
  heroClasses[classId].abilities.filter((a): a is Extract<Ability, { kind: K }> => a.kind === kind);

const SEVERITY: Record<ThreatState, number> = { met: 0, half: 1, full: 2 };

/**
 * What the party's signatures do to a briefing: a Curse-breaker cancels its
 * restriction (a Cook only Spoiled stores), then a Scout lowers the threat
 * that is worst for this party by one level (full before half before met, then
 * the higher level; the first one on a tie); a level 1 threat is gone.
 */
export function signatureBriefing(briefing: Briefing, members: AnswersMember[], rules: ThreatRules = threatRules): SignatureBriefing {
  const restriction = briefing.restriction;
  const breaker = restriction
    ? members.find((m) => signaturesOf(m.classId, 'cancelRestriction').some((a) => !a.restriction || a.restriction === restriction))
    : undefined;
  const kept = breaker ? null : restriction;

  const scout = members.find((m) => signaturesOf(m.classId, 'lowerThreat').length > 0);
  let threats = briefing.threats;
  let lowered: SignatureBriefing['lowered'] = null;
  if (scout && threats.length > 0) {
    const answers = members.map((m) => heroAnswers(m));
    const severity = (t: ActiveThreat) => SEVERITY[scoreThreat(t, answers, rules).state] * 10 + t.level;
    const worst = threats.reduce((w, t) => (severity(t) > severity(w) ? t : w));
    const to = worst.level - 1;
    threats = to === 0 ? threats.filter((t) => t !== worst) : threats.map((t) => (t === worst ? { ...t, level: to as ThreatLevel } : t));
    lowered = { threatId: worst.id, heroId: scout.heroId, from: worst.level, to };
  }

  return { briefing: { ...briefing, restriction: kept, threats }, cancelledBy: breaker?.heroId ?? null, lowered };
}

/** The party's multipliers on missed threats' penalties (a penaltyReduce ability): the best of each threat counts, once. */
export function penaltyReduction(classIds: HeroClassId[]): { threats: Partial<Record<ThreatId, number>> } {
  const threats: Partial<Record<ThreatId, number>> = {};
  for (const id of classIds) {
    for (const ability of signaturesOf(id, 'penaltyReduce')) {
      threats[ability.threat] = Math.min(threats[ability.threat] ?? 1, ability.multiplier);
    }
  }
  return { threats };
}

/** The meal the party gets: none under Spoiled stores, its bonus multiplied by a Cook's (the best one counts). */
export function partyMeal(meal: MealEffect | null | undefined, briefing: Briefing, classIds: HeroClassId[]): MealEffect | null {
  if (!meal || briefing.restriction === 'spoiledStores') return null;
  const boost = Math.max(1, ...classIds.flatMap((id) => signaturesOf(id, 'mealBoost').map((a) => a.multiplier)));
  if (boost === 1) return meal;
  const excess = (multiplier: number) => 1 + (multiplier - 1) * boost;
  switch (meal.kind) {
    case 'bossHeal':
      return { ...meal, pct: meal.pct * boost };
    case 'retreat':
      return { ...meal, bonus: meal.bonus * boost };
    case 'speed':
      return { ...meal, add: meal.add * boost };
    case 'crit':
      return { ...meal, add: meal.add * boost };
    case 'penaltyCut':
      return meal;
    default:
      return { ...meal, multiplier: excess(meal.multiplier) };
  }
}
