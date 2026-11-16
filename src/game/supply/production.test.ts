import { supplyRules, type TradeId } from '@/content/supplyLines';

import { createInitialSave, type SaveData } from '../save';
import type { HeroState } from '../types';
import { buildingCap, buildingRate, buildingRateParts, buildingStockTotal, buildingsAtCap, settleBuilding, settleBuildings } from './production';
import { emptySupply } from './state';
import { tradeLevel } from './trades';
import type { Building } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);

const buildingIn = (extra: Partial<Building> = {}): Building => ({
  id: 'bx',
  kind: 'farm',
  siteId: 's1',
  position: origin,
  quality: 2,
  builtAt: now,
  expiresAt: now + 6 * 24 * HOUR,
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

const saveWith = (buildings: Building[], heroes?: SaveData['heroes']): SaveData => ({
  ...createInitialSave(),
  ...(heroes ? { heroes } : {}),
  supply: { ...emptySupply(now), buildings },
});

const heroWithTrade = (heroId: string, tradeId: TradeId, hours = 0): HeroState => {
  const hero = createInitialSave().heroes.find((h) => h.id === heroId)!;
  return { ...hero, trade: { id: tradeId, hours } };
};

afterEach(() => jest.restoreAllMocks());

describe('buildingRate', () => {
  it("locals work an empty building at the locals' share of the quality-scaled base rate", () => {
    const building = buildingIn({ quality: 2 });
    const parts = buildingRateParts(saveWith([building]), building, now);
    expect(parts.quality).toBe(2);
    expect(parts.share).toBe(supplyRules.production.localsShare);
    expect(parts.tradeBonus).toBe(0);
    expect(parts.rate).toBeCloseTo(2 * supplyRules.buildings.kinds.farm.baseRate * supplyRules.production.localsShare);
  });

  it("an empty building makes nothing when the locals' share is 0", () => {
    const building = buildingIn();
    const save = saveWith([building]);
    jest.replaceProperty(supplyRules.production, 'localsShare', 0);
    expect(buildingRate(save, building, now)).toBe(0);
    expect(settleBuilding(save, building, now + 10 * HOUR).stock).toEqual({});
  });

  it('a matching farmer adds the trade bonus by trade level', () => {
    const save = saveWith([buildingIn({ heroId: 'lyra' })], [heroWithTrade('lyra', 'farmer')]);
    const building = save.supply.buildings[0];
    for (const hours of supplyRules.trade.levelHours) {
      const posted = { ...save, heroes: [{ ...save.heroes[0], trade: { id: 'farmer' as TradeId, hours } }] };
      const parts = buildingRateParts(posted, building, now);
      expect(parts.share).toBe(1);
      expect(parts.tradeBonus).toBe(supplyRules.production.tradeBonus[tradeLevel(hours) - 1]);
      expect(parts.rate).toBeCloseTo(2 * supplyRules.buildings.kinds.farm.baseRate * (1 + parts.tradeBonus));
    }
  });

  it('a watchman posted runs the full rate with no bonus', () => {
    const save = saveWith([buildingIn({ heroId: 'bram' })], [heroWithTrade('bram', 'watchman', 120)]);
    const parts = buildingRateParts(save, save.supply.buildings[0], now);
    expect(parts.share).toBe(1);
    expect(parts.tradeBonus).toBe(0);
    expect(parts.rate).toBeCloseTo(2 * supplyRules.buildings.kinds.farm.baseRate);
  });

  it('the inspection bonus applies until it expires', () => {
    const building = buildingIn({ quality: 1, inspectedUntil: now + 10 * HOUR });
    const save = saveWith([building]);
    const inspected = buildingRateParts(save, building, now);
    expect(inspected.inspected).toBe(true);
    expect(inspected.rate).toBeCloseTo(supplyRules.buildings.kinds.farm.baseRate * supplyRules.production.localsShare * (1 + supplyRules.production.inspectBonus));
    const expired = buildingRateParts(save, { ...building, inspectedUntil: now }, now + HOUR);
    expect(expired.inspected).toBe(false);
    expect(expired.rate).toBeCloseTo(supplyRules.buildings.kinds.farm.baseRate * supplyRules.production.localsShare);
  });

  it('a closed building produces nothing', () => {
    const building = buildingIn({ closedUntil: now + 5 * HOUR });
    const save = saveWith([building]);
    expect(buildingRate(save, building, now)).toBe(0);
    expect(buildingRate(save, building, now + 6 * HOUR)).toBeGreaterThan(0);
  });
});

describe('buildingCap', () => {
  it('holds capHours of full output at the building’s quality', () => {
    const farm = buildingIn({ quality: 2 });
    expect(buildingCap(farm)).toBe(Math.floor(supplyRules.production.capHours * 2 * supplyRules.buildings.kinds.farm.baseRate));
    const quarry = buildingIn({ quality: 3, kind: 'quarry' });
    expect(buildingCap(quarry)).toBe(Math.floor(supplyRules.production.capHours * 3 * supplyRules.buildings.kinds.quarry.baseRate));
  });
});

describe('settleBuilding', () => {
  it('stock builds and stops at the cap, then resumes once collected', () => {
    const building = buildingIn({ quality: 1 });
    const save = saveWith([building]);
    const capped = settleBuilding(save, building, now + 100 * HOUR);
    expect(buildingStockTotal(capped)).toBe(buildingCap(building));
    expect(capped.progress).toBe(0);
    const collected = settleBuilding(save, { ...capped, stock: {} }, now + 110 * HOUR);
    expect(buildingStockTotal(collected)).toBeGreaterThan(0);
  });

  it('settling once over a span matches settling every 17 minutes', () => {
    const start = now - 5 * HOUR;
    const end = now + 5 * HOUR;
    const building = buildingIn({ quality: 1, settledAt: start, inspectedUntil: start + 2 * HOUR });
    const save = saveWith([building]);
    const once = settleBuilding(save, building, end);
    let stepped = building;
    for (let t = start + 17 * 60_000; t <= end; t += 17 * 60_000) stepped = settleBuilding(save, stepped, Math.min(t, end));
    stepped = settleBuilding(save, stepped, end);
    // Progress differs only by float noise: the units, stock and times match.
    const { progress: onceProgress, ...onceRest } = once;
    const { progress: steppedProgress, ...steppedRest } = stepped;
    expect(steppedRest).toEqual(onceRest);
    expect(steppedProgress).toBeCloseTo(onceProgress, 9);
    expect(once.made).toBeGreaterThan(0);
  });

  it('farm units roll the kind’s weights, the same every time', () => {
    const building = buildingIn({ quality: 3, heroId: 'lyra' });
    const save = saveWith([building], [heroWithTrade('lyra', 'farmer')]);
    const rounds = 4;
    const run = () => {
      let settled = building;
      const counts: Record<string, number> = {};
      for (let i = 0; i < rounds; i++) {
        settled = settleBuilding(save, settled, now + (i + 1) * 8 * HOUR);
        for (const [material, amount] of Object.entries(settled.stock)) counts[material] = (counts[material] ?? 0) + amount;
        settled = { ...settled, stock: {} };
      }
      return counts;
    };
    const counts = run();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBeCloseTo(rounds * 8 * 3 * supplyRules.buildings.kinds.farm.baseRate * 1.25, 5);
    const makes = supplyRules.buildings.kinds.farm.makes;
    for (const [material, weight] of Object.entries(makes)) {
      expect(Math.abs(counts[material] / total - weight / 100)).toBeLessThan(0.1);
    }
    expect(run()).toEqual(counts);
  });
});

describe('buildingsAtCap', () => {
  it('counts the buildings whose settled stock has reached their cap', () => {
    const cap = buildingCap(buildingIn());
    const full = buildingIn({ id: 'full', stock: { grain: cap } });
    const partial = buildingIn({ id: 'partial', stock: { grain: 3 } });
    const save = saveWith([full, partial]);
    expect(buildingsAtCap(save, now)).toBe(1);
    // Left alone, the partial building fills to its cap and joins the count.
    expect(buildingsAtCap(save, now + 50 * HOUR)).toBe(2);
  });
});

describe('settleBuildings', () => {
  it('returns the same save when there are no buildings, and settles to the same state twice', () => {
    const save = saveWith([]);
    expect(settleBuildings(save, now + 5 * HOUR)).toBe(save);
    const withBuilding = saveWith([buildingIn({ quality: 1 })]);
    const once = settleBuildings(withBuilding, now + 5 * HOUR);
    expect(settleBuildings(once, now + 5 * HOUR)).toBe(once);
  });

  it('trade hours accrue only where the posted hero’s trade is used', () => {
    const buildings = [
      buildingIn({ id: 'a', kind: 'herbGarden', heroId: 'bram', postedAt: now }),
      buildingIn({ id: 'b', kind: 'farm', heroId: 'mira', postedAt: now }),
      buildingIn({ id: 'c', kind: 'farm', heroId: 'lyra', postedAt: now + 2 * HOUR }),
    ];
    const save = saveWith(buildings, [heroWithTrade('bram', 'herbalist'), heroWithTrade('mira', 'teamster'), heroWithTrade('lyra', 'watchman')]);
    const settled = settleBuildings(save, now + 7 * HOUR);
    const hours = (heroId: string) => settled.heroes.find((h) => h.id === heroId)!.trade.hours;
    expect(hours('bram')).toBeCloseTo(7);
    expect(hours('mira')).toBe(0);
    // The watchman was posted two hours in: only the posted time counts.
    expect(hours('lyra')).toBeCloseTo(5);
  });
});
