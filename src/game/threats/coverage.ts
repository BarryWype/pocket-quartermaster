import { familyById, familyOfThreat, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { gearName, itemById, opportunityById, relicById, restrictionById } from '@/content/lookup';
import { traitById } from '@/content/traits';

import { answersMemberOf, prepareParty, type PartyMember } from '../expeditions/simulate';
import { familyCountsOf, gearFamilyTags, type FamilyCounts } from '../families/families';
import type { SaveData } from '../save';
import type {
  ActiveThreat,
  Briefing,
  GearDef,
  OpportunityDef,
  RestrictionDef,
  RestrictionId,
} from '../types';
import { heroAnswers, type HeroAnswers, type TagSource } from './answers';
import { scoreBriefing, scoreOpportunity, type ThreatState } from './score';
import { signatureBriefing } from './signatures';

/** How a threat stands for the UI: covered (met), partial (half) or uncovered (full). */
export type ThreatDisplay = 'covered' | 'partial' | 'uncovered';

export type ThreatCoverage = {
  threat: ActiveThreat;
  state: ThreatState;
  display: ThreatDisplay;
  have: number;
  needed: number;
  /** Who answers it, and what of theirs does: a class, trait, gear or relic. */
  coveredBy: { heroId: string; heroName: string; source: TagSource; sourceName: string }[];
  /** The hero (a Scout) who lowered it from Extreme to Strong. */
  loweredBy: string | null;
};

export type OpportunityCoverage = {
  answered: boolean;
  /** The supply it costs when taken, or null when it is free. */
  cost: { supply?: number; key?: number } | null;
  /** Each hero who answers it, with the family that does; null when free. */
  answers: { heroName: string; via: string }[] | null;
};

export type BriefingCoverage = {
  threats: ThreatCoverage[];
  opportunity: OpportunityCoverage | null;
  /** The briefing's restriction; `cancelledBy` names the hero whose signature lifts it. */
  restriction: { id: RestrictionId; def: RestrictionDef; cancelledBy: string | null } | null;
  /** The party's family tags the restriction leaves standing, as the run counts them. */
  families: FamilyCounts;
};

/** The hero's equipped piece whose type carries the family. */
function pieceWith(save: SaveData, heroId: string, family: FamilyId) {
  const hero = save.heroes.find((h) => h.id === heroId);
  return Object.values(hero?.equipment ?? {})
    .map((uid) => save.gear.find((g) => g.uid === uid))
    .find((g) => g && gearFamilyTags(itemById[g.itemId] as GearDef).some((t) => t.family === family));
}

/** What an answer came from, by name: the class, trait, gear piece or relic behind it. */
function sourceName(save: SaveData, member: PartyMember, source: TagSource, family: FamilyId): string {
  switch (source) {
    case 'class':
      return heroClasses[member.classId].name;
    case 'trait':
      return traitById[member.traitId]?.name ?? member.traitId;
    case 'gear': {
      const piece = pieceWith(save, member.heroId, family);
      return piece ? gearName(piece) : (member.weaponName ?? 'Unarmed');
    }
    case 'relic':
      return member.relicEffects?.[0] ? relicById[member.relicEffects[0].relicId].name : 'Relic';
  }
}

/** The heroes who answer an opportunity, with the family that carries it. */
function opportunityAnswers(def: OpportunityDef, party: PartyMember[], answers: HeroAnswers[]) {
  return def.answers.flatMap((answer) =>
    answers
      .filter((a) => a.tags.some((t) => t.family === answer.family))
      .map((a) => {
        const member = party.find((m) => m.heroId === a.heroId)!;
        return { heroName: member.name, via: familyById[answer.family].name };
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
  const answers = party.map((member) => heroAnswers(answersMemberOf(member)));
  const scored = scoreBriefing(signed.briefing, answers);
  const nameOf = (heroId: string | null) => party.find((m) => m.heroId === heroId)?.name ?? null;

  const threats = scored.threats.map<ThreatCoverage>((score) => ({
    threat: score.threat,
    state: score.state,
    display: score.state === 'met' ? 'covered' : score.state === 'half' ? 'partial' : 'uncovered',
    have: score.have,
    needed: score.needed,
    coveredBy: score.coveredBy.map((cover) => {
      const member = party.find((m) => m.heroId === cover.heroId)!;
      return {
        heroId: cover.heroId,
        heroName: member.name,
        source: cover.source,
        sourceName: sourceName(save, member, cover.source, familyOfThreat(score.threat.id)),
      };
    }),
    loweredBy: signed.lowered?.threatId === score.threat.id ? nameOf(signed.lowered.heroId) : null,
  }));

  const def = briefing.opportunity ? opportunityById[briefing.opportunity] : null;
  let opportunity: OpportunityCoverage | null = null;
  if (def) {
    const result = scoreOpportunity(def, answers, optIn);
    opportunity = {
      answered: result.answered,
      cost: def.cost ?? null,
      answers: def.answers.length === 0 ? null : opportunityAnswers(def, party, answers),
    };
  }

  return {
    threats,
    opportunity,
    restriction: briefing.restriction
      ? { id: briefing.restriction, def: restrictionById[briefing.restriction], cancelledBy: nameOf(signed.cancelledBy) }
      : null,
    families: familyCountsOf(answers.flatMap((a) => a.tags)),
  };
}
