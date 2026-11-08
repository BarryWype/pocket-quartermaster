import { gearProfiles } from '@/content/equipment';
import { families, familyRules } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { itemById, relicById } from '@/content/lookup';

import type { FamilyId } from '@/content/families';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, HeroState } from '../types';

// Pure family rules (doc/design/families/): counting a party's team tags and
// the levels they reach.

export type FamilyCounts = Partial<Record<FamilyId, number>>;

const add = (counts: FamilyCounts, family: FamilyId, tags: number): void => {
  if (tags > 0) counts[family] = (counts[family] ?? 0) + tags;
};

const gearDefOf = (gear: GearInstance): GearDef => itemById[gear.itemId] as GearDef;

/** One family tag with where it came from. */
export type HeroFamilyTag = {
  family: FamilyId;
  count: number;
  source: 'class' | 'gear' | 'relic';
};

/** The hero's family tags one by one, with their source (see heroFamilyTags for the sums). */
export function heroFamilyTagSources(save: Pick<SaveData, 'gear'>, hero: HeroState): HeroFamilyTag[] {
  const heroClass = heroClasses[hero.classId];
  const tags: HeroFamilyTag[] = [{ family: heroClass.familyTag, count: 1, source: 'class' }];
  for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
    const uid = hero.equipment[slot];
    const gear = uid ? save.gear.find((g) => g.uid === uid) : undefined;
    if (!gear) continue;
    for (const tag of gearFamilyTags(gearDefOf(gear), gear.relicId)) {
      tags.push({ family: tag.family, count: tag.count, source: tag.extra ? 'relic' : 'gear' });
    }
  }
  return tags;
}

/** A piece's family tags: its type's (2 on a two-handed weapon, 1 + a second family's 1 on a one-handed one), then its relic's extra tag. Trinkets and work tools carry none. */
export function gearFamilyTags(item: Pick<GearDef, 'gearType' | 'workTool'>, relicId?: string): { family: FamilyId; count: number; extra: boolean }[] {
  const tags: { family: FamilyId; count: number; extra: boolean }[] = [];
  if (item.gearType && !item.workTool) {
    const profile = gearProfiles[item.gearType];
    tags.push({ family: profile.familyTag, count: profile.twoHanded ? 2 : 1, extra: false });
    if (profile.secondFamily) tags.push({ family: profile.secondFamily, count: 1, extra: false });
  }
  const extraFamily = relicId ? relicById[relicId].extraFamily : undefined;
  if (extraFamily) tags.push({ family: extraFamily, count: 1, extra: true });
  return tags;
}

/** The family counts of a list of tags. */
export function familyCountsOf(tags: HeroFamilyTag[]): FamilyCounts {
  const counts: FamilyCounts = {};
  for (const tag of tags) add(counts, tag.family, tag.count);
  return counts;
}

/** The family tags one hero contributes: their class's tag, their gear's and their relic extras. */
export function heroFamilyTags(save: Pick<SaveData, 'gear'>, hero: HeroState): FamilyCounts {
  return familyCountsOf(heroFamilyTagSources(save, hero));
}

/** The family tags a whole party contributes, summed over the heroes found in the roster. */
export function partyFamilies(save: Pick<SaveData, 'heroes' | 'gear'>, heroIds: string[]): FamilyCounts {
  const counts: FamilyCounts = {};
  const byId = new Map(save.heroes.map((hero) => [hero.id, hero]));
  for (const id of heroIds) {
    const hero = byId.get(id);
    if (!hero) continue;
    for (const [family, tags] of Object.entries(heroFamilyTags(save, hero)) as [FamilyId, number][]) {
      add(counts, family, tags);
    }
  }
  return counts;
}

/** How many of the level thresholds (2, 4, 6) the count reaches: 0 to 3. */
export function familyLevel(count: number): number {
  return familyRules.levels.filter((threshold) => count >= threshold).length;
}

/** A party's family levels (1 to 3), for the families that reached level 1. */
export type FamilyLevels = Partial<Record<FamilyId, number>>;

export function familyLevels(counts: FamilyCounts): FamilyLevels {
  const levels: FamilyLevels = {};
  for (const [family, count] of Object.entries(counts) as [FamilyId, number][]) {
    const level = familyLevel(count);
    if (level > 0) levels[family] = level;
  }
  return levels;
}

/** The party's families that reached level 1, strongest first, then in `families` order. */
export function activeFamilies(counts: FamilyCounts): { family: FamilyId; count: number; level: number }[] {
  const order = new Map(families.map((family, i) => [family.id, i]));
  return (Object.entries(counts) as [FamilyId, number][])
    .map(([family, count]) => ({ family, count, level: familyLevel(count) }))
    .filter((entry) => entry.level >= 1)
    .sort((a, b) => b.count - a.count || order.get(a.family)! - order.get(b.family)!);
}

/** Per family, the most tags any party of `size` heroes from the roster carries, as they are equipped now. */
export function bestPartyCounts(save: Pick<SaveData, 'heroes' | 'gear'>, size: number): FamilyCounts {
  const perHero = save.heroes.map((hero) => heroFamilyTags(save, hero));
  const best: FamilyCounts = {};
  for (const { id } of families) {
    const top = perHero.map((counts) => counts[id] ?? 0).sort((a, b) => b - a).slice(0, size);
    add(best, id, top.reduce((sum, tags) => sum + tags, 0));
  }
  return best;
}
