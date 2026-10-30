import { lootConfig } from '@/content/loot/config';
import { valuables, type ValuableRarity } from '@/content/loot/valuables';
import { valuableById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { createRng } from '../generation/rng';
import { localDayKey } from '../gathering/gathering';
import { generators } from './generators';
import { emptyLoot } from './types';
import { collectorWants, rollValuable, todaysCollector, valuableSellPrice } from './valuables';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const context = { playerTier: 3, pickaxeTier: 3, knownRecipes: [], favourCounts: {}, mastery: {} };

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context,
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

describe('valuable drops', () => {
  it('shares the rarities 70/25/5 and always keeps the request tier', () => {
    const rolls = Array.from({ length: 5000 }, (_, i) => rollValuable(request('tierBoss', `v${i}`, { tier: (i % 5) + 1 })));
    const shares = (rarity: ValuableRarity) =>
      rolls.filter((roll) => valuableById[roll.valuableId].rarity === rarity).length / rolls.length;
    expect(shares('common')).toBeGreaterThan(0.67);
    expect(shares('common')).toBeLessThan(0.73);
    expect(shares('uncommon')).toBeGreaterThan(0.22);
    expect(shares('uncommon')).toBeLessThan(0.28);
    expect(shares('rare')).toBeGreaterThan(0.02);
    expect(shares('rare')).toBeLessThan(0.08);
    for (const [i, roll] of rolls.entries()) expect(roll.tier).toBe((i % 5) + 1);
    for (const roll of rolls) expect(roll.amount).toBe(1);
  });

  it('pushes exactly one entry through the generator', () => {
    const req = request('tierBoss', 'gen');
    const loot = emptyLoot();
    generators.valuables(req, loot);
    expect(loot.valuables).toHaveLength(1);
    expect(loot.valuables[0].tier).toBe(req.tier);
    expect(loot.valuables[0].amount).toBe(1);
    expect(valuables.some((v) => v.id === loot.valuables[0].valuableId)).toBe(true);
  });
});

describe('valuable prices', () => {
  it('follows the tier price curve from the base price', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(valuableSellPrice('jadeIdol', tier, 'market')).toBe(Math.round(30 * lootConfig.valuablePriceByTier[tier - 1]));
    }
  });

  it('pays full price at the market and the guild, half elsewhere, nothing at the chapel', () => {
    const full = valuableSellPrice('jadeIdol', 3, 'market');
    for (const buyer of ['market', 'thievesGuild'] as const) {
      expect(valuableSellPrice('jadeIdol', 3, buyer)).toBe(full);
    }
    for (const buyer of ['smithy', 'huntingLodge', 'apothecary', 'trader'] as const) {
      expect(valuableSellPrice('jadeIdol', 3, buyer)).toBe(Math.max(1, Math.round(full * lootConfig.valuables.elsewhereShare)));
    }
    expect(valuableSellPrice('jadeIdol', 3, 'chapel')).toBe(0);
  });

  it("doubles only the collector's wanted id at the market", () => {
    const doubled = valuableSellPrice('jadeIdol', 3, 'market', 'jadeIdol');
    expect(doubled).toBe(valuableSellPrice('jadeIdol', 3, 'market') * lootConfig.valuables.collectorMultiplier);
    expect(valuableSellPrice('painting', 3, 'market', 'jadeIdol')).toBe(valuableSellPrice('painting', 3, 'market'));
    expect(valuableSellPrice('jadeIdol', 3, 'smithy', 'jadeIdol')).toBe(valuableSellPrice('jadeIdol', 3, 'smithy'));
  });
});

describe("the market's collector", () => {
  it('is deterministic per spawn and day', () => {
    expect(collectorWants('place:market:tile:0:1', '2026-01-02')).toBe(collectorWants('place:market:tile:0:1', '2026-01-02'));
    expect(new Set(Array.from({ length: 200 }, (_, i) => collectorWants('place:market:tile:0:1', `2026-01-${String(i + 1).padStart(2, '0')}`))).size).toBeGreaterThanOrEqual(5);
  });

  it('favours old coins about a fifth of the time', () => {
    const picks = Array.from({ length: 5000 }, (_, i) => collectorWants(`spawn${i}`, `day${i}`));
    const share = picks.filter((id) => id === 'oldCoins').length / picks.length;
    expect(share).toBeGreaterThan(0.16);
    expect(share).toBeLessThan(0.24);
    for (const pick of picks) expect(valuables.some((v) => v.id === pick)).toBe(true);
  });

  it('uses the debug override only on its own day', () => {
    const now = Date.UTC(2026, 0, 2);
    const save: SaveData = { ...createInitialSave(), collectorOverride: { dayKey: localDayKey(now), valuableId: 'jadeIdol' } };
    expect(todaysCollector(save, 'spawn', now)).toBe('jadeIdol');
    expect(todaysCollector(save, 'spawn', now + 24 * 3_600_000)).toBe(collectorWants('spawn', localDayKey(now + 24 * 3_600_000)));
    const plain: SaveData = createInitialSave();
    expect(todaysCollector(plain, 'spawn', now)).toBe(collectorWants('spawn', localDayKey(now)));
  });
});
