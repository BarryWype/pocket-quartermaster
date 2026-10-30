import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { guildTrackById } from '@/content/guild';
import { simConfig } from '@/game/sim/config';
import { measureWalkRates } from '@/game/sim/walking';

import { runLab } from './lab';

const rates = measureWalkRates({ ...simConfig, walk: { ...simConfig.walk, samples: simConfig.walk.samples.slice(0, 1), sampleHours: [12], sampleMinutes: 5 } });

describe('balance lab CLI', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-'));
  const options = { profiles: ['casual'], seeds: 1, seed: 'smoke', maxDays: 3, overrides: [], outDir, reportDir: outDir, rates, print: () => {} };

  it('runs a short casual game and writes every output', async () => {
    await runLab(options);
    for (const file of ['daily.csv', 'expeditions.csv', 'crafts.csv', 'report.md', 'summary.json']) {
      expect(fs.statSync(path.join(outDir, file)).size).toBeGreaterThan(0);
    }
    const daily = fs.readFileSync(path.join(outDir, 'daily.csv'), 'utf8').trim().split('\n');
    expect(daily).toHaveLength(1 + 3);
  });

  it('writes every section of the report, targets next to results', () => {
    const report = fs.readFileSync(path.join(outDir, 'report.md'), 'utf8');
    for (const heading of [
      '## Furthest from target',
      '## Pace: days per tier',
      '## Win odds per tier',
      '## Events and patrols by kind',
      '## Visits planned vs done',
      '## Gold per tier',
      '## Materials: the tier’s main material',
      '## Hero levels at the end of each tier',
      '## Health',
      '**Pile-ups**',
      '**Dead content**',
      '**Classes**',
      'Classes never offered',
      'Classes offered but never recruited',
      'Classes recruited but never fielded',
      '**Milestones**',
      '## Bot rules',
    ]) {
      expect(report).toContain(heading);
    }
    expect(report).toContain('12–16');
  });

  it('adds the loot pacing section for the regular profile', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-'));
    await runLab({ ...options, profiles: ['regular'], maxDays: 2, outDir: dir, reportDir: dir });
    expect(fs.readFileSync(path.join(dir, 'report.md'), 'utf8')).toContain('## Loot pacing (regular)');
  });

  it('puts overrides back afterwards', async () => {
    const cost = guildTrackById.gold.baseCost;
    await runLab({ ...options, overrides: ['guild.gold.baseCost=1'] });
    expect(guildTrackById.gold.baseCost).toBe(cost);
  });
});
