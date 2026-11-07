import { dungeonById } from '@/content/lookup';
import { charms } from '@/content/loot/charms';
import { weaknessByBoss } from '@/content/weaknesses';

import { charmApplies } from '../../loot/charms';
import { createInitialSave, type SaveData } from '../../save';
import type { Briefing } from '../../types';
import { emptySlots, fillPotions, pickCharm, pickWeakness, uncovered, withCharm, withElixir, withOil, withStatPotion } from './loadout';

const PARTY = ['bram', 'lyra', 'mira'];
const TRAPS: Briefing = { threats: [{ id: 'traps', level: 3 }], restriction: null, opportunity: null };
const NONE: Briefing = { threats: [], restriction: null, opportunity: null };

const stocked = (consumables: Record<string, number>): SaveData => ({ ...createInitialSave(), consumables });
const slots = (save: SaveData) => PARTY.map((id) => save.heroes.find((h) => h.id === id)!.equipment.consumable);
const dungeonCharms = charms.filter((c) => charmApplies(c.modifier, 'dungeonRun'));

describe('loadout rules', () => {
  it('counts the threat points a party still misses on a briefing', () => {
    const save = stocked({ healingPotion: 3 });
    expect(uncovered(save, PARTY, TRAPS)).toBeGreaterThan(0);
    expect(uncovered(save, PARTY, NONE)).toBe(0);
  });

  it('gives the boss its weakness item and everyone else a potion', () => {
    const boss = Object.values(dungeonById).find((d) => d.isBoss && weaknessByBoss[d.boss.id])!;
    const item = weaknessByBoss[boss.boss.id].itemId;
    const save = fillPotions(pickWeakness(stocked({ [item]: 1, healingPotion: 5 }), PARTY, boss), PARTY);
    expect(slots(save).filter((s) => s === item)).toHaveLength(1);
    expect(slots(save).filter((s) => s === 'healingPotion')).toHaveLength(2);
  });

  it('picks the charm held most that applies to the run', () => {
    const [few, many] = dungeonCharms;
    expect(pickCharm(stocked({ [few.id]: 1, [many.id]: 3 }), 'dungeonRun')).toBe(many.id);
    expect(pickCharm(stocked({ healingPotion: 3 }), 'dungeonRun')).toBeNull();
  });

  it('puts a held charm on the first hero with a free slot or a healing potion', () => {
    const [charm] = dungeonCharms;
    const potions = fillPotions(stocked({ [charm.id]: 1, healingPotion: 2 }), PARTY);
    const withCharmSave = withCharm(potions, PARTY, charm.id);
    expect(slots(withCharmSave).filter((s) => s === charm.id)).toHaveLength(1);
    expect(withCharmSave.consumables[charm.id]).toBe(0);
  });

  it('puts carried consumables back in the stock', () => {
    const save = fillPotions(stocked({ healingPotion: 3 }), PARTY);
    expect(emptySlots(save, PARTY).consumables.healingPotion).toBe(3);
  });

  it('puts a stat potion over a healing potion or in a free slot', () => {
    const potion = fillPotions(stocked({ strengthDraught: 1, healingPotion: 3 }), PARTY);
    const free = slots(potion).findIndex((s) => s === 'healingPotion');
    const withStat = withStatPotion(potion, PARTY[free], 'strengthDraught');
    expect(slots(withStat)[free]).toBe('strengthDraught');
    expect(withStat.consumables).toEqual({ strengthDraught: 0, healingPotion: 1 });
    expect(withStatPotion(potion, PARTY[free], 'quicksilver')).toBe(potion);
  });

  it('carries the strongest healing potion held, falling back to weaker ones', () => {
    expect(slots(fillPotions(stocked({ standardHealingPotion: 1, healingPotion: 3 }), PARTY))).toEqual([
      'standardHealingPotion',
      'healingPotion',
      'healingPotion',
    ]);
    expect(slots(fillPotions(stocked({ healingPotion: 3 }), PARTY))).toEqual(['healingPotion', 'healingPotion', 'healingPotion']);
  });

  it('puts a held elixir on the first hero with a free slot or a healing potion', () => {
    const potions = fillPotions(stocked({ healingPotion: 3, firebomb: 1 }), PARTY);
    const carrier = slots(potions).findIndex((s) => s === 'healingPotion');
    const withElixirSave = withElixir(potions, PARTY, 'firebomb');
    expect(slots(withElixirSave)[carrier]).toBe('firebomb');
    expect(withElixirSave.consumables.firebomb).toBe(0);
    expect(withElixir(potions, PARTY, 'smokeBomb')).toBe(potions);
  });

  it('puts an oil in a healing potion slot only for a hero with a plain weapon', () => {
    const armed: SaveData = {
      ...stocked({ emberOil: 1, healingPotion: 3 }),
      gear: [{ uid: 'w1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
    };
    const equipped = { ...armed, heroes: armed.heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, weapon: 'w1' } } : h)) };
    const potion = fillPotions(equipped, PARTY);
    expect(slots(withOil(potion, 'bram', 'emberOil'))[0]).toBe('emberOil');
    expect(withOil(potion, 'lyra', 'emberOil')).toBe(potion);
    const infused: SaveData = { ...potion, gear: [{ uid: 'w1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [{ id: 'infusedWater', value: 0 }], rerolls: 0 }] };
    expect(withOil(infused, 'bram', 'emberOil')).toBe(infused);
  });
});
