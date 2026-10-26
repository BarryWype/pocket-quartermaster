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
  const options = { profiles: ['casual'], days: 3, runs: 1, seed: 'smoke', overrides: [], outDir, matrix: false, rates, print: () => {} };

  it('runs a short casual game and writes every output', () => {
    runLab(options);
    for (const file of ['report.html', 'summary.json', 'daily.csv', 'expeditions.csv', 'crafts.csv']) {
      expect(fs.statSync(path.join(outDir, file)).size).toBeGreaterThan(0);
    }
    const daily = fs.readFileSync(path.join(outDir, 'daily.csv'), 'utf8').trim().split('\n');
    expect(daily).toHaveLength(1 + 3);
  });

  it('compares with a previous summary and puts overrides back afterwards', () => {
    const before = path.join(outDir, 'before.json');
    fs.copyFileSync(path.join(outDir, 'summary.json'), before);
    const cost = guildTrackById.gold.baseCost;
    const { comparison, summary } = runLab({ ...options, overrides: ['dungeons.ratCellar.gold.1=200'], compareWith: before });
    expect(summary.settings.overrides).toEqual(['dungeons.ratCellar.gold.1=200']);
    expect(comparison).not.toBeNull();
    expect(guildTrackById.gold.baseCost).toBe(cost);
    expect(fs.readFileSync(path.join(outDir, 'report.html'), 'utf8')).toContain('Changes since');
  });
});
