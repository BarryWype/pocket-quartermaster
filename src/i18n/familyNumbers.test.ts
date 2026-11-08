import { families } from '@/content/families';
import { frNames } from '@/content/fr/names';
import { tagsForLevel } from '@/game/families/strip';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { setLocale, t } from '@/i18n';

// Players count tags: a family's number is always its tag count, and its levels show as dots.

function strings(node: unknown, path: string, out: [string, string][]) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) strings(value, `${path}.${key}`, out);
}

const all = (dictionary: object) => {
  const out: [string, string][] = [];
  strings(dictionary, '', out);
  return out;
};

const familyNames = families.flatMap((family) => [family.name, frNames[family.name] ?? family.name]);

describe.each([
  ['en', en],
  ['fr', fr],
])('%s family numbers', (_, dictionary) => {
  test('no family string takes a level number', () => {
    const levelled = all(dictionary.families).filter(([, text]) => /\{(level|needed)\}/.test(text));
    expect(levelled).toEqual([]);
  });

  test('no string puts a family name before a number or a level ("Faith 2", "Faith level 2", "{family} {count}")', () => {
    const name = familyNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const pattern = new RegExp(`\\b(${name}) (\\d|level|niveau)|\\{family\\} (\\{|level|de niveau)`);
    expect(all(dictionary).filter(([, text]) => pattern.test(text))).toEqual([]);
  });
});

test('a need, the tags to reach and the next level are written in tags', () => {
  setLocale('en');
  expect(t('families.needs', { count: 2, family: 'Wild' })).toBe('needs 2 Wild');
  expect(t('families.toReach', { count: 2 })).toBe('+2 to reach');
  expect(t('families.next', { count: 2, marks: '●●●' })).toBe('+2 for ●●●');
  expect(t('families.level', { count: tagsForLevel(1), marks: '●○○' })).toBe('●○○ 2 tags');
});
