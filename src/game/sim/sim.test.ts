import { guildTrackById } from '@/content/guild';
import { dungeonById, recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { startExpedition } from '../expeditions/expeditions';
import { rankCost } from '../guild/guild';
import { createInitialSave } from '../save';
import { simConfig } from './config';
import { checkSave, runSim } from './engine';
import { summarize } from './metrics';
import { applyOverrides, parseOverride } from './overrides';
import { measureWalkRates } from './walking';

// One short walk per pickaxe set keeps the tests quick; the CLI measures the full set.
const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 5 } });

describe('balance lab', () => {
  it('gives the same summary for the same seed, profile and overrides', () => {
    const run = () => summarize([runSim({ profile: 'regular', days: 6, seed: 'same', rates })]);
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('plays through the tutorial and the first tier', () => {
    const log = runSim({ profile: 'regular', days: 8, seed: 'progress', rates });
    expect(log.milestones['boss:1']).toBeDefined();
    expect(log.expeditions.length).toBeGreaterThan(5);
    expect(log.crafts.some((c) => c.kind === 'upgrade')).toBe(true);
  });

  it('never leaves the save in a state the game forbids', () => {
    for (const profile of ['casual', 'dedicated']) {
      runSim({ profile, days: 8, seed: 'legal', rates, afterSession: checkSave });
    }
  });

  it('relies on the game functions, which refuse what is not allowed', () => {
    expect(() => craft(createInitialSave(), recipeById.woodSword)).toThrow();
    const away = startExpedition({ ...createInitialSave(), tutorial: { step: 'done', woodSpot: null } }, 'ratCellar', ['bram'], 0);
    expect(() => startExpedition(away, 'ratCellar', ['bram'], 0)).toThrow(/already away/);
    expect(() => startExpedition(away, dungeonById.ogreQuarry.id, ['lyra'], 0)).toThrow(/not available/);
  });
});

describe('--set overrides', () => {
  it('changes a content number until undone', () => {
    const before = rankCost(guildTrackById.heroXp, 1);
    const undo = applyOverrides([parseOverride('guild.heroXp.baseCost=80')]);
    expect(rankCost(guildTrackById.heroXp, 1)).toBe(80);
    undo();
    expect(rankCost(guildTrackById.heroXp, 1)).toBe(before);
  });

  it('reaches into arrays and refuses unknown or non-numeric paths', () => {
    const undo = applyOverrides([parseOverride('dungeons.ratCellar.gold.1=99')]);
    expect(dungeonById.ratCellar.gold[1]).toBe(99);
    undo();
    expect(dungeonById.ratCellar.gold[1]).not.toBe(99);
    expect(() => applyOverrides([parseOverride('guild.nope.baseCost=1')])).toThrow(/Unknown path/);
    expect(() => applyOverrides([parseOverride('dungeons.ratCellar.name=1')])).toThrow(/string/);
    expect(() => parseOverride('sim.odds.runs=lots')).toThrow();
  });
});
