import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { approachRules } from '@/content/threats';

import type { Element } from '../elements';
import type { Approach, HeroClassId, KitEffect, Keyword, RestrictionId } from '../types';

/** Where a keyword came from; each keyword counts once per hero whatever its sources. */
export type KeywordSource = 'class' | 'trait' | 'gear' | 'kit';

/** What heroAnswers needs: a hero as equipped (a party member, once wired in). */
export type AnswersMember = {
  heroId: string;
  classId: HeroClassId;
  traitId: string;
  /** The keywords of the hero's equipped weapon, armour and off-hand; magic pieces marked. */
  gearKeywords: { keyword: Keyword; magic: boolean }[];
  /** The kit or ward salve in the hero's consumable slot, if any. */
  kit: { itemId: string; effect: KitEffect } | null;
  /** The ward salve's element, when the kit item is one. */
  salveElement: Element | null;
  /** Elements the hero's class resists. */
  classResists: Element[];
  /** The +1s from the hero's recruit roll and approach picks. */
  approachBonus?: Partial<Record<Approach, number>>;
  /** The class's approach scores for this hero (a Gambler's roll of the day); left out, the class's. */
  classApproaches?: Record<Approach, number>;
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
 * keeps only Watchful from a kit, and Anti-magic zone drops every keyword
 * coming from a magic source (magic gear or a caster class).
 */
export function heroAnswers(member: AnswersMember, restriction: RestrictionId | null = null): HeroAnswers {
  const heroClass = heroClasses[member.classId];
  const traitEffects = traitById[member.traitId]?.effects ?? [];

  const approaches = Object.fromEntries(
    APPROACHES.map((approach) => {
      const base = (member.classApproaches ?? heroClass.approaches)[approach];
      const add = traitEffects.reduce((sum, e) => sum + (e.kind === 'approach' && e.approach === approach ? e.add : 0), 0);
      const score = Math.min(
        approachRules.max,
        Math.max(approachRules.min, base + add + (member.approachBonus?.[approach] ?? 0)),
      );
      return [approach, score];
    }),
  ) as Record<Approach, number>;

  // Every keyword with every source: each counts once per hero, but survives a
  // restriction as long as any of its sources does. Magic sources (magic gear,
  // caster classes) carry their keywords alone: they fall together in an
  // anti-magic zone, while traits, kits and physical gear keep working.
  const caster = heroClass.damageStat === 'magic';
  const raw: { keyword: Keyword; source: KeywordSource; magic: boolean }[] = [];
  const addKeyword = (keyword: Keyword, source: KeywordSource, magic = false) => {
    if (!raw.some((k) => k.keyword === keyword && k.source === source)) raw.push({ keyword, source, magic });
  };
  for (const keyword of heroClass.keywords) addKeyword(keyword, 'class', caster);
  for (const effect of traitEffects) if (effect.kind === 'keyword') addKeyword(effect.keyword, 'trait');
  for (const entry of member.gearKeywords) addKeyword(entry.keyword, 'gear', entry.magic);
  for (const keyword of member.kit?.effect.keywords ?? []) addKeyword(keyword, 'kit');

  const counted = (entry: { keyword: Keyword; source: KeywordSource; magic: boolean }) => {
    if (restriction === 'thickFog' && entry.keyword === 'watchful') return entry.source === 'kit';
    if (restriction === 'antiMagic' && entry.magic) return false;
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
