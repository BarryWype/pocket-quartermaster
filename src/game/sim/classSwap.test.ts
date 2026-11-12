import { heroClasses } from '@/content/heroes';

import { classSwapOdds } from './classSwap';

// The class swap probe's shape, at a sample size small enough to stay quick.

const probe = classSwapOdds(10, [1]);

describe('classSwapOdds', () => {
  it('has a row per class', () => expect(probe.rows.map((r) => r.classId).sort()).toEqual(Object.keys(heroClasses).sort()));

  it('measures the fitted party and each class within 0–1, and the delta against it', () => {
    expect(probe.fitted[0].odds).toBeGreaterThan(0);
    for (const row of probe.rows) {
      const [tier] = row.tiers;
      expect(tier.odds).toBeGreaterThanOrEqual(0);
      expect(tier.odds).toBeLessThanOrEqual(1);
      expect(tier.delta).toBeCloseTo(tier.odds - probe.fitted[0].odds, 5);
    }
  });
});
