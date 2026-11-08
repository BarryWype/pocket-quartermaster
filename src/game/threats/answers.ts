import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';

import type { FamilyId } from '@/content/families';
import type { HeroClassId, ThreatLevel } from '../types';
import type { HeroFamilyTag } from '../families/families';

/** Where a family tag came from; each tag counts once per hero. */
export type TagSource = 'class' | 'trait' | 'gear' | 'relic';

/** What heroAnswers needs: a hero as equipped (a party member, once wired in). */
export type AnswersMember = {
  heroId: string;
  classId: HeroClassId;
  traitId: string;
  /** The hero's family tags, with their source (see heroFamilyTagSources). */
  familyTags: HeroFamilyTag[];
};

/** A familyVsThreat bonus, already narrowed to the threat it lifts. */
export type FamilyBonus = { family: FamilyId; add: number; levels?: ThreatLevel[]; source: 'class' | 'trait' };

/** One hero's answers. */
export type HeroAnswers = {
  heroId: string;
  /** The hero's family tags. */
  tags: HeroFamilyTag[];
  /** The hero's familyVsThreat effects (class and trait). */
  bonuses: FamilyBonus[];
};

/**
 * What a hero brings to bear on threats: their family tags and their
 * familyVsThreat bonuses. No restriction cuts them: a tag always counts.
 */
export function heroAnswers(member: AnswersMember): HeroAnswers {
  const heroClass = heroClasses[member.classId];
  const traitEffects = traitById[member.traitId]?.effects ?? [];

  const bonusOf = (effect: { kind: string; family?: FamilyId; add?: number; levels?: ThreatLevel[] }): FamilyBonus | null =>
    effect.kind === 'familyVsThreat'
      ? { family: effect.family!, add: effect.add ?? 0, ...(effect.levels ? { levels: effect.levels } : {}), source: 'class' }
      : null;
  const classBonuses = heroClass.abilities.map(bonusOf).filter((b): b is FamilyBonus => b !== null);
  const traitBonuses = traitEffects
    .map((effect): FamilyBonus | null =>
      effect.kind === 'familyVsThreat'
        ? { family: effect.family, add: effect.add, ...(effect.levels ? { levels: effect.levels } : {}), source: 'trait' }
        : null,
    )
    .filter((b): b is FamilyBonus => b !== null);

  return { heroId: member.heroId, tags: member.familyTags, bonuses: [...classBonuses, ...traitBonuses] };
}
