import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Valuables and the market's collector are gone: their worth is gold now. Only
 * the save migration and its legacy tables may still name them, plus the one
 * i18n line of the sale toast (key and text on one line).
 */
const PATTERN = /valuable|collector/i;
const ALLOWED = ['src/game/legacyValuables.ts', 'src/game/migrations.ts', 'src/game/noValuables.test.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no valuables', () => {
  it('leaves none of them in the source or the scripts', () => {
    const root = process.cwd();
    const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'scripts'))]
      .map((path) => relative(root, path))
      .filter((file) => !ALLOWED.includes(file) && !/\.test\.tsx?$/.test(file));
    const hits = files.flatMap((file) =>
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          PATTERN.test(line) && !line.includes('treasuresSold') ? [`${file}:${i + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
