import * as fs from 'node:fs';
import * as path from 'node:path';

import { lootConfig } from '@/content/loot/config';

import { parseMatrixCsv } from '../loot/matrixCsv';
import { lootPacing, pacingLines } from './pacing';

const csv = parseMatrixCsv(fs.readFileSync(path.resolve(__dirname, '../../../doc/design/loot/matrix.csv'), 'utf8'));

describe('loot pacing', () => {
  it('gives pacing.py’s weekly numbers for categories the treasure spot leaves alone', () => {
    for (const row of lootPacing().filter((r) => csv.treasureSpot.marks[r.category] === '—')) {
      const extra = row.category === 'relics' ? csv.ruinsDig.visitsPerDay / 5 : 0;
      const perDay = Object.values(csv).reduce((sum, source) => sum + lootConfig.markChances[source.marks[row.category]] * source.visitsPerDay, extra);
      expect(row.perWeek).toBeCloseTo(perDay * 7, 6);
    }
  });

  it('prints one line per category in pacing.py’s format', () => {
    const lines = pacingLines();
    expect(lines).toHaveLength(15);
    expect(lines[0]).toMatch(/^Gold {12}\s*\d+\.\d per week {3}mostly: /);
  });
});
