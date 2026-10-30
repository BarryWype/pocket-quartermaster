import * as fs from 'node:fs';
import * as path from 'node:path';

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
  const summary: Pick<Summary, 'profiles'> = fs.existsSync(FILE) ? read() : { profiles: {} };
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
        it(`${s.profile}: tier ${tier.tier} normal expeditions, prepared`, () => expectIn(median(odds.prepared.probe), targets.odds.prepared));
        it(`${s.profile}: tier ${tier.tier} normal expeditions, not prepared`, () => expectIn(median(odds.unprepared.probe), targets.odds.unprepared));
        it(`${s.profile}: tier ${tier.tier} boss, prepared`, () => expectIn(median(odds.boss.probe), targets.odds.boss));
        it(`${s.profile}: tier ${tier.tier} fight events and patrols, prepared`, () => expectIn(median(odds.events.probe), targets.odds.events));
      }
    }
  });

  describe('loot pacing (regular)', () => {
    for (const row of summary.profiles.regular?.loot ?? []) {
      it(`${row.column} within ${targets.lootPacing * 100}% of pacing.py`, () => expect(Math.abs(row.off)).toBeLessThanOrEqual(targets.lootPacing));
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
