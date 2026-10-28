import { ambienceConfig, inSpan, rainingAt, tintAt } from './ambience';

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
});
