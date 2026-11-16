import { jobById } from '@/content/jobs';
import { supplyRules, type TradeId } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { createInitialSave, type SaveData } from '../save';
import type { HeroState } from '../types';
import { campCap, campRate, campRateParts, campStockTotal, campsAtCap, settleCamp, settleCamps } from './production';
import { emptySupply } from './state';
import { tradeLevel } from './trades';
import type { Camp } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);
const cell = cellAt(origin);

const campIn = (extra: Partial<Camp> = {}): Camp => ({
  id: 'cx',
  kind: 'timber',
  cell,
  quality: 2,
  foundedAt: now,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

const saveWith = (camps: Camp[], heroes?: SaveData['heroes']): SaveData => ({
  ...createInitialSave(),
  ...(heroes ? { heroes } : {}),
  supply: { ...emptySupply(now), camps },
});

const heroWithTrade = (heroId: string, tradeId: TradeId, hours = 0): HeroState => {
  const hero = createInitialSave().heroes.find((h) => h.id === heroId)!;
  return { ...hero, trade: { id: tradeId, hours } };
};

afterEach(() => jest.restoreAllMocks());

describe('campRate', () => {
  it("locals work an empty camp at the locals' share of the quality-scaled base rate", () => {
    const camp = campIn({ quality: 2 });
    const parts = campRateParts(saveWith([camp]), camp, now);
    expect(parts.quality).toBe(2);
    expect(parts.share).toBe(supplyRules.production.localsShare);
    expect(parts.tradeBonus).toBe(0);
    expect(parts.rate).toBeCloseTo(2 * supplyRules.production.baseRate.timber * supplyRules.production.localsShare);
  });

  it("an empty camp makes nothing when the locals' share is 0", () => {
    const camp = campIn();
    const save = saveWith([camp]);
    jest.replaceProperty(supplyRules.production, 'localsShare', 0);
    expect(campRate(save, camp, now)).toBe(0);
    expect(settleCamp(save, camp, now + 10 * HOUR).stock).toEqual({});
  });

  it('a matching woodcutter adds the trade bonus by trade level', () => {
    const save = saveWith([campIn({ heroId: 'bram' })], [heroWithTrade('bram', 'woodcutter')]);
    const camp = save.supply.camps[0];
    for (const hours of supplyRules.trade.levelHours) {
      const posted = { ...save, heroes: [{ ...save.heroes[0], trade: { id: 'woodcutter' as TradeId, hours } }] };
      const parts = campRateParts(posted, camp, now);
      expect(parts.share).toBe(1);
      expect(parts.tradeBonus).toBe(supplyRules.production.tradeBonus[tradeLevel(hours) - 1]);
      expect(parts.rate).toBeCloseTo(2 * supplyRules.production.baseRate.timber * (1 + parts.tradeBonus));
    }
  });

  it('a watchman posted runs the full rate with no bonus', () => {
    const save = saveWith([campIn({ heroId: 'bram' })], [heroWithTrade('bram', 'watchman', 120)]);
    const parts = campRateParts(save, save.supply.camps[0], now);
    expect(parts.share).toBe(1);
    expect(parts.tradeBonus).toBe(0);
    expect(parts.rate).toBeCloseTo(2 * supplyRules.production.baseRate.timber);
  });

  it('the inspection bonus applies until it expires', () => {
    const camp = campIn({ quality: 1, inspectedUntil: now + 10 * HOUR });
    const save = saveWith([camp]);
    const inspected = campRateParts(save, camp, now);
    expect(inspected.inspected).toBe(true);
    expect(inspected.rate).toBeCloseTo(supplyRules.production.baseRate.timber * supplyRules.production.localsShare * (1 + supplyRules.production.inspectBonus));
    const expired = campRateParts(save, { ...camp, inspectedUntil: now }, now + HOUR);
    expect(expired.inspected).toBe(false);
    expect(expired.rate).toBeCloseTo(supplyRules.production.baseRate.timber * supplyRules.production.localsShare);
  });

  it('a closed camp produces nothing', () => {
    const camp = campIn({ closedUntil: now + 5 * HOUR });
    const save = saveWith([camp]);
    expect(campRate(save, camp, now)).toBe(0);
    expect(campRate(save, camp, now + 6 * HOUR)).toBeGreaterThan(0);
  });
});

describe('campCap', () => {
  it('holds capHours of full output at the camp’s quality', () => {
    const timber = campIn({ quality: 2 });
    expect(campCap(timber)).toBe(Math.floor(supplyRules.production.capHours * 2 * supplyRules.production.baseRate.timber));
    const trapper = campIn({ quality: 3, kind: 'trapper' });
    expect(campCap(trapper)).toBe(Math.floor(supplyRules.production.capHours * 3 * supplyRules.production.baseRate.trapper));
  });
});

describe('settleCamp', () => {
  it('stock builds and stops at the cap, then resumes once collected', () => {
    const camp = campIn({ quality: 1 });
    const save = saveWith([camp]);
    const capped = settleCamp(save, camp, now + 100 * HOUR);
    expect(campStockTotal(capped)).toBe(campCap(camp));
    expect(capped.progress).toBe(0);
    const collected = settleCamp(save, { ...capped, stock: {} }, now + 110 * HOUR);
    expect(campStockTotal(collected)).toBeGreaterThan(0);
  });

  it('settling once over a span matches settling every 17 minutes', () => {
    const start = now - 5 * HOUR;
    const end = now + 5 * HOUR;
    const camp = campIn({ quality: 1, settledAt: start, inspectedUntil: start + 2 * HOUR });
    const save = saveWith([camp]);
    const once = settleCamp(save, camp, end);
    let stepped = camp;
    for (let t = start + 17 * 60_000; t <= end; t += 17 * 60_000) stepped = settleCamp(save, stepped, Math.min(t, end));
    stepped = settleCamp(save, stepped, end);
    // Progress differs only by float noise: the units, stock and times match.
    const { progress: onceProgress, ...onceRest } = once;
    const { progress: steppedProgress, ...steppedRest } = stepped;
    expect(steppedRest).toEqual(onceRest);
    expect(steppedProgress).toBeCloseTo(onceProgress, 9);
    expect(once.made).toBeGreaterThan(0);
  });

  it('trapper units roll the trapper job’s weights, the same every time', () => {
    const camp = campIn({ quality: 3, kind: 'trapper', heroId: 'lyra' });
    const save = saveWith([camp], [heroWithTrade('lyra', 'trapper')]);
    const rounds = 4;
    const run = () => {
      let settled = camp;
      const counts: Record<string, number> = {};
      for (let i = 0; i < rounds; i++) {
        settled = settleCamp(save, settled, now + (i + 1) * 8 * HOUR);
        for (const [material, amount] of Object.entries(settled.stock)) counts[material] = (counts[material] ?? 0) + amount;
        settled = { ...settled, stock: {} };
      }
      return counts;
    };
    const counts = run();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBeCloseTo(rounds * 8 * 3 * supplyRules.production.baseRate.trapper * 1.25, 5);
    const weights = (jobById.trapper.produces as { weights: Record<string, number> }).weights;
    for (const [material, weight] of Object.entries(weights)) {
      expect(Math.abs(counts[material] / total - weight / 100)).toBeLessThan(0.1);
    }
    expect(run()).toEqual(counts);
  });
});

describe('campsAtCap', () => {
  it('counts the camps whose settled stock has reached their cap', () => {
    const cap = campCap(campIn());
    const full = campIn({ id: 'full', stock: { wood: cap } });
    const partial = campIn({ id: 'partial', stock: { wood: 3 } });
    const save = saveWith([full, partial]);
    expect(campsAtCap(save, now)).toBe(1);
    // Left alone, the partial camp fills to its cap and joins the count.
    expect(campsAtCap(save, now + 50 * HOUR)).toBe(2);
  });
});

describe('settleCamps', () => {
  it('returns the same save when there are no camps, and settles to the same state twice', () => {
    const save = saveWith([]);
    expect(settleCamps(save, now + 5 * HOUR)).toBe(save);
    const withCamp = saveWith([campIn({ quality: 1 })]);
    const once = settleCamps(withCamp, now + 5 * HOUR);
    expect(settleCamps(once, now + 5 * HOUR)).toBe(once);
  });

  it('trade hours accrue only where the posted hero’s trade is used', () => {
    const camps = [
      campIn({ id: 'a', heroId: 'bram', postedAt: now }),
      campIn({ id: 'b', heroId: 'mira', postedAt: now }),
      campIn({ id: 'c', heroId: 'lyra', postedAt: now + 2 * HOUR }),
    ];
    const save = saveWith(camps, [heroWithTrade('bram', 'woodcutter'), heroWithTrade('mira', 'teamster'), heroWithTrade('lyra', 'watchman')]);
    const settled = settleCamps(save, now + 7 * HOUR);
    const hours = (heroId: string) => settled.heroes.find((h) => h.id === heroId)!.trade.hours;
    expect(hours('bram')).toBeCloseTo(7);
    expect(hours('mira')).toBe(0);
    // The watchman was posted two hours in: only the posted time counts.
    expect(hours('lyra')).toBeCloseTo(5);
  });
});
