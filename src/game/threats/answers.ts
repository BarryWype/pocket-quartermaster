import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { threatById } from '@/content/lookup';
import { approachRules } from '@/content/threats';

import type { Element } from '../elements';
import type { Ability, Approach, GearCondition, HeroClassId, KitEffect, Keyword, RestrictionId } from '../types';
import type { WornRelicEffect } from '../team/team';

/** Where a keyword came from; each keyword counts once per hero whatever its sources. 'carried': a kit a Porter carries for them. */
export type KeywordSource = 'class' | 'trait' | 'gear' | 'kit' | 'carried';

/** What heroAnswers needs: a hero as equipped (a party member, once wired in). */
export type AnswersMember = {
  heroId: string;
  classId: HeroClassId;
  traitId: string;
  /** The keywords of the hero's equipped weapon, armour and off-hand; magic pieces marked, strong ones doubled. */
  gearKeywords: { keyword: Keyword; magic: boolean; when?: GearCondition; strong?: true }[];
  /** The non-keyword effects of the relics the hero's pieces carry. */
  relicEffects?: WornRelicEffect[];
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
  /** The class's keywords for this hero (a Monk's fists add Pierce); left out, the class's. */
  classKeywords?: Keyword[];
  /** A kit a Porter carries for this hero: it counts as theirs, on top of their own slot. */
  carriedKit?: { itemId: string; effect: KitEffect; porterId: string; salveElement: Element | null } | null;
};

/** One hero's answers, with the restriction's rules already applied. */
export type HeroAnswers = {
  heroId: string;
  /** The kit's +2 is not here: it only applies to the threats the kit covers (see score.ts). */
  approaches: Record<Approach, number>;
  keywords: { keyword: Keyword; source: KeywordSource }[];
  resists: Element[];
  kitItemId: string | null;
  /** The kit a Porter carries for this hero, and that Porter. */
  carriedKit: { itemId: string; porterId: string } | null;
  /** The class signatures that change scoring (see score.ts), already cut by the restriction. */
  signatures: Extract<Ability, { kind: 'keywordCount' | 'approachFor' | 'kitBonus' }>[];
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
  for (const keyword of member.classKeywords ?? heroClass.keywords) addKeyword(keyword, 'class', caster);
  for (const effect of traitEffects) if (effect.kind === 'keyword') addKeyword(effect.keyword, 'trait');
  // Situational keywords never answer a threat; the simulation plays them out.
  for (const entry of member.gearKeywords) {
    if (!entry.when) addKeyword(entry.keyword, 'gear', entry.magic);
  }
  for (const keyword of member.kit?.effect.keywords ?? []) addKeyword(keyword, 'kit');
  for (const keyword of member.carriedKit?.effect.keywords ?? []) addKeyword(keyword, 'carried');

  const counted = (entry: { keyword: Keyword; source: KeywordSource; magic: boolean }) => {
    if (restriction === 'thickFog' && entry.keyword === 'watchful') return entry.source === 'kit' || entry.source === 'carried';
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
    resists: [
      ...new Set([
        ...member.classResists,
        ...(member.salveElement ? [member.salveElement] : []),
        ...(member.carriedKit?.salveElement ? [member.carriedKit.salveElement] : []),
      ]),
    ],
    kitItemId: member.kit?.itemId ?? null,
    carriedKit: member.carriedKit ? { itemId: member.carriedKit.itemId, porterId: member.carriedKit.porterId } : null,
    // A caster's signature falls with their class keywords in an anti-magic zone.
    signatures: [
      ...heroClass.abilities.filter(
        (a): a is HeroAnswers['signatures'][number] =>
          (a.kind === 'keywordCount' || a.kind === 'approachFor' || a.kind === 'kitBonus') &&
          !(restriction === 'antiMagic' && caster && a.kind === 'keywordCount'),
      ),
      // A restored relic meets an approach threat for its carrier at the top score; a magic piece's falls in an anti-magic zone.
      ...(member.relicEffects ?? []).flatMap(({ effect, magic }): HeroAnswers['signatures'] => {
        if (effect.kind !== 'answers' || (restriction === 'antiMagic' && magic)) return [];
        const answer = threatById[effect.threat].answer;
        return answer.kind === 'approach'
          ? [{ kind: 'approachFor', threat: effect.threat, approach: answer.approach, score: approachRules.max }]
          : [];
      }),
    ],
  };
}
