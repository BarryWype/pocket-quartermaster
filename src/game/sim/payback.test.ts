import { guildRules } from '@/content/guild';

import { paybacks, tierIncome } from './payback';

// The economy model: income from simulated expeditions at each tier, and when
// Guild Hall upgrades pay for themselves. See payback.ts for the assumptions.

const incomes = [1, 2, 3, 4, 5].map((tier) => tierIncome(tier));

describe('economy', () => {
  it('earns more gold every tier', () => {
    incomes.slice(1).forEach((income, i) => expect(income.dungeonGold).toBeGreaterThan(incomes[i].dungeonGold));
  });

  for (const payback of paybacks(incomes, guildRules.rankGates)) {
    it(`pays back ${payback.track} rank ${payback.rank} (${payback.cost} gold) in 3 to 7 days`, () => {
      expect(payback.days).toBeGreaterThanOrEqual(3);
      expect(payback.days).toBeLessThanOrEqual(7);
    });
  }
});
