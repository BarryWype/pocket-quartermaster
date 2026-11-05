import { affixes } from '@/content/affixes';
import { setLocale, type Locale } from '@/i18n';

import { affixLine, affixName, affixRangeLine } from './affixText';

describe('affixText', () => {
  for (const locale of ['en', 'fr'] as Locale[]) {
    describe(locale, () => {
      beforeAll(() => setLocale(locale));

      it('names and lines every affix, with every placeholder filled', () => {
        for (const affix of affixes) {
          expect(affixName(affix.id).trim()).not.toBe('');
          const line = affixLine({ id: affix.id, value: affix.range ? affix.range.max : 0 });
          expect(line.trim()).not.toBe('');
          expect(line).not.toContain('{');
          expect(line).not.toContain('}');
        }
      });

      it('shows every ranged affix with its whole range', () => {
        for (const affix of affixes.filter((one) => one.range)) {
          const line = affixRangeLine(affix.id, affix.range!.min, affix.range!.max);
          expect(line).toContain(`${affix.range!.min}`);
          expect(line).toContain(`${affix.range!.max}`);
          expect(line).not.toContain('{');
        }
      });
    });
  }
});
