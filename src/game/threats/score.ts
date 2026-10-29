import { itemById, threatById } from '@/content/lookup';
import { approachRules, threatRules, type ThreatRules } from '@/content/threats';

import type { ActiveThreat, Approach, Briefing, ConsumableDef, OpportunityDef, ThreatId } from '../types';
import type { HeroAnswers, KeywordSource } from './answers';

/** Met: no penalty. Half (one short): half of every number. Full (two or more short): everything. */
export type ThreatState = 'met' | 'half' | 'full';

export type ThreatScore = {
  threat: ActiveThreat;
  state: ThreatState;
  /** What the party has, and what the level needs. */
  have: number;
  needed: number;
  /** Locked, forced with Might instead of Finesse: met, but some loot is lost. */
  forced?: boolean;
  /** Locals, answered with Might instead of Presence: no help, and no fight. */
  intimidated?: boolean;
  /** Who or what answers it: the best hero for an approach threat, every holder otherwise. */
  coveredBy: { heroId: string; source: KeywordSource }[];
  /** Heroes whose kit, removed, would change the result (see salvage). */
  kitHeroes: string[];
};

const kitOf = (kitItemId: string | null) => (kitItemId ? ((itemById[kitItemId] as ConsumableDef).kit ?? null) : null);

/** Whether a kit's +2 counts for this threat answered by this approach: kits lift only the threats they cover. */
export function kitApplies(kitItemId: string | null, threatId: ThreatId, approach: Approach) {
  const kit = kitOf(kitItemId);
  if (!kit || !kit.threats.includes(threatId)) return false;
  return kit.approach === 'threat' || kit.approach === approach;
}

/** A hero's score for an approach threat, with their kit's +2 when it covers the threat, capped at 5. */
export function approachScore(answers: HeroAnswers, threatId: ThreatId, approach: Approach, withKit: boolean) {
  const bonus = withKit && kitApplies(answers.kitItemId, threatId, approach) ? approachRules.kitBonus : 0;
  return Math.min(approachRules.max, answers.approaches[approach] + bonus);
}

/** The hero's answers without their kit: its keywords and its salve's resist are gone, and no more kit +2. */
function withoutKit(answers: HeroAnswers): HeroAnswers {
  const salve = answers.kitItemId ? (itemById[answers.kitItemId] as ConsumableDef).protectsAgainst : undefined;
  return {
    ...answers,
    kitItemId: null,
    keywords: answers.keywords.filter((k) => k.source !== 'kit'),
    resists: salve ? answers.resists.filter((e) => e !== salve) : answers.resists,
  };
}

const stateOf = (have: number, needed: number): ThreatState => {
  const shortfall = Math.max(0, needed - have);
  return shortfall === 0 ? 'met' : shortfall === 1 ? 'half' : 'full';
};

/** The best hero for an approach, with their kit's +2 when it covers the threat: at most one entry. */
function coverOf(party: HeroAnswers[], threatId: ThreatId, approach: Approach): ThreatScore['coveredBy'] {
  let best: HeroAnswers | null = null;
  let score = -1;
  for (const answers of party) {
    const value = approachScore(answers, threatId, approach, true);
    if (value > score) {
      best = answers;
      score = value;
    }
  }
  if (!best) return [];
  return [{ heroId: best.heroId, source: kitApplies(best.kitItemId, threatId, approach) ? 'kit' : 'class' }];
}

/** One threat against a party, before kit impact. */
function scoreOnce(threat: ActiveThreat, party: HeroAnswers[], rules: ThreatRules): Omit<ThreatScore, 'kitHeroes'> {
  const def = threatById[threat.id];
  const { answer } = def;

  if (answer.kind === 'approach') {
    const needed = rules.levels.approach[threat.level - 1];
    const best = (approach: Approach) => Math.max(0, ...party.map((a) => approachScore(a, threat.id, approach, true)));
    const have = best(answer.approach);
    const coveredBy = coverOf(party, threat.id, answer.approach);
    // The alternative stands in for a missing answer: Might forces Locked, Might intimidates Locals.
    if (def.alternative && stateOf(have, needed) !== 'met' && best(def.alternative) >= needed) {
      return {
        threat,
        have: best(def.alternative),
        needed,
        state: 'met',
        ...(def.id === 'locked' ? { forced: true } : {}),
        ...(def.id === 'locals' ? { intimidated: true } : {}),
        coveredBy: coverOf(party, threat.id, def.alternative),
      };
    }
    return { threat, have, needed, state: stateOf(have, needed), coveredBy };
  }

  const needed = rules.levels.keyword[threat.level - 1];
  if (answer.kind === 'keyword') {
    const holders = party.filter((a) => a.keywords.some((k) => k.keyword === answer.keyword));
    return {
      threat,
      have: holders.length,
      needed,
      state: stateOf(holders.length, needed),
      coveredBy: holders.map((a) => ({
        heroId: a.heroId,
        source: a.keywords.find((k) => k.keyword === answer.keyword)!.source,
      })),
    };
  }

  const holders = party.filter((a) => a.resists.includes(threat.element!));
  return {
    threat,
    have: holders.length,
    needed,
    state: stateOf(holders.length, needed),
    coveredBy: holders.map((a) => ({
      heroId: a.heroId,
      // A class resist, or the ward salve in the hero's slot.
      source:
        a.kitItemId && (itemById[a.kitItemId] as ConsumableDef).protectsAgainst === threat.element
          ? ('kit' as const)
          : ('class' as const),
    })),
  };
}

/** One threat of a briefing against a party: its state, who answered it, and the kits it hinged on. */
export function scoreThreat(threat: ActiveThreat, party: HeroAnswers[], rules: ThreatRules = threatRules): ThreatScore {
  const base = scoreOnce(threat, party, rules);
  const without = (hero: HeroAnswers) => party.map((a) => (a === hero ? withoutKit(a) : a));
  const kitHeroes = party
    .filter((a) => a.kitItemId)
    .filter((hero) => {
      const rescored = scoreOnce(threat, without(hero), rules);
      return rescored.state !== base.state || rescored.forced !== base.forced || rescored.intimidated !== base.intimidated;
    })
    .map((a) => a.heroId);
  return { ...base, kitHeroes };
}

export type BriefingScore = {
  threats: ThreatScore[];
  /** Heroes whose kit, removed, would change any threat's result. */
  kitHeroes: string[];
};

/** Every threat of a briefing against a party. */
export function scoreBriefing(briefing: Briefing, party: HeroAnswers[], rules: ThreatRules = threatRules): BriefingScore {
  const threats = briefing.threats.map((t) => scoreThreat(t, party, rules));
  return { threats, kitHeroes: [...new Set(threats.flatMap((t) => t.kitHeroes))] };
}

export type OpportunityScore = {
  answered: boolean;
  /** The hero whose kit answered it, when one did. */
  kitHeroId: string | null;
};

/** Whether a party takes an opportunity: free ones always, costly ones (Refugees) only when opted in. */
export function scoreOpportunity(opportunity: OpportunityDef, party: HeroAnswers[], optIn = false): OpportunityScore {
  if (opportunity.cost && !optIn) return { answered: false, kitHeroId: null };
  // A kit lifts its own approach here too (a Rogue's roll helps find a cache); Explorer's kit only lifts its threats.
  const score = (a: HeroAnswers, approach: Approach) =>
    Math.min(approachRules.max, a.approaches[approach] + (kitOf(a.kitItemId)?.approach === approach ? approachRules.kitBonus : 0));
  const met = (heroes: HeroAnswers[]) =>
    opportunity.answers.length === 0 ||
    opportunity.answers.some((answer) =>
      'approach' in answer
        ? heroes.some((a) => score(a, answer.approach) >= answer.score)
        : heroes.some((a) => a.keywords.some((k) => k.keyword === answer.keyword)),
    );
  if (!met(party)) return { answered: false, kitHeroId: null };
  const helper = party.find((hero) => hero.kitItemId && !met(party.map((a) => (a === hero ? withoutKit(a) : a))));
  return { answered: true, kitHeroId: helper?.heroId ?? null };
}
