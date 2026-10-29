import { heroClasses } from '@/content/heroes';
import { itemById, opportunityById, restrictionById } from '@/content/lookup';
import { traitById } from '@/content/traits';

import { answersMemberOf, prepareParty, type PartyMember } from '../expeditions/simulate';
import type { SaveData } from '../save';
import type {
  ActiveThreat,
  Briefing,
  ConsumableDef,
  OpportunityAnswer,
  OpportunityDef,
  RestrictionDef,
  RestrictionId,
} from '../types';
import { heroAnswers, type HeroAnswers, type KeywordSource } from './answers';
import { opportunityApproachScore, scoreBriefing, scoreOpportunity, type ThreatState } from './score';
import { signatureBriefing } from './signatures';

/** How a threat stands for the UI: covered (met), partial (half) or uncovered (full). */
export type ThreatDisplay = 'covered' | 'partial' | 'uncovered';

export type ThreatCoverage = {
  threat: ActiveThreat;
  state: ThreatState;
  display: ThreatDisplay;
  have: number;
  needed: number;
  forced: boolean;
  intimidated: boolean;
  /** Who answers it, and what of theirs does: a class, trait, gear or kit. */
  coveredBy: { heroId: string; heroName: string; source: KeywordSource; sourceName: string }[];
  kitHeroes: string[];
  /** The hero (a Scout) who lowered it from Extreme to Strong. */
  loweredBy: string | null;
};

export type OpportunityCoverage = {
  answered: boolean;
  /** The supply it costs when taken, or null when it is free. */
  cost: { supply: number } | null;
  /** Each hero who answers it, with the approach, keyword or kit that does; null when free. */
  answers: { heroName: string; via: string }[] | null;
};

export type BriefingCoverage = {
  threats: ThreatCoverage[];
  opportunity: OpportunityCoverage | null;
  /** The briefing's restriction; `cancelledBy` names the hero whose signature lifts it. */
  restriction: { id: RestrictionId; def: RestrictionDef; cancelledBy: string | null } | null;
};

/** What an answer came from, by name: the class, trait, gear or kit item behind it. */
function sourceName(member: PartyMember, answers: HeroAnswers, source: KeywordSource): string {
  switch (source) {
    case 'class':
      return heroClasses[member.classId].name;
    case 'trait':
      return traitById[member.traitId]?.name ?? member.traitId;
    case 'gear':
      return member.weaponName ?? 'Unarmed';
    case 'kit':
      return member.consumable?.name ?? answers.kitItemId ?? 'Kit';
    case 'carried':
      return member.carriedKit?.name ?? answers.carriedKit?.itemId ?? 'Kit';
  }
}

/** Whether one hero meets one opportunity answer, the kit's +2 included (mirrors scoreOpportunity). */
function meets(answers: HeroAnswers, answer: OpportunityAnswer) {
  if ('approach' in answer) return opportunityApproachScore(answers, answer.approach) >= answer.score;
  return answers.keywords.some((k) => k.keyword === answer.keyword);
}

/** The heroes who answer an opportunity, with the approach, keyword or kit that carries it. */
function opportunityAnswers(
  def: OpportunityDef,
  party: PartyMember[],
  answers: HeroAnswers[],
  kitHeroId: string | null,
) {
  return def.answers.flatMap((answer) =>
    answers
      .filter((a) => meets(a, answer))
      .map((a) => {
        const member = party.find((m) => m.heroId === a.heroId)!;
        return {
          heroName: member.name,
          via:
            kitHeroId === a.heroId
              ? (member.consumable?.name ?? '')
              : 'approach' in answer
                ? answer.approach
                : answer.keyword,
        };
      }),
  );
}

/**
 * A briefing as the UI shows it: every threat's state and who of these heroes,
 * as equipped, answers it; the opportunity and its cost; the restriction. All
 * scoring comes from scoreBriefing and scoreOpportunity.
 */
export function briefingCoverage(
  save: SaveData,
  heroIds: string[],
  briefing: Briefing,
  now = 0,
  optIn = false,
): BriefingCoverage {
  const party = prepareParty(save, heroIds, now);
  const signed = signatureBriefing(briefing, party.map(answersMemberOf));
  const answers = party.map((member) => heroAnswers(answersMemberOf(member), signed.briefing.restriction));
  const scored = scoreBriefing(signed.briefing, answers);
  const nameOf = (heroId: string | null) => party.find((m) => m.heroId === heroId)?.name ?? null;

  const threats = scored.threats.map<ThreatCoverage>((score) => ({
    threat: score.threat,
    state: score.state,
    display: score.state === 'met' ? 'covered' : score.state === 'half' ? 'partial' : 'uncovered',
    have: score.have,
    needed: score.needed,
    forced: score.forced ?? false,
    intimidated: score.intimidated ?? false,
    coveredBy: score.coveredBy.map((cover) => {
      const member = party.find((m) => m.heroId === cover.heroId)!;
      const heroAnswersOf = answers.find((a) => a.heroId === cover.heroId)!;
      return {
        heroId: cover.heroId,
        heroName: member.name,
        source: cover.source,
        sourceName: sourceName(member, heroAnswersOf, cover.source),
      };
    }),
    kitHeroes: score.kitHeroes,
    loweredBy: signed.lowered?.threatId === score.threat.id ? nameOf(signed.lowered.heroId) : null,
  }));

  const def = briefing.opportunity ? opportunityById[briefing.opportunity] : null;
  let opportunity: OpportunityCoverage | null = null;
  if (def) {
    const result = scoreOpportunity(def, answers, optIn);
    opportunity = {
      answered: result.answered,
      cost: def.cost ?? null,
      answers: def.answers.length === 0 ? null : opportunityAnswers(def, party, answers, result.kitHeroId),
    };
  }

  return {
    threats,
    opportunity,
    restriction: briefing.restriction
      ? { id: briefing.restriction, def: restrictionById[briefing.restriction], cancelledBy: nameOf(signed.cancelledBy) }
      : null,
  };
}

/**
 * Whether a consumable answers anything in this briefing: a kit covers one of
 * the threats, or lifts the opportunity's approach or carries its keyword; a
 * ward salve faces the Element threat of its element. Non-consumables never do.
 */
export function kitAnswers(itemId: string, briefing: Briefing): boolean {
  const item = itemById[itemId];
  if (!item || item.slot !== 'consumable') return false;
  const consumable = item as ConsumableDef;
  if (consumable.protectsAgainst) {
    return briefing.threats.some((threat) => threat.id === 'element' && threat.element === consumable.protectsAgainst);
  }
  const kit = consumable.kit;
  if (!kit) return false;
  if (briefing.threats.some((threat) => kit.threats.includes(threat.id))) return true;
  const opportunity = briefing.opportunity ? opportunityById[briefing.opportunity] : null;
  if (!opportunity) return false;
  return opportunity.answers.some(
    (answer) =>
      ('approach' in answer && answer.approach === kit.approach) ||
      ('keyword' in answer && (kit.keywords ?? []).includes(answer.keyword)),
  );
}
