import { renderReport } from '../../../scripts/sim/report';
import { checkSave, runSim } from './engine';
import { summarize, supplySummary } from './metrics';
import { applyOverrides, parseOverride } from './overrides';
import { simConfig } from './config';
import { measureWalkRates } from './walking';

// One 15-minute walk per pickaxe set keeps the tests quick; the CLI measures the full set.
const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 15 } });

describe('supply lines', () => {
  it('plays the network behind the flag: discovers, builds, serves an order and counts it', () => {
    // Full XP above the tier band reaches tier 2, where the network opens, quickly.
    const undo = applyOverrides([parseOverride('xp.aboveBandShare=1')]);
    const log = runSim({ profile: 'regular', maxDays: 34, seed: 'supply-net', rates, supplyLines: true, afterSession: checkSave });
    undo();
    expect(log.milestones['boss:1']).toBeDefined();
    const supply = log.supply!;
    // The bot discovered at least one site and one order place, and built on a site.
    expect(supply.discoveredSites).toBeGreaterThan(0);
    expect(supply.discoveredPlaces).toBeGreaterThan(0);
    expect(supply.made).toBeGreaterThan(0);
    // Some delivery reached an order place, by cart or by hand, and was paid.
    expect(supply.toPlacesByCart + supply.toPlacesByHand).toBeGreaterThan(0);
    expect(supply.orderGold).toBeGreaterThan(0);
    expect(supply.ordersServed).toBeGreaterThan(0);
    // The summary and the report carry the network's numbers.
    const summary = supplySummary([log])!;
    expect(summary.madePerDay.median).toBeGreaterThan(0);
    expect(summary.orderGoldPerDay.median).toBeGreaterThan(0);
    const report = renderReport({ summaries: [summarize([log])], rules: [], settings: { seeds: 1, seed: 'supply-net', overrides: [], elapsed: 0, date: 'test' }, difficultyOdds: {} });
    expect(report).toContain('## Supply lines');
    expect(report).toContain('Goods made by buildings / day (units)');
  });

  it('plays nothing supply-related without the flag: no supply summary, no report section', () => {
    const log = runSim({ profile: 'regular', maxDays: 4, seed: 'supply-off', rates });
    expect(log.supply).toBeNull();
    const summary = summarize([log]);
    expect(summary.supply).toBeNull();
    const report = renderReport({ summaries: [summary], rules: [], settings: { seeds: 1, seed: 'supply-off', overrides: [], elapsed: 0, date: 'test' }, difficultyOdds: {} });
    expect(report).not.toContain('## Supply lines');
  });
});
