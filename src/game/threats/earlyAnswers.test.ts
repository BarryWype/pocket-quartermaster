import { dungeons } from '@/content/dungeons';
import { classAffinities, gearProfiles } from '@/content/equipment';
import { families, familyOfThreat } from '@/content/families';
import { heroClasses, startingHeroes } from '@/content/heroes';
import { recipeById, threatById } from '@/content/lookup';
import { dungeonThreats, surges, threatRules } from '@/content/threats';

import { forgedItem } from '../crafting/crafting';
import { startingRecipes } from '../crafting/recipeUnlocks';
import { gearFamilyTags, type HeroFamilyTag } from '../families/families';
import { gearPool } from '../places/shops';
import { createInitialSave } from '../save';
import type { ActiveThreat, GearType, HeroClassId, HeroState, ThreatId, ThreatLevel } from '../types';
import { heroAnswers } from './answers';
import { maxThreatLevel } from './compose';
import { scoreBriefing } from './score';

// Answering threats early (doc/design/families/): gear, not finding the right
// hero, answers the first tiers' threats.

const classIds = Object.keys(heroClasses) as HeroClassId[];
const usable = (classId: HeroClassId, type: GearType) =>
  gearProfiles[type].slot === 'offhand' || (classAffinities[classId] as Partial<Record<GearType, string>>)[type] !== 'unfit';
const typeOf = (recipeId: string) => forgedItem(recipeById[recipeId])!.gearType!;

describe('every threat family has an early answer', () => {
  test.each(families.filter((f) => f.kind === 'threat').map((f) => f.id))('%s: a starting blueprint most classes can use carries it', (family) => {
    const answers = startingRecipes
      .filter((id) => forgedItem(recipeById[id])!.tier === 1)
      .map(typeOf)
      .filter((type) => gearFamilyTags({ gearType: type }).some((tag) => tag.family === family))
      .filter((type) => classIds.filter((classId) => usable(classId, type)).length >= 18);
    expect(answers.length).toBeGreaterThan(0);
  });
});

/** Every way one starting hero can dress from these gear types (no unfit weapon or armour), as family tags. */
function outfits(hero: HeroState, types: GearType[]): HeroFamilyTag[][] {
  const of = (slot: 'weapon' | 'armor' | 'offhand') => types.filter((t) => gearProfiles[t].slot === slot && usable(hero.classId, t));
  const tags = (picked: (GearType | null)[]): HeroFamilyTag[] => [
    { family: heroClasses[hero.classId].familyTag, count: 1, source: 'class' },
    ...picked.flatMap((type) => (type ? gearFamilyTags({ gearType: type }).map((t) => ({ family: t.family, count: t.count, source: 'gear' as const })) : [])),
  ];
  const result: HeroFamilyTag[][] = [];
  for (const weapon of [null, ...of('weapon')]) {
    for (const armour of [null, ...of('armor')]) {
      const offhands = weapon && gearProfiles[weapon].twoHanded ? [null] : [null, ...of('offhand')];
      for (const offhand of offhands) result.push(tags([weapon, armour, offhand]));
    }
  }
  return result;
}

/** The worst briefings a dungeon of tier 1 or 2 can roll: its threats at their highest levels, at most one surged. */
function worstBriefings(dungeonId: string, tier: number): ActiveThreat[][] {
  const eligible = (Object.keys(dungeonThreats[dungeonId]?.weights ?? {}) as ThreatId[]).filter((id) => threatById[id].firstTier <= tier);
  const top = (id: ThreatId, surged: boolean): ActiveThreat => ({
    id,
    level: Math.min(3, maxThreatLevel(tier, threatById[id].firstTier) + (surged && surges[id] ? 1 : 0)) as ThreatLevel,
  });
  const count = threatRules.compose.threatCount[tier - 1];
  const sets = count === 1 ? eligible.map((id) => [id]) : eligible.flatMap((a, i) => eligible.slice(i + 1).map((b) => [a, b]));
  return sets.flatMap((ids) => [ids.map((id) => top(id, false)), ...ids.filter((id) => surges[id]).map((surged) => ids.map((id) => top(id, id === surged)))]);
}

describe('the starting heroes answer every tier 1 and 2 briefing with early gear', () => {
  const save = createInitialSave();
  const types = [...new Set([...startingRecipes.map(typeOf), ...gearPool(save).filter((r) => forgedItem(r)!.tier === 1).map((r) => typeOf(r.id))])];
  const dressed = startingHeroes.map((hero) => ({ hero, outfits: outfits(hero, types) }));

  const answerable = (threats: ActiveThreat[]) => {
    const needed = new Set(threats.map((t) => familyOfThreat(t.id)));
    // Only the needed families matter: keep one outfit per distinct count of them.
    const distinct = dressed.map(({ hero, outfits: all }) => {
      const byKey = new Map<string, HeroFamilyTag[]>();
      for (const tags of all) {
        const key = [...needed].map((f) => tags.filter((t) => t.family === f).reduce((n, t) => n + t.count, 0)).join(',');
        byKey.set(key, tags);
      }
      return [...byKey.values()].map((tags) => heroAnswers({ heroId: hero.id, classId: hero.classId, traitId: hero.trait, familyTags: tags }));
    });
    const briefing = { threats, restriction: null, opportunity: null };
    return distinct[0].some((a) => distinct[1].some((b) => distinct[2].some((c) => scoreBriefing(briefing, [a, b, c]).threats.every((t) => t.state === 'met'))));
  };

  const cases = dungeons.filter((d) => d.tier <= 2).flatMap((d) => worstBriefings(d.id, d.tier).map((threats) => ({ dungeon: d.id, threats })));

  test('there are briefings to check', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  test('none is left without an answer', () => {
    const missing = cases
      .filter(({ threats }) => !answerable(threats))
      .map(({ dungeon, threats }) => `${dungeon}: ${threats.map((t) => `${familyOfThreat(t.id)} ${t.level}`).join(' + ')}`);
    expect(missing).toEqual([]);
  });
});
