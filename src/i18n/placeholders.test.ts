import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

const ph = (s: string): string[] => [...s.matchAll(/\{(?:(\w+):)?(\w+)\}/g)].map((m) => m[2]).sort();

function walk(a: unknown, b: unknown, path: string, out: string[]) {
  if (typeof a === 'string') {
    const pa = ph(a);
    const pb = typeof b === 'string' ? ph(b) : ['<missing string>'];
    if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push(`${path}: en [${pa}] fr [${pb}]`);
  } else if (a && typeof a === 'object') {
    for (const k of Object.keys(a as object)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)?.[k], `${path}.${k}`, out);
  }
}

test('en and fr placeholders match', () => {
  const out: string[] = [];
  walk(en, fr, 'en', out);
  if (out.length) console.log(out.join('\n'));
  expect(out).toEqual([]);
});
