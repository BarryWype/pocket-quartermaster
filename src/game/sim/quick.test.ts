import { simConfig } from './config';
import { quickProbe } from './quick';

// The quick probe's shape, at a sample size small enough to stay quick.

const tiers = quickProbe({ ...simConfig, quick: { days: 1, runs: 20 } });

describe('quickProbe', () => {
  it('covers all five tiers', () => expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]));

  for (const tier of tiers) {
    it(`tier ${tier.tier} samples normal dungeons and the boss`, () => {
      expect(tier.samples.normal).toBeGreaterThan(0);
      expect(tier.samples.boss).toBeGreaterThan(0);
      for (const value of [tier.prepared, tier.notPrepared, tier.boss]) {
        expect(value).not.toBeNull();
        expect(value as number).toBeGreaterThanOrEqual(0);
        expect(value as number).toBeLessThanOrEqual(1);
      }
    });
  }
});
