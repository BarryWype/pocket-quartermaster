import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { affixes } from '@/content/affixes';
import { materials } from '@/content/materials';

import { LEGACY_COMPONENT_PARTS, LEGACY_KEYWORD_AFFIXES } from './legacyComponents';

/**
 * Components, their keyword affixes and the Steady affix are gone: boss and
 * elite drops are trophies now. Only the save migration and its legacy tables
 * may still name them. The simulator keeps its own labels for forged
 * ingredients until its bot is reworked.
 */
const componentIds = Object.keys(LEGACY_COMPONENT_PARTS);
const keywordAffixIds = Object.keys(LEGACY_KEYWORD_AFFIXES);
const LEGACY = [
  new RegExp(`['"\`](${[...componentIds, ...keywordAffixIds].join('|')})['"\`]`),
  /\b(componentById|componentId|componentPool|componentForMob|keywordAffixWeight)\b/,
  /loot\/components/,
  /kind: 'component'/,
  /\bsteady[A-Z]\w*/,
  /kind: 'steady'/,
  /Steady vs/,
];

const ALLOWED = ['src/game/legacyComponents.ts', 'src/game/migrations.ts', 'src/game/noComponents.test.ts'];
const ALLOWED_DIRS = ['src/game/sim/'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('no components', () => {
  it('leaves no component, keyword affix or Steady affix in the content', () => {
    const materialIds = new Set(materials.map((material) => material.id));
    expect(componentIds.filter((id) => materialIds.has(id))).toEqual([]);
    const affixIds = new Set(affixes.map((affix) => affix.id));
    expect(keywordAffixIds.filter((id) => affixIds.has(id))).toEqual([]);
    expect(affixes.filter((affix) => /^steady[A-Z]/.test(affix.id))).toEqual([]);
  });

  it('leaves none of them in the source', () => {
    const root = process.cwd();
    const hits = sourceFiles(join(root, 'src'))
      .map((path) => relative(root, path))
      .filter((file) => !ALLOWED.includes(file) && !ALLOWED_DIRS.some((dir) => file.startsWith(dir)))
      .flatMap((file) =>
        readFileSync(join(root, file), 'utf8')
          .split('\n')
          .flatMap((line, i) => (LEGACY.some((pattern) => pattern.test(line)) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
      );
    expect(hits).toEqual([]);
  });
});
