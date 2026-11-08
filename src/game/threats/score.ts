import { familyOfThreat } from '@/content/families';
import { familyLevel } from '../families/families';
import { threatRules, type ThreatRules } from '@/content/threats';

import type { FamilyId } from '@/content/families';
import type { ActiveThreat, Briefing, OpportunityDef, ThreatLevel } from '../types';
import type { HeroAnswers, TagSource } from './answers';

/** Met: no penalty. Half (one tag short): half of every number. Full (two or more short): everything. */
export type ThreatState = 'met' | 'half' | 'full';

export type ThreatScore = {
  threat: ActiveThreat;
  state: ThreatState;
  /** The party's tags of the threat's family, and the tags it needs: one per threat level. */
  have: number;
  needed: number;
  /** Who answers it: every hero contributing a tag of its family, or a familyVsThreat bonus. */
  coveredBy: { heroId: string; source: TagSource }[];
};

const stateOf = (have: number, needed: number): ThreatState => {
  const shortfall = Math.max(0, needed - have);
  return shortfall === 0 ? 'met' : shortfall === 1 ? 'half' : 'full';
};

/** The hero's familyVsThreat bonuses that apply to this threat. */
function bonusesOf(answers: HeroAnswers, family: FamilyId, level: ThreatLevel) {
  return answers.bonuses.filter((b) => b.family === family && (!b.levels || b.levels.includes(level)));
}

/** The party's count of the family's tags, familyVsThreat bonuses included, never below 0. */
export function familyCount(party: HeroAnswers[], family: FamilyId, level: ThreatLevel): number {
  const tags = party.reduce((sum, a) => sum + a.tags.filter((t) => t.family === family).reduce((n, t) => n + t.count, 0), 0);
  const bonuses = party.reduce((sum, a) => sum + bonusesOf(a, family, level).reduce((n, b) => n + b.add, 0), 0);
  return Math.max(0, tags + bonuses);
}

/** One threat against a party: its state, and who of the party answers it. */
export function scoreThreat(threat: ActiveThreat, party: HeroAnswers[], rules: ThreatRules = threatRules): ThreatScore {
  const family = familyOfThreat(threat.id);
  const have = familyCount(party, family, threat.level);
  const needed = threat.level;
  const coveredBy = party.flatMap(({ heroId, tags, bonuses }): { heroId: string; source: TagSource }[] => {
    const tag = tags.find((t) => t.family === family);
    if (tag) return [{ heroId, source: tag.source }];
    const bonus = bonusesOf({ heroId, tags, bonuses }, family, threat.level)[0];
    return bonus ? [{ heroId, source: bonus.source }] : [];
  });
  return { threat, have, needed, state: stateOf(have, needed), coveredBy };
}

export type BriefingScore = {
  threats: ThreatScore[];
};

/** Every threat of a briefing against a party. */
export function scoreBriefing(briefing: Briefing, party: HeroAnswers[], rules: ThreatRules = threatRules): BriefingScore {
  return { threats: briefing.threats.map((t) => scoreThreat(t, party, rules)) };
}

export type OpportunityScore = {
  answered: boolean;
};

/**
 * Whether a party takes an opportunity: free ones always; a costly one when
 * one of its answers is met (the cost is not paid), or else when opted in and
 * the cost paid.
 */
export function scoreOpportunity(opportunity: OpportunityDef, party: HeroAnswers[], optIn = false): OpportunityScore {
  if (opportunity.answers.length === 0) return { answered: true };
  const met = opportunity.answers.some((answer) => familyLevel(familyCount(party, answer.family, answer.level)) >= answer.level);
  return { answered: met || (optIn && !!opportunity.cost) };
}
