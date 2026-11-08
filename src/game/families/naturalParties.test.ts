import { classAffinities, gearProfiles } from '@/content/equipment';
import { families } from '@/content/families';
import { heroClasses } from '@/content/heroes';

import type { FamilyId } from '@/content/families';
import type { ArmourType, HeroClassId, WeaponType } from '@/game/types';

import type { FamilyCounts } from './families';

import { activeFamilies, familyLevel, gearFamilyTags } from './families';

// Every party of 3 distinct classes in their natural loadout — favoured gear
// picked without regard to families — and the family levels that falls out.

const classIds = Object.keys(heroClasses) as HeroClassId[];

/** The class's first favoured weapon and armour types, in the affinity table's key order. */
function favouredTypes(classId: HeroClassId): { weapon: WeaponType; armour: ArmourType } {
  const affinities = classAffinities[classId];
  const weapon = (Object.keys(affinities) as (keyof typeof affinities)[]).find(
    (type) => gearProfiles[type].slot === 'weapon' && affinities[type] === 'favoured',
  )!;
  const armour = (Object.keys(affinities) as (keyof typeof affinities)[]).find(
    (type) => gearProfiles[type].slot === 'armor' && affinities[type] === 'favoured',
  )!;
  return { weapon: weapon as WeaponType, armour: armour as ArmourType };
}

/** Off-hand: none with a two-handed weapon, quiver for bows, tome for magic weapons, else a shield. */
function naturalOffhand(weapon: WeaponType): 'quiver' | 'tome' | 'shield' | null {
  const profile = gearProfiles[weapon];
  if (profile.twoHanded) return null;
  if (weapon === 'bow' || weapon === 'crossbow') return 'quiver';
  if (profile.damageStat === 'magic') return 'tome';
  return 'shield';
}

/** The class's natural loadout: favoured weapon and armour plus the off-hand rule above. */
function naturalLoadout(classId: HeroClassId): (WeaponType | ArmourType | 'quiver' | 'tome' | 'shield')[] {
  const { weapon, armour } = favouredTypes(classId);
  const offhand = naturalOffhand(weapon);
  return offhand ? [weapon, armour, offhand] : [weapon, armour];
}

/** The family tags of one hero in a loadout, mirroring heroFamilyTags without a save. */
function loadoutCounts(classId: HeroClassId, gearTypes: (WeaponType | ArmourType | 'quiver' | 'tome' | 'shield')[]): FamilyCounts {
  const counts: FamilyCounts = {};
  const add = (family: FamilyId, tags: number) => {
    counts[family] = (counts[family] ?? 0) + tags;
  };
  add(heroClasses[classId].familyTag, 1);
  for (const type of gearTypes) for (const tag of gearFamilyTags({ gearType: type })) add(tag.family, tag.count);
  return counts;
}

const sum = (countsList: FamilyCounts[]): FamilyCounts => {
  const total: FamilyCounts = {};
  for (const counts of countsList) {
    for (const [family, tags] of Object.entries(counts) as [FamilyId, number][]) {
      total[family] = (total[family] ?? 0) + tags;
    }
  }
  return total;
};

const loadouts = new Map(classIds.map((classId) => [classId, naturalLoadout(classId)]));
const heroCounts = new Map(classIds.map((classId) => [classId, loadoutCounts(classId, loadouts.get(classId)!)]));

type Party = { classes: HeroClassId[]; counts: FamilyCounts };
const parties: Party[] = [];
for (let i = 0; i < classIds.length; i++) {
  for (let j = i + 1; j < classIds.length; j++) {
    for (let k = j + 1; k < classIds.length; k++) {
      const classes = [classIds[i], classIds[j], classIds[k]];
      parties.push({ classes, counts: sum(classes.map((classId) => heroCounts.get(classId)!)) });
    }
  }
}

describe('natural parties report', () => {
  test('covers every party of 3 distinct classes', () => {
    const active = parties.map((party) => activeFamilies(party.counts));
    const atLeast2 = active.filter((families) => families.some((f) => f.level >= 2)).length;
    const at3 = active.filter((families) => families.some((f) => f.level >= 3)).length;

    const bestCases = new Map<string, number>();
    const level3Classes = new Map<string, number>();
    parties.forEach((party, i) => {
      const [best] = active[i];
      if (best && best.level >= 2) {
        const key = `${best.family} level ${best.level}`;
        bestCases.set(key, (bestCases.get(key) ?? 0) + 1);
        if (best.level >= 3) {
          for (const classId of party.classes) {
            const name = heroClasses[classId].name;
            level3Classes.set(name, (level3Classes.get(name) ?? 0) + 1);
          }
        }
      }
    });

    console.log(`parties total: ${parties.length}`);
    console.log(`parties with at least one family at level >= 2: ${atLeast2}`);
    console.log(`parties with at least one family at level 3: ${at3}`);
    [...bestCases.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([key, count], i) => console.log(`best family case ${i + 1}: ${key} in ${count} parties`));
    [...level3Classes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count], i) => console.log(`class in level 3 parties ${i + 1}: ${name} in ${count} parties`));
    for (const classId of classIds) {
      const counts = heroCounts.get(classId)!;
      const tags = families
        .filter((family) => counts[family.id])
        .map((family) => `${family.id} ${counts[family.id]} (level ${familyLevel(counts[family.id]!)})`)
        .join(', ');
      console.log(`class ${heroClasses[classId].name}: loadout ${loadouts.get(classId)!.join('/')} -> ${tags}`);
    }

    expect(parties).toHaveLength(2600);
  });
});
