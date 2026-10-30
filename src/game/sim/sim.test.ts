import * as fs from 'node:fs';
import * as path from 'node:path';

import { guildTrackById } from '@/content/guild';
import { dungeonById, recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { startExpedition } from '../expeditions/expeditions';
import { PATROL_KINDS, TRAVELLER_KINDS } from '../patrols/generate';
import { rankCost } from '../guild/guild';
import { parseMatrixCsv } from '../loot/matrixCsv';
import type { LootSourceId } from '../loot/types';
import { createInitialSave } from '../save';
import { profiles, simConfig } from './config';
import { checkSave, runSim } from './engine';
import { applyOverrides, parseOverride } from './overrides';
import { spamCheck } from './spam';
import { measureWalkRates } from './walking';

// One 15-minute walk per pickaxe set keeps the tests quick; the CLI measures the full set.
const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 15 } });

const csv = parseMatrixCsv(fs.readFileSync(path.resolve(__dirname, '../../../doc/design/loot/matrix.csv'), 'utf8'));
const total = (visits: Partial<Record<LootSourceId, number>>, sources: LootSourceId[]) => sources.reduce((sum, s) => sum + (visits[s] ?? 0), 0);
const FIGHT_EVENTS: LootSourceId[] = ['banditCamp', 'goblinRaid', 'beastDen', 'hauntedCrypt', 'elementalRift', 'abandonedCaravan', 'wantedOutlaw'];
const PATROLS: LootSourceId[] = ['patrolGoblins', 'patrolHerd', 'patrolBandits'];
const QUESTS: LootSourceId[] = ['questShort', 'questMedium', 'questLong'];

describe('profiles', () => {
  it('gives the regular player the visits column of matrix.csv', () => {
    for (const [source, row] of Object.entries(csv)) expect(profiles.regular.visits[source as LootSourceId]).toBe(row.visitsPerDay);
  });

  it('gives casual and heavy players the spec’s daily activity', () => {
    const { casual, heavy } = profiles;
    expect(total(casual.visits, ['dungeonRun', 'firstWin'])).toBe(3);
    expect(casual.visits.overnightExpedition).toBe(0);
    expect(total(casual.visits, QUESTS)).toBeCloseTo(2);
    expect(total(casual.visits, PATROLS)).toBeCloseTo(1);
    expect(total(casual.visits, FIGHT_EVENTS)).toBeCloseTo(1);
    expect(casual.visits.ruinsDig).toBe(0.5);
    expect(casual.walkHours).toHaveLength(1);
    expect(total(heavy.visits, ['dungeonRun', 'firstWin'])).toBe(12);
    expect(heavy.visits.overnightExpedition).toBe(1);
    expect(total(heavy.visits, QUESTS)).toBeCloseTo(3);
    expect(heavy.visits.secretQuest).toBe(0.5);
    expect(total(heavy.visits, PATROLS)).toBeCloseTo(6);
    expect(total(heavy.visits, FIGHT_EVENTS)).toBeCloseTo(5);
    expect(heavy.visits.ruinsDig).toBe(2);
    expect(heavy.visits.stepChest).toBe(4);
    expect(heavy.walkHours).toHaveLength(3);
    // Sources the spec leaves out follow the regular player's, halved or ×1.5.
    expect(casual.visits.heist).toBeCloseTo(csv.heist.visitsPerDay * 0.5);
    expect(heavy.visits.heist).toBeCloseTo(csv.heist.visitsPerDay * 1.5);
  });

  it('launches no more expeditions a day than the profile plans', () => {
    const log = runSim({ profile: 'casual', maxDays: 5, seed: 'cap', rates });
    for (let day = 2; day <= 5; day++) expect(log.expeditions.filter((e) => e.day === day && !e.overnight).length).toBeLessThanOrEqual(3);
    expect(log.expeditions.some((e) => e.overnight)).toBe(false);
  });

  it('stops at the day cap when the tier 5 boss still stands', () => {
    const log = runSim({ profile: 'regular', maxDays: 4, seed: 'cap', rates });
    expect(log.days).toBe(4);
    expect(log.finished).toBe(false);
  });
});

describe('balance lab', () => {
  it('gives the same summary for the same seed, profile and overrides', () => {
    const run = () => runSim({ profile: 'regular', maxDays: 6, seed: 'same', rates });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('plays through the tutorial and the first tier', () => {
    const log = runSim({ profile: 'regular', maxDays: 8, seed: 'progress', rates });
    expect(log.milestones['boss:1']).toBeDefined();
    expect(log.expeditions.length).toBeGreaterThan(5);
    expect(log.crafts.some((c) => c.kind === 'upgrade')).toBe(true);
  });

  it('never leaves the save in a state the game forbids', () => {
    for (const profile of ['casual', 'heavy']) {
      runSim({ profile, maxDays: 8, seed: 'legal', rates, afterSession: checkSave });
    }
  });

  it('meets patrols and travellers while keeping the save valid', () => {
    const log = runSim({ profile: 'regular', maxDays: 3, seed: 'patrols', rates, afterSession: checkSave });
    expect(log.patrols.seen.length).toBeGreaterThan(0);
    const kinds = [...PATROL_KINDS, ...TRAVELLER_KINDS];
    for (const row of log.patrols.seen) {
      expect(kinds).toContain(row.kind);
      expect(row.tier).toBeGreaterThanOrEqual(1);
    }
    for (const fight of log.patrols.fights) {
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
    const away = startExpedition({ ...createInitialSave(), tutorial: { ...createInitialSave().tutorial, step: 'done' } }, 'ratCellar', ['bram'], 0);
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
