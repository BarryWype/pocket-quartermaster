import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Charm consumables are gone: what a run finds is raised by loot trinkets
 * instead. Only the save migration and its legacy tables may still name them,
 * plus the three trinkets whose kind id kept the word (quill, scarab, prism)
 * and the icon files.
 */
const PATTERN = /charm/i;
const TOKENS = [
  /quillCharm/g,
  /scarabCharm/g,
  /prismCharm/g,
  /Quill charm/g,
  /Scarab charm/g,
  /Prism charm/g,
  /Charme plume/g,
  /Charme scarabée/g,
  /Charme prisme/g,
  /[\w./-]+\.png/g,
];
const ALLOWED = ['src/game/legacyCharms.ts', 'src/game/migrations.ts', 'src/game/noCharms.test.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('no charms', () => {
  it('leaves none of them in the source or the scripts', () => {
    const root = process.cwd();
    const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'scripts'))]
      .map((path) => relative(root, path))
      .filter((file) => !ALLOWED.includes(file) && !/\.test\.tsx?$/.test(file));
    const hits = files.flatMap((file) =>
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .flatMap((line, i) => {
          const stripped = TOKENS.reduce((text, token) => text.replace(token, ''), line);
          return PATTERN.test(stripped) ? [`${file}:${i + 1}: ${line.trim()}`] : [];
        }),
    );
    expect(hits).toEqual([]);
  });
});
