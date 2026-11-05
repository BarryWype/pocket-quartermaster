import { items } from '@/content/items';
import type { GearDef } from '@/game/types';

import { referenceSave } from './reference';
import { expectedLevels } from './config';

// The reference teams the difficulty odds are measured against (see difficultyOdds.ts).

describe('referenceSave', () => {
  it('starts a tier at the previous tier band top, in Common gear of the tier below', () => {
    const save = referenceSave(3, 'start', 3);
    expect(save.heroes.map((h) => h.level)).toEqual([expectedLevels[1], expectedLevels[1], expectedLevels[1]]);
    const gear = save.gear.map((g) => ({ item: items.find((i) => i.id === g.itemId) as GearDef, rarity: g.rarity }));
    expect(gear.every((g) => g.item.tier === 2)).toBe(true);
    expect(gear.every((g) => g.rarity === 'common')).toBe(true);
    expect(save.heroes.every((h) => h.equipment.armor)).toBe(true);
  });

  it('ends a tier at the band top, in Uncommon gear of the tier', () => {
    const save = referenceSave(2, 'end', 3);
    expect(save.heroes.every((h) => h.level === expectedLevels[1])).toBe(true);
    const gear = save.gear.map((g) => ({ item: items.find((i) => i.id === g.itemId) as GearDef, rarity: g.rarity }));
    expect(gear.every((g) => g.item.tier === 2)).toBe(true);
    expect(gear.every((g) => g.rarity === 'uncommon')).toBe(true);
    expect(save.heroes.every((h) => h.equipment.weapon && h.equipment.armor)).toBe(true);
  });

  it('carries only a weapon at the start of tier 1', () => {
    const save = referenceSave(1, 'start', 3);
    expect(save.heroes.every((h) => h.level === 1)).toBe(true);
    expect(save.heroes.every((h) => h.equipment.weapon && !h.equipment.armor)).toBe(true);
  });

  it('equips a healing potion on every hero, three stocked and carried', () => {
    const save = referenceSave(4, 'end', 3);
    expect(save.consumables.healingPotion).toBe(0);
    expect(save.heroes.every((h) => h.equipment.consumable === 'healingPotion')).toBe(true);
  });

  it('unlocks the tier: every lower tier cleared, party size honoured', () => {
    const save = referenceSave(5, 'start', 2);
    expect(save.heroes).toHaveLength(2);
    expect(save.clearedDungeons.filter((id) => id === 'giantsHall').length).toBe(1);
  });
});
