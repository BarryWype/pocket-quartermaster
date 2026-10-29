import type { HeroClassId } from '@/game/types';
import { setLocale } from '@/i18n';

import { signatureText } from './abilities';
import { heroClasses } from './heroes';

describe('signatureText', () => {
  afterAll(() => setLocale('en'));

  it.each(['en', 'fr'] as const)('fills every class signature from its abilities (%s)', (locale) => {
    setLocale(locale);
    for (const classId of Object.keys(heroClasses) as HeroClassId[]) {
      const text = signatureText(classId);
      expect(text).not.toMatch(/[{}]/);
      expect(text.length).toBeGreaterThan(5);
    }
  });

  it('reads the numbers from the config', () => {
    setLocale('en');
    expect(signatureText('duelist')).toContain('×2.25');
    expect(signatureText('diplomat')).toContain('+50%');
    expect(signatureText('engineer')).toContain('+3 instead of +2');
    expect(signatureText('smuggler')).toContain('5%–12%');
  });
});
