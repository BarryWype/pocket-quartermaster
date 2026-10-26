import { guildRules } from '@/content/guild';

import { averageRecruitPrice, bossBeatenOn, paybacks, spendTimeline, tierIncome } from './economy';

// The economy model: income from simulated expeditions at each tier, and when
// Guild Hall upgrades pay for themselves. See economy.ts for the assumptions.

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

  it('keeps the 4th to 6th recruits reachable in the first days of tier 2, Guild Hall or not', () => {
    const { recruits } = spendTimeline(incomes, guildRules.rankGates, true);
    expect(recruits).toHaveLength(3);
    expect(Math.max(...recruits)).toBeLessThanOrEqual(bossBeatenOn(1) + 2);
    expect(averageRecruitPrice(bossBeatenOn(1), 5)).toBeLessThan(incomes[1].dungeonGold);
  });
});
