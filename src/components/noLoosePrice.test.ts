import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

/**
 * Prices kept vanishing (issues 5 and 21): each screen drew its own "🪙 25" in
 * one Text, which the game font (no emoji glyphs) measures wrong, clipping the
 * number. Every coin beside an amount now goes through `Price`
 * (`src/components/Price.tsx`), and these guards keep it that way.
 */

const COIN = '🪙';
/** The explicit opt-out, with its reason: `// coin-ok: the coin alone, no amount`. */
const OPT_OUT = /coin-ok:/;
/** The coin's only home: the component and its label helpers. */
const HOME = join(__dirname, 'Price.tsx');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, v]) => strings(v, path ? `${path}.${key}` : key));
  return [];
}

describe('prices', () => {
  it('draw the coin only through Price in screens and components', () => {
    const src = join(__dirname, '..');
    const loose = [join(src, 'app'), join(src, 'components')]
      .flatMap(sourceFiles)
      .filter((file) => file !== HOME)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => (line.includes(COIN) && !OPT_OUT.test(line) ? [`${file.slice(src.length + 1)}:${i + 1}: ${line.trim()}`] : [])),
      );
    expect(loose).toEqual([]);
  });

  it('never put the coin beside an amount in a translation', () => {
    const loose = [...strings(en), ...strings(fr)].filter(([, text]) => new RegExp(`${COIN}\\s*[{\\d+×]`).test(text)).map(([key]) => key);
    expect(loose).toEqual([]);
  });
});
