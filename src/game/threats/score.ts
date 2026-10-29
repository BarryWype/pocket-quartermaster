import { itemById, threatById } from '@/content/lookup';
import { approachRules, threatRules, type ThreatRules } from '@/content/threats';

import type { ActiveThreat, Approach, Briefing, ConsumableDef, Keyword, KitEffect, OpportunityDef, ThreatId } from '../types';
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

/** A kit a hero brings: their own, or one a Porter carries for them (`ownerId` is the Porter). */
type HeroKit = { itemId: string; kit: KitEffect; ownerId: string; source: 'kit' | 'carried'; bonus: number };

/** The hero's kits with the approach bonus each gives them: an Engineer's own kit gives more. */
function kitsOf(answers: HeroAnswers): HeroKit[] {
  const extra = answers.signatures.reduce((sum, s) => sum + (s.kind === 'kitBonus' ? s.add : 0), 0);
  const kits: HeroKit[] = [];
  const own = kitOf(answers.kitItemId);
  if (own) kits.push({ itemId: answers.kitItemId!, kit: own, ownerId: answers.heroId, source: 'kit', bonus: (own.bonus ?? approachRules.kitBonus) + extra });
  const carried = answers.carriedKit && kitOf(answers.carriedKit.itemId);
  if (carried) {
    kits.push({ itemId: answers.carriedKit!.itemId, kit: carried, ownerId: answers.carriedKit!.porterId, source: 'carried', bonus: carried.bonus ?? approachRules.kitBonus });
  }
  return kits;
}

/** Whether a kit's +2 counts for this threat answered by this approach: kits lift only the threats they cover. */
export function kitApplies(kitItemId: string | null, threatId: ThreatId, approach: Approach) {
  const kit = kitOf(kitItemId);
  if (!kit || !kit.threats.includes(threatId)) return false;
  return kit.approach === 'threat' || kit.approach === approach;
}

/** The hero's best kit for this threat and approach, if any covers it. */
function bestKit(answers: HeroAnswers, threatId: ThreatId, approach: Approach) {
  return kitsOf(answers)
    .filter((k) => kitApplies(k.itemId, threatId, approach))
    .sort((a, b) => b.bonus - a.bonus)[0];
}

/**
 * A hero's score for an approach threat: their approach with their class
 * signature for this threat (Exorcist +1 Faith on Desecrated ground, Diplomat
 * Presence 5 for Locals) and their best kit's bonus when it covers the threat,
 * capped at 5.
 */
export function approachScore(answers: HeroAnswers, threatId: ThreatId, approach: Approach, withKit: boolean) {
  const signatures = answers.signatures.filter(
    (s): s is Extract<HeroAnswers['signatures'][number], { kind: 'approachFor' }> =>
      s.kind === 'approachFor' && s.threat === threatId && s.approach === approach,
  );
  const add = signatures.reduce((sum, s) => sum + (s.add ?? 0), 0);
  const floor = Math.max(0, ...signatures.map((s) => s.score ?? 0));
  const kit = withKit ? bestKit(answers, threatId, approach) : undefined;
  return Math.min(approachRules.max, Math.max(floor, answers.approaches[approach] + add + (kit?.bonus ?? 0)));
}

/** A hero's score for an opportunity's approach: a kit lifts its own approach here too (a Rogue's roll helps find a cache). */
export function opportunityApproachScore(answers: HeroAnswers, approach: Approach) {
  const bonus = Math.max(0, ...kitsOf(answers).filter((k) => k.kit.approach === approach).map((k) => k.bonus));
  return Math.min(approachRules.max, answers.approaches[approach] + bonus);
}

/** The hero's answers without one of their kits: its keywords and its salve's resist are gone, and no more kit bonus. */
function withoutKit(answers: HeroAnswers, source: 'kit' | 'carried'): HeroAnswers {
  const itemId = source === 'kit' ? answers.kitItemId : answers.carriedKit?.itemId;
  const salve = itemId ? (itemById[itemId] as ConsumableDef).protectsAgainst : undefined;
  const otherId = source === 'kit' ? answers.carriedKit?.itemId : answers.kitItemId;
  const otherSalve = otherId ? (itemById[otherId] as ConsumableDef).protectsAgainst : undefined;
  return {
    ...answers,
    ...(source === 'kit' ? { kitItemId: null } : { carriedKit: null }),
    keywords: answers.keywords.filter((k) => k.source !== source),
    resists: salve && salve !== otherSalve ? answers.resists.filter((e) => e !== salve) : answers.resists,
  };
}

const stateOf = (have: number, needed: number): ThreatState => {
  const shortfall = Math.max(0, needed - have);
  return shortfall === 0 ? 'met' : shortfall === 1 ? 'half' : 'full';
};

/** The best hero for an approach, with their kit's bonus when it covers the threat: at most one entry. */
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
  return [{ heroId: best.heroId, source: bestKit(best, threatId, approach)?.source ?? 'class' }];
}

/** How many heroes this one counts as for a keyword threat: 1 with the keyword, or their class signature's count. */
function holderCount(answers: HeroAnswers, threat: ActiveThreat, keyword: Keyword) {
  const has = answers.keywords.some((k) => k.keyword === keyword) ? 1 : 0;
  const counts = answers.signatures.map((s) =>
    s.kind === 'keywordCount' && s.threat === threat.id && (!s.levels || s.levels.includes(threat.level)) ? s.count : 0,
  );
  return Math.max(has, ...counts);
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
    const holders = party.filter((a) => holderCount(a, threat, answer.keyword) > 0);
    const have = holders.reduce((sum, a) => sum + holderCount(a, threat, answer.keyword), 0);
    return {
      threat,
      have,
      needed,
      state: stateOf(have, needed),
      coveredBy: holders.map((a) => ({
        heroId: a.heroId,
        // A signature that counts for more than the keyword is the class's doing.
        source:
          holderCount(a, threat, answer.keyword) > 1
            ? ('class' as const)
            : (a.keywords.find((k) => k.keyword === answer.keyword)?.source ?? ('class' as const)),
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
          : a.carriedKit && (itemById[a.carriedKit.itemId] as ConsumableDef).protectsAgainst === threat.element
            ? ('carried' as const)
            : ('class' as const),
    })),
  };
}

/** One threat of a briefing against a party: its state, who answered it, and the kits it hinged on. */
export function scoreThreat(threat: ActiveThreat, party: HeroAnswers[], rules: ThreatRules = threatRules): ThreatScore {
  const base = scoreOnce(threat, party, rules);
  const changes = (without: HeroAnswers[]) => {
    const rescored = scoreOnce(threat, without, rules);
    return rescored.state !== base.state || rescored.forced !== base.forced || rescored.intimidated !== base.intimidated;
  };
  // A carried kit's impact is its Porter's: it is their slot that is salvaged or spent.
  const kitHeroes = party.flatMap((hero) =>
    kitsOf(hero)
      .filter((k) => changes(party.map((a) => (a === hero ? withoutKit(a, k.source) : a))))
      .map((k) => k.ownerId),
  );
  return { ...base, kitHeroes: [...new Set(kitHeroes)] };
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
  const met = (heroes: HeroAnswers[]) =>
    opportunity.answers.length === 0 ||
    opportunity.answers.some((answer) =>
      'approach' in answer
        ? heroes.some((a) => opportunityApproachScore(a, answer.approach) >= answer.score)
        : heroes.some((a) => a.keywords.some((k) => k.keyword === answer.keyword)),
    );
  if (!met(party)) return { answered: false, kitHeroId: null };
  for (const hero of party) {
    const kit = kitsOf(hero).find((k) => !met(party.map((a) => (a === hero ? withoutKit(a, k.source) : a))));
    if (kit) return { answered: true, kitHeroId: kit.ownerId };
  }
  return { answered: true, kitHeroId: null };
}
