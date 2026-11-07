import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';

import type { FamilyId } from '@/content/families';
import type { HeroClassId, RestrictionId, ThreatLevel } from '../types';
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

/** One hero's answers, with the restriction's rules already applied. */
export type HeroAnswers = {
  heroId: string;
  /** The hero's family tags the restriction leaves standing. */
  tags: HeroFamilyTag[];
  /** The hero's familyVsThreat effects (class and trait), already cut by the restriction. */
  bonuses: FamilyBonus[];
};

/**
 * What a hero brings to bear on threats: their family tags and their
 * familyVsThreat bonuses. Restrictions cut tags at the source: Thick fog
 * drops Watch tags that come from classes, and Anti-magic zone drops every tag
 * coming from a magic source (magic gear or a caster class).
 */
export function heroAnswers(member: AnswersMember, restriction: RestrictionId | null = null): HeroAnswers {
  const heroClass = heroClasses[member.classId];
  const traitEffects = traitById[member.traitId]?.effects ?? [];
  const caster = heroClass.damageStat === 'magic';

  const kept = (tag: HeroFamilyTag) => {
    if (restriction === 'antiMagic' && tag.magic) return false;
    if (restriction === 'thickFog' && tag.fromClass && tag.family === 'watch') return false;
    return true;
  };
  const tags = member.familyTags.filter(kept);

  const bonusOf = (effect: { kind: string; family?: FamilyId; add?: number; levels?: ThreatLevel[] }): FamilyBonus | null =>
    effect.kind === 'familyVsThreat'
      ? { family: effect.family!, add: effect.add ?? 0, ...(effect.levels ? { levels: effect.levels } : {}), source: 'class' }
      : null;
  // A caster's signature falls with their class tag in an anti-magic zone.
  const classBonuses = heroClass.abilities
    .map(bonusOf)
    .filter((b): b is FamilyBonus => b !== null)
    .filter((b) => !(restriction === 'antiMagic' && caster));
  const traitBonuses = traitEffects
    .map((effect): FamilyBonus | null =>
      effect.kind === 'familyVsThreat'
        ? { family: effect.family, add: effect.add, ...(effect.levels ? { levels: effect.levels } : {}), source: 'trait' }
        : null,
    )
    .filter((b): b is FamilyBonus => b !== null);

  return { heroId: member.heroId, tags, bonuses: [...classBonuses, ...traitBonuses] };
}
