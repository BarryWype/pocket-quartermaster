import { setLocale } from '@/i18n';

import { priceLabel } from './PriceTag';

describe('priceLabel', () => {
  afterEach(() => setLocale('en'));

  it('formats the price with the i18n number format', () => {
    setLocale('en');
    expect(priceLabel(300)).toBe('🪙 300');
    expect(priceLabel(12345)).toBe('🪙 12,345');
  });

  it('falls back to a visible ? for unusable prices', () => {
    expect(priceLabel(undefined)).toBe('🪙 ?');
    expect(priceLabel(null)).toBe('🪙 ?');
    expect(priceLabel(Number.NaN)).toBe('🪙 ?');
    expect(priceLabel(-1)).toBe('🪙 ?');
  });
});
