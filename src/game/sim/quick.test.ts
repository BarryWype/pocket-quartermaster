import { simConfig } from './config';
import { quickProbe } from './quick';
import { targets } from './targets';

// The quick probe's shape, at a sample size small enough to stay quick.

const tiers = quickProbe({ ...simConfig, quick: { days: 1, runs: 20 } });

describe('quickProbe', () => {
  it('covers all five tiers', () => expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]));

  for (const tier of tiers) {
    it(`tier ${tier.tier} samples normal dungeons and the boss`, () => {
      expect(tier.samples.normal).toBeGreaterThan(0);
      expect(tier.samples.boss).toBeGreaterThan(0);
      for (const value of [tier.gap.medium.prepared, tier.gap.medium.skipped, tier.gap.hard.prepared, tier.gap.hard.skipped, tier.boss]) {
        expect(value).not.toBeNull();
        expect(value as number).toBeGreaterThanOrEqual(0);
        expect(value as number).toBeLessThanOrEqual(1);
      }
    });
  }
});

// The preparation gap on the quick reference tables: the fitted party prepared
// for the briefing against the strongest party ignoring it, per tier.
describe('preparation gap', () => {
  const sampled = quickProbe({ ...simConfig, quick: { days: 3, runs: 150 } });
  for (const tier of sampled) {
    for (const [difficulty, min] of Object.entries(targets.odds.threatGap) as ['medium' | 'hard', number][]) {
      it(`tier ${tier.tier} ${difficulty}: prepared beats skipped by at least ${min * 100} points`, () => {
        const { prepared, skipped } = tier.gap[difficulty];
        expect((prepared as number) - (skipped as number)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
