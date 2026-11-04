import { specials } from '@/content/specials';

import { flagOf, median, specialsCheck } from './specials';

// The whole check at a sample size small enough to stay quick.
const rows = specialsCheck(1);

describe('median and flags', () => {
  it('takes the middle of an odd list and the mean of the middle pair of an even one', () => {
    expect(median([3])).toBe(3);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('flags only outside the 0.5x-1.5x band of the median', () => {
    expect(flagOf(1, 1)).toBeNull();
    expect(flagOf(1.5, 1)).toBeNull();
    expect(flagOf(1.51, 1)).toBe('high');
    expect(flagOf(0.5, 1)).toBeNull();
    expect(flagOf(0.49, 1)).toBe('low');
  });
});

describe('specialsCheck', () => {
  it('returns one row per special', () => {
    expect(rows.length).toBe(Object.values(specials).length);
    expect(rows.map((r) => r.id).sort()).toEqual(Object.keys(specials).sort());
  });

  it('never flags the loot-only special', () => {
    const steal = rows.find((r) => r.id === 'steal')!;
    expect(steal.lootOnly).toBe(true);
    expect(steal.flag).toBeNull();
    for (const row of rows.filter((r) => !r.lootOnly)) expect(row.lootOnly).toBe(false);
  });

  it('keeps every gain within the odds, in share points', () => {
    for (const row of rows) {
      expect(row.min).toBeLessThanOrEqual(row.average + 1e-9);
      expect(row.max).toBeGreaterThanOrEqual(row.average - 1e-9);
      expect(row.min).toBeGreaterThanOrEqual(-100);
      expect(row.max).toBeLessThanOrEqual(100);
    }
  });
});
