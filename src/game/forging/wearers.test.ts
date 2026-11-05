import { createInitialSave } from '../save';
import { equip } from '../team/team';
import type { GearInstance } from '../types';

import { equippedFirst, wearers } from './salvage';

const piece = (uid: string, itemId: string): GearInstance => ({ uid, itemId, rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 });

const withGear = () => {
  const save = {
    ...createInitialSave(),
    gear: [piece('w1', 'sword1'), piece('a1', 'mail2'), piece('spare', 'sword1')],
  };
  return equip(equip(save, 'bram', 'weapon', 'w1'), 'bram', 'armor', 'a1');
};

describe('wearers', () => {
  it('maps each equipped piece to the hero wearing it, on any slot', () => {
    const save = withGear();
    const bram = save.heroes.find((h) => h.id === 'bram');
    expect(wearers(save).get('w1')).toBe(bram);
    expect(wearers(save).get('a1')).toBe(bram);
  });

  it('leaves spare gear out of the map', () => {
    expect(wearers(withGear()).has('spare')).toBe(false);
  });
});

describe('equippedFirst', () => {
  it('lists equipped items first, each group keeping the input order', () => {
    const save = withGear();
    const items = [piece('spare', 'sword1'), piece('a1', 'mail2'), piece('w1', 'sword1'), piece('spare2', 'sword1')];
    expect(equippedFirst(items, ({ uid }) => uid, save).map(({ uid }) => uid)).toEqual(['a1', 'w1', 'spare', 'spare2']);
  });
});
