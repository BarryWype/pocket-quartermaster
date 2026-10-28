import { guildTrackById } from '@/content/guild';
import { dungeonById, recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { startExpedition } from '../expeditions/expeditions';
import { PATROL_KINDS, TRAVELLER_KINDS } from '../patrols/generate';
import { rankCost } from '../guild/guild';
import { createInitialSave } from '../save';
import { simConfig } from './config';
import { checkSave, runSim } from './engine';
import { summarize } from './metrics';
import { applyOverrides, parseOverride } from './overrides';
import { measurePatrolRates } from './patrols';
import { spamCheck } from './spam';
import { measureWalkRates } from './walking';

// One short walk per pickaxe set keeps the tests quick; the CLI measures the full set.
const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 5 } });
const patrolRates = measurePatrolRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 5 } });

describe('balance lab', () => {
  it('gives the same summary for the same seed, profile and overrides', () => {
    const run = () => summarize([runSim({ profile: 'regular', days: 6, seed: 'same', rates, patrolRates })]);
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('plays through the tutorial and the first tier', () => {
    const log = runSim({ profile: 'regular', days: 8, seed: 'progress', rates, patrolRates });
    expect(log.milestones['boss:1']).toBeDefined();
    expect(log.expeditions.length).toBeGreaterThan(5);
    expect(log.crafts.some((c) => c.kind === 'upgrade')).toBe(true);
  });

  it('never leaves the save in a state the game forbids', () => {
    for (const profile of ['casual', 'dedicated']) {
      runSim({ profile, days: 8, seed: 'legal', rates, patrolRates, afterSession: checkSave });
    }
  });

  it('meets patrols and travellers while keeping the save valid', () => {
    const log = runSim({ profile: 'regular', days: 3, seed: 'patrols', rates, patrolRates, afterSession: checkSave });
    expect(log.patrols.seen.length).toBeGreaterThan(0);
    const kinds = [...PATROL_KINDS, ...TRAVELLER_KINDS];
    for (const row of log.patrols.seen) {
      expect(kinds).toContain(row.kind);
      expect(row.tier).toBeGreaterThanOrEqual(1);
    }
    for (const fight of [...log.patrols.fights, ...log.patrols.escortFights]) {
      expect(PATROL_KINDS).toContain(fight.kind);
      expect(fight.tier).toBeGreaterThanOrEqual(1);
    }
    // Every wounded traveller or pilgrim helped rolls exactly one reward; traders trade instead.
    const helped = log.patrols.travellers.wounded + log.patrols.travellers.pilgrim;
    const rewards = Object.values(log.patrols.rewards).reduce((a, b) => a + b, 0);
    expect(helped).toBe(rewards);
    expect(log.patrols.travellers.trader).toBeLessThanOrEqual(log.patrols.trades);
    expect(log.patrols.recruits.length).toBe(log.patrols.rewards.recruit ?? 0);
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

  it('makes rotating the roster beat spamming the shortest tier 1 dungeon with the same 3 heroes', () => {
    const check = spamCheck(4);
    expect(check.ratio.xp).toBeGreaterThan(1.2);
    expect(check.ratio.gold).toBeGreaterThan(1.2);
  });
});
