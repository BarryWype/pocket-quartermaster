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

const gearDefOf = (save: SaveData, gear: GearInstance): GearDef => itemById[gear.itemId] as GearDef;

/** One family tag with where it came from: magic sources fall in an anti-magic zone, class Watch tags in thick fog. */
export type HeroFamilyTag = {
  family: FamilyId;
  count: number;
  magic: boolean;
  fromClass: boolean;
  source: 'class' | 'gear' | 'relic';
};

/** The hero's family tags one by one, with their source (see heroFamilyTags for the sums). */
export function heroFamilyTagSources(save: SaveData, hero: HeroState): HeroFamilyTag[] {
  const heroClass = heroClasses[hero.classId];
  const tags: HeroFamilyTag[] = [{ family: heroClass.familyTag, count: 1, magic: heroClass.damageStat === 'magic', fromClass: true, source: 'class' }];
  for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
    const uid = hero.equipment[slot];
    const gear = uid ? save.gear.find((g) => g.uid === uid) : undefined;
    if (!gear) continue;
    const item = gearDefOf(save, gear);
    if (item.gearType && !item.workTool) {
      const profile = gearProfiles[item.gearType];
      tags.push({ family: profile.familyTag, count: profile.twoHanded ? 2 : 1, magic: profile.damageStat === 'magic', fromClass: false, source: 'gear' });
    }
    const extraFamily = gear.relicId ? relicById[gear.relicId].extraFamily : undefined;
    if (extraFamily) tags.push({ family: extraFamily, count: 1, magic: false, fromClass: false, source: 'relic' });
  }
  return tags;
}

/** The family counts of a list of tags. */
export function familyCountsOf(tags: HeroFamilyTag[]): FamilyCounts {
  const counts: FamilyCounts = {};
  for (const tag of tags) add(counts, tag.family, tag.count);
  return counts;
}

/** The family tags one hero contributes: their class's tag, their gear's and their relic extras. */
export function heroFamilyTags(save: SaveData, hero: HeroState): FamilyCounts {
  return familyCountsOf(heroFamilyTagSources(save, hero));
}

/** The family tags a whole party contributes, summed over the heroes found in the roster. */
export function partyFamilies(save: SaveData, heroIds: string[]): FamilyCounts {
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
