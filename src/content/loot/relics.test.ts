import * as fs from 'node:fs';
import * as path from 'node:path';

import { relics } from '@/content/loot/relics';

const srcPath = path.resolve(__dirname, 'relics.ts');
const csvPath = path.resolve(__dirname, '../../../doc/design/loot/relics.csv');
const iconsRoot = path.resolve(__dirname, '../../../assets/icons');

/**
 * The icon file each relic's content entry requires, taken from the require
 * path in relics.ts itself — the one source of truth for the file names.
 */
function relicIconFiles(): Map<string, string> {
  const source = fs.readFileSync(srcPath, 'utf8');
  const files = new Map<string, string>();
  const call = /relic\('([^']+)'[\s\S]*?require\('([^']+\.png)'\)/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) files.set(match[1], match[2].replace(/^.*assets\/icons\//, ''));
  return files;
}

/** The CSV as rows of fields, without the header. */
function csvRows(): string[][] {
  return fs
    .readFileSync(csvPath, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','));
}

describe('relic icons', () => {
  it('gives every relic an icon', () => {
    const files = relicIconFiles();
    expect(relics).toHaveLength(25);
    for (const relic of relics) {
      expect(relic.icon).toBeTruthy();
      expect(files.get(relic.id)).toBeDefined();
    }
  });

  it('gives no two relics the same icon file', () => {
    const files = [...relicIconFiles().values()];
    expect(new Set(files).size).toBe(relics.length);
  });

  it('lists an existing icon file per relic in relics.csv, matching the content entry', () => {
    const files = relicIconFiles();
    const rows = csvRows();
    expect(rows).toHaveLength(relics.length);
    const byName = new Map(relics.map((relic) => [relic.name, relic]));
    for (const row of rows) {
      const relic = byName.get(row[0].replace(/'/g, '’'));
      expect(relic).toBeDefined();
      const listed = row[4];
      expect(listed).toBe(files.get(relic!.id));
      expect(fs.existsSync(path.join(iconsRoot, listed))).toBe(true);
    }
  });

  it('lists each relic an extra family, empty unless the content entry has one', () => {
    const rows = csvRows();
    const byName = new Map(relics.map((relic) => [relic.name, relic]));
    for (const row of rows) {
      const relic = byName.get(row[0].replace(/'/g, '’'));
      expect(relic).toBeDefined();
      expect(relic!.extraFamily ?? '').toBe(row[5] ?? '');
    }
  });
});
