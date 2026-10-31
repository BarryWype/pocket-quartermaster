import { ambienceConfig, decorationMode, inSpan, rainingAt, showsDecoration, tintAt } from './ambience';

describe('ambience', () => {
  it('washes the map blue at night, warm at dusk, and not at all at noon', () => {
    expect(tintAt(12).opacity).toBe(0);
    expect(tintAt(2)).toEqual({ color: 'rgb(19, 32, 74)', opacity: expect.closeTo(0.33, 2) });
    expect(tintAt(19).color).toBe('rgb(255, 138, 61)');
    expect(tintAt(23.99).opacity).toBeCloseTo(0.35, 2);
  });

  it('handles hour spans that wrap past midnight', () => {
    expect(inSpan(23, [20, 5])).toBe(true);
    expect(inSpan(3, [20, 5])).toBe(true);
    expect(inSpan(12, [20, 5])).toBe(false);
    expect(inSpan(12, [9, 18])).toBe(true);
  });

  it('rains in short showers, about as often as configured', () => {
    const { windowMinutes, chance, minutes } = ambienceConfig.rain;
    const days = 200;
    const start = Date.UTC(2026, 0, 1);
    let rainyMinutes = 0;
    for (let minute = 0; minute < days * 24 * 60; minute++) if (rainingAt(start + minute * 60_000)) rainyMinutes++;
    const expected = ((days * 24 * 60) / windowMinutes) * chance * minutes;
    expect(rainyMinutes).toBeGreaterThan(expected * 0.7);
    expect(rainyMinutes).toBeLessThan(expected * 1.3);
    expect(rainingAt(start + 1234567)).toBe(rainingAt(start + 1234567));
  });

  it('shows the decoration only from the default zoom up', () => {
    expect(showsDecoration(17)).toBe(true);
    expect(showsDecoration(16.99)).toBe(false);
    expect(showsDecoration(15.99)).toBe(false);
  });

  it('hides the decorations below 17, holds them still from 17 to 18, animates them from 18', () => {
    expect(decorationMode(16.99)).toBe('hidden');
    expect(decorationMode(17)).toBe('still');
    expect(decorationMode(17.99)).toBe('still');
    expect(decorationMode(18)).toBe('animated');
    expect(decorationMode(19)).toBe('animated');
  });

  it('respects custom decoration and animation thresholds', () => {
    const config = { ...ambienceConfig, decorationMinZoom: 15, animationMinZoom: 16 };
    expect(showsDecoration(15, config)).toBe(true);
    expect(showsDecoration(14.99, config)).toBe(false);
    expect(decorationMode(15, config)).toBe('still');
    expect(decorationMode(16, config)).toBe('animated');
  });
});
