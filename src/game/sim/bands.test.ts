import * as fs from 'node:fs';
import * as path from 'node:path';

import { difficultyRules } from '@/content/difficulty';

import type { Stat, Summary } from './metrics';
import { inRange, targets } from './targets';

// Balance bands on the simulator's targets (doc/design/simulator/README.md),
// read from the summary the last `npm run sim` wrote. Skipped until tuning
// brings the numbers in range; `npm run sim:check` runs the simulator and then
// these tests (SIM_CHECK=1).

const FILE = path.resolve(__dirname, '../../../doc/design/simulator/summary.json');
const check = process.env.SIM_CHECK ? describe : describe.skip;
const read = (): Summary => JSON.parse(fs.readFileSync(FILE, 'utf8')) as Summary;

/** The median, which must exist (every seed short of it fails the band). */
const median = (s: Stat) => {
  expect(s.median).not.toBeNull();
  return s.median!;
};

const expectIn = (value: number, range: [number, number]) => {
  expect(value).toBeGreaterThanOrEqual(range[0]);
  expect(value).toBeLessThanOrEqual(range[1]);
};

check('simulator balance bands', () => {
  const summary: Summary = fs.existsSync(FILE) ? read() : { settings: { profiles: [], seeds: 0, seed: '', overrides: [], maxDays: null, jobs: true }, profiles: {}, difficultyOdds: {} };
  const profiles = Object.values(summary.profiles);

  it('has a summary to read (run npm run sim)', () => expect(profiles.length).toBeGreaterThan(0));

  describe('pace', () => {
    for (const s of profiles) {
      it(`${s.profile}: every seed reaches the end of tier 5`, () => expect(s.finished).toBe(s.seeds));
      for (const tier of s.tiers) {
        it(`${s.profile}: tier ${tier.tier} takes ${targets.daysPerTier[s.profile].join('–')} days`, () => expectIn(median(tier.days), targets.daysPerTier[s.profile]));
      }
    }
  });

  describe('win odds', () => {
    for (const s of profiles) {
      for (const tier of s.tiers) {
        const { odds } = tier;
        // A summary from before the per-difficulty targets has no lines to check.
        if (!odds.difficulty) continue;
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
          const line = odds.difficulty[difficulty];
          const start = line.target.start;
          if (start) it(`${s.profile}: tier ${tier.tier} ${difficulty} expeditions at the start`, () => expectIn(median(line.start), start));
          it(`${s.profile}: tier ${tier.tier} ${difficulty} expeditions at the end`, () => expectIn(median(line.end), line.target.end));
        }
        for (const [difficulty, min] of Object.entries(targets.odds.threatGap)) {
          it(`${s.profile}: tier ${tier.tier} ${difficulty} threat gap of at least ${min * 100} points`, () =>
            expect(median(odds.gap[difficulty as keyof typeof targets.odds.threatGap])).toBeGreaterThanOrEqual(min));
        }
        it(`${s.profile}: tier ${tier.tier} boss at its first attempts`, () => expectIn(median(odds.boss.first), targets.odds.boss));
        it(`${s.profile}: tier ${tier.tier} fight events and patrols, prepared`, () => expectIn(median(odds.events.probe), targets.odds.events));
      }
    }
  });

  describe('difficulty odds (reference roster)', () => {
    for (const [tier, odds] of Object.entries(summary.difficultyOdds ?? {})) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const start = difficultyRules.oddsTargets[difficulty].start;
        if (start) it(`tier ${tier} ${difficulty} sources at the tier's start`, () => expectIn(odds[difficulty].start, start));
        it(`tier ${tier} ${difficulty} sources at the tier's end`, () => expectIn(odds[difficulty].end, difficultyRules.oddsTargets[difficulty].end));
      }
    }
  });

  describe('loot pacing (regular)', () => {
    for (const row of summary.profiles.regular?.loot ?? []) {
      it(`${row.column} within ${targets.lootPacing * 100}% of pacing.py`, () => expect(Math.abs(row.off)).toBeLessThanOrEqual(targets.lootPacing));
    }
  });

  describe('gear', () => {
    const { piecesPerWeek, daysPerRare, legendariesPerTier } = targets.gear;
    const total = summary.profiles.regular?.gearSources?.find((r) => r.source === 'total');
    if (total) {
      it(`regular: about ${piecesPerWeek} looted gear pieces a week`, () =>
        expectIn(median(total.gear), [piecesPerWeek * (1 - targets.lootPacing), piecesPerWeek * (1 + targets.lootPacing)]));
    }
    for (const s of profiles) {
      for (const tier of s.tiers) {
        if (daysPerRare[s.profile]) it(`${s.profile}: tier ${tier.tier} a Rare every ${daysPerRare[s.profile].join('–')} days`, () => expectIn(median(tier.gear.daysPerRare), daysPerRare[s.profile]));
        if (s.profile === 'regular') it(`regular: tier ${tier.tier} about one Legendary`, () => expectIn(median(tier.gear.rarity.legendary), legendariesPerTier));
      }
    }
  });

  describe('jobs', () => {
    for (const tier of summary.profiles.regular?.tiers ?? []) {
      const share = tier.wood?.share;
      // A summary from before jobs were covered has no wood data to check.
      if (!share || share.median === null) continue;
      const value = share.median;
      it(`regular: tier ${tier.tier} woodcutter gives ${targets.woodcutterShare.join('–')} of the wood spent`, () =>
        expectIn(value, targets.woodcutterShare));
    }
    for (const tier of summary.profiles.regular?.tiers ?? []) {
      // A summary from before jobs were covered has no per-job data to check.
      if (!tier.jobs) continue;
      for (const [material, line] of Object.entries(tier.jobs)) {
        if (line.share.median === null) continue;
        it(`regular: tier ${tier.tier} jobs give at most ${Math.round(targets.jobShareMax * 100)}% of the ${material} walked`, () =>
          expect(line.share.median).toBeLessThanOrEqual(targets.jobShareMax));
      }
    }
    for (const tier of summary.profiles.regular?.tiers ?? []) {
      // A summary from before work tools were covered has no per-tool data to check.
      if (!tier.tools) continue;
      for (const [material, line] of Object.entries(tier.tools)) {
        if (line.share.median === null) continue;
        it(`regular: tier ${tier.tier} work tools give at most ${Math.round(targets.jobShareMax * 100)}% of the ${material} walked`, () =>
          expect(line.share.median).toBeLessThanOrEqual(targets.jobShareMax));
      }
    }
    for (const tier of summary.profiles.regular?.tiers ?? []) {
      // A summary from before the gatherer was covered has no gatherer data to check.
      if (!tier.gatherer) continue;
      for (const [material, line] of Object.entries(tier.gatherer.materials)) {
        if (line.share.median === null) continue;
        it(`regular: tier ${tier.tier} gatherer gives at most ${Math.round(targets.gathererShareMax * 100)}% of the ${material} walked`, () =>
          expect(line.share.median).toBeLessThanOrEqual(targets.gathererShareMax));
      }
    }
  });

  describe('rotation', () => {
    for (const s of profiles) {
      // A summary from before rotation was covered has no rotation data to check.
      if (!s.rotation) continue;
      if (s.profile === 'regular')
        it(`regular: no class above ${Math.round(targets.rotation.topClassShare * 100)}% of party slots once the roster has ${targets.rotation.roster} heroes`, () =>
          expect(median(s.rotation!.topClassShare)).toBeLessThanOrEqual(targets.rotation.topClassShare));
      it(`${s.profile}: at least ${targets.rotation.heroesPerWeek} distinct heroes fielded a week from tier ${targets.rotation.fromTier}`, () =>
        expect(median(s.rotation!.fewestHeroesPerWeek)).toBeGreaterThanOrEqual(targets.rotation.heroesPerWeek));
    }
  });

  describe('gold, materials and levels', () => {
    for (const s of profiles) {
      for (const tier of s.tiers) {
        it(`${s.profile}: tier ${tier.tier} gold doesn't pile up`, () => expect(tier.gold.surplus).toBe(false));
        it(`${s.profile}: tier ${tier.tier} spends its main material`, () => expect(median(tier.material.share)).toBeGreaterThanOrEqual(targets.materialSpent));
        it(`${s.profile}: tier ${tier.tier} ends near the top of its level band`, () =>
          expect(inRange(median(tier.level.end), [tier.level.target - targets.levelSlack, tier.level.target + targets.levelSlack])).toBe(true));
      }
    }
  });
});
