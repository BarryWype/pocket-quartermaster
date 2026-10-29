import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { approachRules, magicClasses, weaponKeywords } from '@/content/threats';

import type { Element } from '../elements';
import type { Approach, HeroClassId, KitEffect, Keyword, RestrictionId, WeaponType } from '../types';

/** Where a keyword came from; each keyword counts once per hero whatever its sources. */
export type KeywordSource = 'class' | 'trait' | 'weapon' | 'kit';

/** What heroAnswers needs: a hero as equipped (a party member, once wired in). */
export type AnswersMember = {
  heroId: string;
  classId: HeroClassId;
  traitId: string;
  /** The hero's weapon type; unarmed heroes carry none. */
  weaponType: WeaponType | null;
  /** The kit or ward salve in the hero's consumable slot, if any. */
  kit: { itemId: string; effect: KitEffect } | null;
  /** The ward salve's element, when the kit item is one. */
  salveElement: Element | null;
  /** Elements the hero's class resists. */
  classResists: Element[];
  /** The +1s from the hero's recruit roll and approach picks. */
  approachBonus?: Partial<Record<Approach, number>>;
};

/** One hero's answers, with the restriction's rules already applied. */
export type HeroAnswers = {
  heroId: string;
  /** The kit's +2 is not here: it only applies to the threats the kit covers (see score.ts). */
  approaches: Record<Approach, number>;
  keywords: { keyword: Keyword; source: KeywordSource }[];
  resists: Element[];
  kitItemId: string | null;
};

export const APPROACHES: Approach[] = ['might', 'finesse', 'wits', 'faith', 'presence'];

/**
 * What a hero brings to bear on threats: approach scores (class value plus
 * trait modifiers, clamped), keywords (each counted once, whatever its
 * sources) and resists. Restrictions cut keywords at the source: Thick fog
 * keeps only Watchful from a kit, and Anti-magic zone drops Light and Cleave
 * coming from a mage class or a staff.
 */
export function heroAnswers(member: AnswersMember, restriction: RestrictionId | null = null): HeroAnswers {
  const heroClass = heroClasses[member.classId];
  const traitEffects = traitById[member.traitId]?.effects ?? [];

  const approaches = Object.fromEntries(
    APPROACHES.map((approach) => {
      const base = heroClass.approaches[approach] ?? approachRules.base;
      const add = traitEffects.reduce((sum, e) => sum + (e.kind === 'approach' && e.approach === approach ? e.add : 0), 0);
      const score = Math.min(
        approachRules.max,
        Math.max(approachRules.min, base + add + (member.approachBonus?.[approach] ?? 0)),
      );
      return [approach, score];
    }),
  ) as Record<Approach, number>;

  // Every keyword with every source: each counts once per hero, but survives a
  // restriction as long as any of its sources does.
  const raw: { keyword: Keyword; source: KeywordSource }[] = [];
  const addKeyword = (keyword: Keyword, source: KeywordSource) => {
    if (!raw.some((k) => k.keyword === keyword && k.source === source)) raw.push({ keyword, source });
  };
  for (const keyword of heroClass.keywords) addKeyword(keyword, 'class');
  for (const effect of traitEffects) if (effect.kind === 'keyword') addKeyword(effect.keyword, 'trait');
  if (member.weaponType) for (const keyword of weaponKeywords[member.weaponType] ?? []) addKeyword(keyword, 'weapon');
  for (const keyword of member.kit?.effect.keywords ?? []) addKeyword(keyword, 'kit');

  const counted = (entry: { keyword: Keyword; source: KeywordSource }) => {
    if (restriction === 'thickFog' && entry.keyword === 'watchful') return entry.source === 'kit';
    if (
      restriction === 'antiMagic' &&
      (entry.keyword === 'light' || entry.keyword === 'cleave') &&
      ((entry.source === 'class' && magicClasses.includes(member.classId)) ||
        (entry.source === 'weapon' && member.weaponType === 'staff'))
    ) {
      return false;
    }
    return true;
  };
  const keywords: { keyword: Keyword; source: KeywordSource }[] = [];
  for (const entry of raw.filter(counted)) {
    if (!keywords.some((k) => k.keyword === entry.keyword)) keywords.push(entry);
  }

  return {
    heroId: member.heroId,
    approaches,
    keywords,
    resists: [...new Set([...member.classResists, ...(member.salveElement ? [member.salveElement] : [])])],
    kitItemId: member.kit?.itemId ?? null,
  };
}
