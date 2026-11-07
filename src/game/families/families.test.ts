import { gearProfiles } from '@/content/equipment';
import { heroClasses, newHero } from '@/content/heroes';
import { items } from '@/content/items';
import { itemById } from '@/content/lookup';
import { relics } from '@/content/loot/relics';

import type { GearDef, GearInstance, HeroClassId, HeroState } from '@/game/types';

import { createInitialSave } from '../save';

import { activeFamilies, bestPartyCounts, familyLevel, gearFamilyTags, heroFamilyTags, partyFamilies } from './families';

const piece = (uid: string, itemId: string, extra: Partial<GearInstance> = {}): GearInstance => ({
  uid,
  itemId,
  rarity: 'common',
  roll: 8,
  affixes: [],
  rerolls: 0,
  ...extra,
});

/** A save with one hero wearing the given pieces, each in its own slot. */
function saveWith(hero: HeroState, gear: GearInstance[]) {
  for (const g of gear) {
    const slot = itemById[g.itemId].slot;
    if (slot === 'weapon' || slot === 'armor' || slot === 'offhand' || slot === 'trinket') {
      hero.equipment[slot] = g.uid;
    }
  }
  return { ...createInitialSave(), heroes: [hero], gear };
}

const itemIdOfGearType = (gearType: string) =>
  items.find((item): item is GearDef => 'gearType' in item && item.gearType === gearType)!.id;

describe('heroFamilyTags', () => {
  test('each class contributes its own tag and nothing else without gear', () => {
    for (const classId of Object.keys(heroClasses) as HeroClassId[]) {
      const save = saveWith(newHero('h', 'H', classId, 'resilient'), []);
      expect(heroFamilyTags(save, save.heroes[0])).toEqual({ [heroClasses[classId].familyTag]: 1 });
    }
  });

  test('each gear type contributes its profile tag, two-handed counting 2', () => {
    for (const [type, profile] of Object.entries(gearProfiles)) {
      const save = saveWith(newHero('h', 'H', 'warrior', 'resilient'), [piece('g1', itemIdOfGearType(type))]);
      // The warrior's own class tag lands in the same counts.
      const expected: Record<string, number> = { [heroClasses.warrior.familyTag]: 1 };
      expected[profile.familyTag] = (expected[profile.familyTag] ?? 0) + (profile.twoHanded ? 2 : 1);
      expect(heroFamilyTags(save, save.heroes[0])).toEqual(expected);
    }
  });

  test('a trinket and a work tool contribute nothing', () => {
    const trinket = items.find((item) => item.slot === 'trinket')!;
    const workTool = items.find((item): item is GearDef => 'workTool' in item && item.workTool !== undefined)!;
    const save = saveWith(newHero('h', 'H', 'warrior', 'resilient'), [
      piece('g1', trinket.id),
      piece('g2', workTool.id),
    ]);
    expect(heroFamilyTags(save, save.heroes[0])).toEqual({ bulwark: 1 });
  });

  test("a relic's extra family contributes 1 on top of its piece", () => {
    // The Poacher's longbow: a bow (Volley) with a Wild tag.
    const save = saveWith(newHero('h', 'H', 'warrior', 'resilient'), [
      piece('g1', itemIdOfGearType('bow'), { relicId: 'poachersLongbow' }),
    ]);
    expect(heroFamilyTags(save, save.heroes[0])).toEqual({ bulwark: 1, volley: 1, wild: 1 });
  });

  test('about a third of the relics carry a second tag, never their own type tag', () => {
    const tagged = relics.filter((relic) => relic.extraFamily);
    expect(tagged.length).toBeGreaterThanOrEqual(Math.floor(relics.length / 3));
    expect(tagged.length).toBeLessThanOrEqual(Math.ceil(relics.length / 3) + 1);
    for (const relic of tagged) expect(relic.extraFamily).not.toBe(gearProfiles[relic.gearType].familyTag);
  });
});

describe('familyLevel', () => {
  test.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 2],
    [5, 2],
    [6, 3],
    [7, 3],
  ])('%i tags reaches level %i', (count, level) => {
    expect(familyLevel(count)).toBe(level);
  });
});

describe('partyFamilies', () => {
  test('sums the heroes found in the roster and skips missing ids', () => {
    const warrior = newHero('w', 'W', 'warrior', 'resilient');
    const save = saveWith(warrior, [
      piece('g1', itemIdOfGearType('sword')),
      piece('g2', itemIdOfGearType('plate')),
      piece('g3', itemIdOfGearType('shield')),
    ]);
    expect(partyFamilies(save, ['w', 'nobody'])).toEqual({ bulwark: 3, rally: 1 });
    expect(activeFamilies(partyFamilies(save, ['w']))).toEqual([{ family: 'bulwark', count: 3, level: 1 }]);
  });
});

describe('gearFamilyTags', () => {
  test('a piece carries its type’s tag, 2 on a two-handed weapon, then its relic’s extra tag', () => {
    expect(gearFamilyTags({ gearType: 'sword' })).toEqual([{ family: 'rally', count: 1, magic: false, extra: false }]);
    expect(gearFamilyTags({ gearType: 'warhammer' })).toEqual([{ family: 'breaker', count: 2, magic: false, extra: false }]);
    const relic = relics.find((r) => r.extraFamily)!;
    expect(gearFamilyTags({ gearType: relic.gearType }, relic.id)).toEqual([
      { family: gearProfiles[relic.gearType].familyTag, count: gearProfiles[relic.gearType].twoHanded ? 2 : 1, magic: gearProfiles[relic.gearType].damageStat === 'magic', extra: false },
      { family: relic.extraFamily, count: 1, magic: false, extra: true },
    ]);
  });

  test('trinkets and work tools carry none', () => {
    const trinket = items.find((item) => item.slot === 'trinket') as GearDef;
    expect(gearFamilyTags(trinket)).toEqual([]);
    expect(gearFamilyTags({ gearType: 'shield', workTool: { kind: 'tongs', job: 'smith' } })).toEqual([]);
  });
});

describe('bestPartyCounts', () => {
  test('per family, the tags of the best heroes for it, at most a party of them', () => {
    const save = {
      ...createInitialSave(),
      gear: [],
      heroes: [
        newHero('a', 'A', 'cleric', 'resilient'),
        newHero('b', 'B', 'exorcist', 'resilient'),
        newHero('c', 'C', 'warrior', 'resilient'),
        newHero('d', 'D', 'paladin', 'resilient'),
        newHero('e', 'E', 'porter', 'resilient'),
        newHero('f', 'F', 'cleric', 'resilient'),
      ],
    };
    expect(bestPartyCounts(save, 3)).toEqual({ faith: 3, bulwark: 3 });
    expect(bestPartyCounts(save, 2)).toEqual({ faith: 2, bulwark: 2 });
    expect(bestPartyCounts({ ...save, heroes: [] }, 3)).toEqual({});
  });
});
