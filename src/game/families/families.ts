import { gearProfiles } from '@/content/equipment';
import { families, familyRules } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { itemById, relicById } from '@/content/lookup';

import type { FamilyId } from '@/content/families';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, HeroState } from '../types';

// Pure family rules (doc/design/families/): counting a party's team tags and
// the levels they reach. Nothing in fights or threats reads them yet.

export type FamilyCounts = Partial<Record<FamilyId, number>>;

const add = (counts: FamilyCounts, family: FamilyId, tags: number): void => {
  if (tags > 0) counts[family] = (counts[family] ?? 0) + tags;
};

const gearDefOf = (save: SaveData, gear: GearInstance): GearDef => itemById[gear.itemId] as GearDef;

/** The family tags one hero contributes: their class's tag, their gear's and their relic extras. */
export function heroFamilyTags(save: SaveData, hero: HeroState): FamilyCounts {
  const counts: FamilyCounts = {};
  add(counts, heroClasses[hero.classId].familyTag, 1);
  for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
    const uid = hero.equipment[slot];
    const gear = uid ? save.gear.find((g) => g.uid === uid) : undefined;
    if (!gear) continue;
    const item = gearDefOf(save, gear);
    if (item.gearType && !item.workTool) {
      const profile = gearProfiles[item.gearType];
      add(counts, profile.familyTag, profile.twoHanded ? 2 : 1);
    }
    const extraFamily = gear.relicId ? relicById[gear.relicId].extraFamily : undefined;
    if (extraFamily) add(counts, extraFamily, 1);
  }
  return counts;
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

/** The party's families that reached level 1, strongest first, then in `families` order. */
export function activeFamilies(counts: FamilyCounts): { family: FamilyId; count: number; level: number }[] {
  const order = new Map(families.map((family, i) => [family.id, i]));
  return (Object.entries(counts) as [FamilyId, number][])
    .map(([family, count]) => ({ family, count, level: familyLevel(count) }))
    .filter((entry) => entry.level >= 1)
    .sort((a, b) => b.count - a.count || order.get(a.family)! - order.get(b.family)!);
}
