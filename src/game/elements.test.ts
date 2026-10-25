import { elementRules } from '@/content/elements';

import { beats, convertShards, ELEMENTS, incomingMultiplier, weaponMultiplier } from './elements';

describe('element loop', () => {
  it('has each element beat exactly the next one: fire → grass → stone → electric → water → fire', () => {
    const loop = ['fire', 'grass', 'stone', 'electric', 'water'] as const;
    loop.forEach((element, i) => {
      const next = loop[(i + 1) % loop.length];
      expect(beats(element, next)).toBe(true);
      expect(beats(next, element)).toBe(false);
    });
    for (const a of ELEMENTS) expect(ELEMENTS.filter((b) => beats(a, b))).toHaveLength(1);
  });

  it('boosts a weapon against what it beats and weakens it against what beats it', () => {
    expect(weaponMultiplier('water', 'fire')).toBe(elementRules.strongMultiplier);
    expect(weaponMultiplier('fire', 'water')).toBe(elementRules.weakMultiplier);
    expect(weaponMultiplier('fire', 'stone')).toBe(1);
    expect(weaponMultiplier(undefined, 'fire')).toBe(1);
    expect(weaponMultiplier('fire', undefined)).toBe(1);
  });

  it('halves damage from the armour element, and punishes having no protection', () => {
    const plain = { resists: [] };
    expect(incomingMultiplier('fire', { armour: 'fire', resists: [] })).toBe(elementRules.armourMultiplier);
    expect(incomingMultiplier('fire', { resists: ['fire'] })).toBe(1);
    expect(incomingMultiplier('fire', plain)).toBe(elementRules.unprotectedMultiplier);
    expect(incomingMultiplier('fire', { armour: 'water', resists: [] })).toBe(elementRules.unprotectedMultiplier);
    expect(incomingMultiplier(undefined, plain)).toBe(1);
  });
});

describe('convertShards', () => {
  it('turns every 10 shards of an element into a stone', () => {
    expect(convertShards({ fireShard: 23, waterShard: 4, wood: 2 })).toEqual({
      fireShard: 3,
      fireStone: 2,
      waterShard: 4,
      wood: 2,
    });
  });

  it('adds to existing stones and leaves no empty shard entry', () => {
    expect(convertShards({ grassShard: 10, grassStone: 1 })).toEqual({ grassStone: 2 });
  });
});
