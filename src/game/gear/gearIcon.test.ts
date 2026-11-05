import { gearIconOf } from '@/game/gear/gearIcon';
import { itemById, relicById } from '@/content/lookup';
import type { GearDef, GearInstance } from '@/game/types';

const base: GearInstance = {
  uid: 'g1',
  itemId: 'sword1',
  rarity: 'rare',
  roll: 10,
  affixes: [],
  rerolls: 0,
};

describe('gearIconOf', () => {
  it('returns the relic icon for a restored relic piece', () => {
    const gear: GearInstance = { ...base, relicId: 'sextonsMace', rarity: 'legendary' };
    expect(gearIconOf(gear)).toBe(relicById.sextonsMace.icon);
  });

  it('returns the base item icon for a piece without a relic', () => {
    expect(gearIconOf(base)).toBe((itemById.sword1 as GearDef).icon);
  });
});
