import { heroClasses } from '@/content/heroes';
import { threatRules, type ThreatRules } from '@/content/threats';

import type { Ability, Briefing, HeroClassId, MealEffect, ThreatId } from '../types';
import { heroAnswers, type AnswersMember } from './answers';
import { scoreThreat, type ThreatState } from './score';

/** A briefing after the party's class signatures, before it is scored. */
export type SignatureBriefing = {
  briefing: Briefing;
  /** The hero whose signature cancelled the restriction (Curse-breaker, or a Cook for Spoiled stores). */
  cancelledBy: string | null;
  /** The Extreme threat a Scout lowered to Strong, and that Scout. */
  lowered: { threatId: ThreatId; heroId: string } | null;
};

const signaturesOf = <K extends Ability['kind']>(classId: HeroClassId, kind: K) =>
  heroClasses[classId].abilities.filter((a): a is Extract<Ability, { kind: K }> => a.kind === kind);

const SEVERITY: Record<ThreatState, number> = { met: 0, half: 1, full: 2 };

/**
 * What the party's signatures do to a briefing: a Curse-breaker cancels its
 * restriction (a Cook only Spoiled stores), then a Scout lowers the Extreme
 * threat that is worst for this party (full before half before met; the first
 * one on a tie) to Strong.
 */
export function signatureBriefing(briefing: Briefing, members: AnswersMember[], rules: ThreatRules = threatRules): SignatureBriefing {
  const restriction = briefing.restriction;
  const breaker = restriction
    ? members.find((m) => signaturesOf(m.classId, 'cancelRestriction').some((a) => !a.restriction || a.restriction === restriction))
    : undefined;
  const kept = breaker ? null : restriction;

  const scout = members.find((m) => signaturesOf(m.classId, 'lowerThreat').length > 0);
  const extreme = briefing.threats.filter((t) => t.level === 3);
  let threats = briefing.threats;
  let lowered: SignatureBriefing['lowered'] = null;
  if (scout && extreme.length > 0) {
    const answers = members.map((m) => heroAnswers(m, kept));
    const severity = (index: number) => SEVERITY[scoreThreat(extreme[index], answers, rules).state];
    let worst = 0;
    for (let i = 1; i < extreme.length; i++) if (severity(i) > severity(worst)) worst = i;
    threats = threats.map((t) => (t === extreme[worst] ? { ...t, level: 2 } : t));
    lowered = { threatId: extreme[worst].id, heroId: scout.heroId };
  }

  return { briefing: { ...briefing, restriction: kept, threats }, cancelledBy: breaker?.heroId ?? null, lowered };
}

/** The party's multipliers on missed threats' Delay (Ranger) and Hunger (Cook): the best of each counts, once. */
export function penaltyReduction(classIds: HeroClassId[]): { delay: number; hunger: number } {
  const best = (penalty: 'delay' | 'hunger') =>
    Math.min(1, ...classIds.flatMap((id) => signaturesOf(id, 'penaltyReduce').filter((a) => a.penalty === penalty).map((a) => a.multiplier)));
  return { delay: best('delay'), hunger: best('hunger') };
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
