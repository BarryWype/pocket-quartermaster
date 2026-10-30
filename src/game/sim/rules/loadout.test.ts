import { dungeonById } from '@/content/lookup';
import { charms } from '@/content/loot/charms';
import { weaknessByBoss } from '@/content/weaknesses';

import { charmApplies } from '../../loot/charms';
import { createInitialSave, type SaveData } from '../../save';
import type { Briefing } from '../../types';
import { emptySlots, fillPotions, isKit, pickCharm, pickKits, pickWeakness, uncovered, unprepared, withCharm, withStatPotion } from './loadout';

const PARTY = ['bram', 'lyra', 'mira'];
const TRAPS: Briefing = { threats: [{ id: 'traps', level: 3 }], restriction: null, opportunity: null };
const NONE: Briefing = { threats: [], restriction: null, opportunity: null };

const stocked = (consumables: Record<string, number>): SaveData => ({ ...createInitialSave(), consumables });
const slots = (save: SaveData) => PARTY.map((id) => save.heroes.find((h) => h.id === id)!.equipment.consumable);
const dungeonCharms = charms.filter((c) => charmApplies(c.modifier, 'dungeonRun'));

describe('loadout rules', () => {
  it('takes the kit that answers a threat the party misses', () => {
    const save = stocked({ roguesRoll: 1, huntersPack: 1, healingPotion: 3 });
    const kitted = pickKits(save, PARTY, TRAPS);
    expect(slots(kitted)).toContain('roguesRoll');
    expect(slots(kitted)).not.toContain('huntersPack');
    expect(uncovered(kitted, PARTY, TRAPS)).toBeLessThan(uncovered(save, PARTY, TRAPS));
  });

  it('takes no kit when the briefing has nothing to answer', () => {
    expect(slots(pickKits(stocked({ roguesRoll: 2 }), PARTY, NONE))).toEqual([null, null, null]);
  });

  it('gives the boss its weakness item and everyone else a potion', () => {
    const boss = Object.values(dungeonById).find((d) => d.isBoss && weaknessByBoss[d.boss.id])!;
    const item = weaknessByBoss[boss.boss.id].itemId;
    const save = fillPotions(pickWeakness(stocked({ [item]: 1, healingPotion: 5 }), PARTY, boss), PARTY);
    expect(slots(save).filter((s) => s === item)).toHaveLength(1);
    expect(slots(save).filter((s) => s === 'healingPotion')).toHaveLength(2);
  });

  it('picks the charm held most that applies to the run, and never puts it over a kit', () => {
    const [few, many] = dungeonCharms;
    const save = stocked({ [few.id]: 1, [many.id]: 3, roguesRoll: 3 });
    expect(pickCharm(save, 'dungeonRun')).toBe(many.id);
    const kitted = PARTY.reduce((next, id) => pickKits(next, [id], TRAPS), save);
    expect(slots(withCharm(kitted, PARTY, many.id))).not.toContain(many.id);
    expect(pickCharm(stocked({ healingPotion: 3 }), 'dungeonRun')).toBeNull();
  });

  it('leaves the same party without kits for the threats: only the kit slots differ, and they are empty', () => {
    const prepared = fillPotions(pickKits(stocked({ roguesRoll: 1, healingPotion: 3 }), PARTY, TRAPS), PARTY);
    const plain = unprepared(prepared, PARTY);
    prepared.heroes.forEach((hero, i) => {
      const other = plain.heroes[i];
      expect({ ...other, equipment: { ...other.equipment, consumable: null } }).toEqual({ ...hero, equipment: { ...hero.equipment, consumable: null } });
      expect(other.equipment.consumable).toBe(isKit(hero.equipment.consumable) ? null : hero.equipment.consumable);
    });
    expect(slots(plain)).not.toContain('roguesRoll');
    expect(plain.gear).toEqual(prepared.gear);
  });

  it('puts carried consumables back in the stock', () => {
    const save = fillPotions(stocked({ healingPotion: 3 }), PARTY);
    expect(emptySlots(save, PARTY).consumables.healingPotion).toBe(3);
  });

  it('puts a stat potion over a healing potion or in a free slot, never over a kit', () => {
    const kitted = pickKits(stocked({ roguesRoll: 1, strengthDraught: 1, healingPotion: 3 }), PARTY, TRAPS);
    const carrier = slots(kitted).findIndex((s) => s === 'roguesRoll');
    expect(slots(withStatPotion(kitted, PARTY[carrier], 'strengthDraught'))[carrier]).toBe('roguesRoll');
    const potion = fillPotions(kitted, PARTY);
    const free = slots(potion).findIndex((s) => s === 'healingPotion');
    const withStat = withStatPotion(potion, PARTY[free], 'strengthDraught');
    expect(slots(withStat)[free]).toBe('strengthDraught');
    expect(withStat.consumables).toEqual({ roguesRoll: 0, strengthDraught: 0, healingPotion: 2 });
    expect(withStatPotion(potion, PARTY[free], 'quicksilver')).toBe(potion);
  });
});
