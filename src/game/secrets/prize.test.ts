import { secretRules } from '@/content/secrets';

import { createRng } from '../generation/rng';
import { secretPrize } from './prize';

describe('secretPrize', () => {
  it('rolls a relic about relicChance of the time, else rare or legendary gear', () => {
    const prizes = Array.from({ length: 2000 }, (_, i) => secretPrize(2, createRng(`prize|${i}`)));
    const relicShare = prizes.filter((p) => p.dropped.includes('relics')).length / 2000;
    expect(relicShare).toBeGreaterThan(secretRules.prize.relicChance - 0.03);
    expect(relicShare).toBeLessThan(secretRules.prize.relicChance + 0.03);

    const gear = prizes.filter((p) => p.dropped.includes('gear'));
    expect(gear.length).toBeGreaterThan(0);
    for (const prize of gear) {
      expect(prize.relics).toEqual([]);
      expect(prize.gear).toHaveLength(1);
      expect(['rare', 'legendary']).toContain(prize.gear[0].quality);
      expect(prize.gear[0].roll).toBeDefined();
    }
    const legendaryShare = gear.filter((p) => p.gear[0].quality === 'legendary').length / gear.length;
    expect(legendaryShare).toBeGreaterThan(secretRules.prize.legendaryChance - 0.02);
    expect(legendaryShare).toBeLessThan(secretRules.prize.legendaryChance + 0.02);
  });
});
