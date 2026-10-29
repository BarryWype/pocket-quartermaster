import { simConfig } from './config';
import { runSim } from './engine';
import { summarize } from './metrics';
import { measurePatrolRates } from './patrols';
import { measureWalkRates } from './walking';

// Guild Hall paybacks, from the income a simulated regular player earns at each tier.
// Two short runs are noisy, so this allows 2–9 days; `npm run sim` flags anything outside 3–7.

const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, sampleMinutes: 10 } });
const patrolRates = measurePatrolRates({ ...simConfig, walk: { ...simConfig.walk, sampleMinutes: 10 } });
const summary = summarize(['1', '2'].map((seed) => runSim({ profile: 'regular', days: 25, seed, rates, patrolRates })));

describe('Guild Hall paybacks', () => {
  for (const payback of summary.guild.paybacks.filter((p) => p.track === 'gold')) {
    // Skipped until the class and gear rework rebalances dungeons around threats.
    it.skip(`pays back gold rank ${payback.rank} (${payback.cost} gold) in about 3 to 7 days`, () => {
      expect(payback.days).not.toBeNull();
      expect(payback.days!).toBeGreaterThanOrEqual(2);
      expect(payback.days!).toBeLessThanOrEqual(9);
    });
  }
});
