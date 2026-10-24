import { createRng } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    const sequenceA = Array.from({ length: 10 }, () => a.next());
    const sequenceB = Array.from({ length: 10 }, () => b.next());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng('one').next()).not.toEqual(createRng('two').next());
  });

  it('int stays within inclusive bounds and reaches both ends', () => {
    const rng = createRng('int');
    const rolls = Array.from({ length: 500 }, () => rng.int(2, 4));
    expect(Math.min(...rolls)).toBe(2);
    expect(Math.max(...rolls)).toBe(4);
  });

  it('weighted never picks zero-weight items', () => {
    const rng = createRng('weighted');
    const items = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 1 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(rng.weighted(items, (item) => item.weight).id).toBe('b');
    }
  });

  it('weighted throws when no item has weight', () => {
    expect(() => createRng('x').weighted([{ w: 0 }], (item) => item.w)).toThrow();
  });
});
