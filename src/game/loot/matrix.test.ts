import * as fs from 'node:fs';
import * as path from 'node:path';

import { lootMatrix } from '@/content/loot/matrix';

import { parseMatrixCsv } from './matrixCsv';
import { LOOT_CATEGORIES, LOOT_SOURCES, type LootCategory } from './types';

const csv = path.resolve(__dirname, '../../../doc/design/loot/matrix.csv');

describe('the generated loot matrix', () => {
  it('matches the CSV', () => {
    expect(parseMatrixCsv(fs.readFileSync(csv, 'utf8'))).toEqual(lootMatrix);
  });

  it('has every category for every source', () => {
    for (const source of LOOT_SOURCES) {
      expect(Object.keys(lootMatrix[source].marks).length).toBe(LOOT_CATEGORIES.length);
      for (const category of LOOT_CATEGORIES) {
        expect(lootMatrix[source].marks[category as LootCategory]).toBeDefined();
      }
    }
  });
});
