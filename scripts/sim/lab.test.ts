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
  const options = { profiles: ['casual'], seeds: 1, seed: 'smoke', maxDays: 3, overrides: [], outDir, rates, print: () => {} };

  it('runs a short casual game and writes every output', () => {
    runLab(options);
    for (const file of ['daily.csv', 'expeditions.csv', 'crafts.csv']) {
      expect(fs.statSync(path.join(outDir, file)).size).toBeGreaterThan(0);
    }
    const daily = fs.readFileSync(path.join(outDir, 'daily.csv'), 'utf8').trim().split('\n');
    expect(daily).toHaveLength(1 + 3);
  });

  it('puts overrides back afterwards', () => {
    const cost = guildTrackById.gold.baseCost;
    runLab({ ...options, overrides: ['guild.gold.baseCost=1'] });
    expect(guildTrackById.gold.baseCost).toBe(cost);
  });
});
