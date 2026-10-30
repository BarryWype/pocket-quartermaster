import { relicById } from '@/content/lookup';

import { createRng } from '../generation/rng';
import { rollSourceLoot } from './roll';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const request = (source: LootSourceId, seed: string, tier: number): LootRequest => ({
  source,
  tier,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: { playerTier: 1, pickaxeTier: 3, knownRecipes: [], favourCounts: {}, mastery: {} },
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  force: 'relics',
});

describe('relic drops', () => {
  it('gives a relic of the source tier, at every tier', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < 20; i++) {
        const loot = rollSourceLoot(request('sanctum', `relics:${tier}:${i}`, tier));
        expect(loot.relics).toHaveLength(1);
        expect(relicById[loot.relics[0]].tier).toBe(tier);
      }
    }
  });
});
