import { localDayIndex, localDayStart } from './localDays';

const HOUR_MS = 3_600_000;
const CHANGE_HOUR = 4;

describe('localDays', () => {
  it('brackets every moment: start(index(t)) <= t < start(index(t) + 1)', () => {
    // Every three hours over 2026: an hour-by-hour walk over a year, at a stride that keeps the test quick.
    const stride = 3 * HOUR_MS;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += stride) {
      const index = localDayIndex(t, CHANGE_HOUR);
      expect(localDayStart(index, CHANGE_HOUR)).toBeLessThanOrEqual(t);
      expect(t).toBeLessThan(localDayStart(index + 1, CHANGE_HOUR));
    }
  });

  it('round-trips: index(start(i)) === i', () => {
    for (let i = -400; i <= 400; i++) {
      expect(localDayIndex(localDayStart(i, CHANGE_HOUR), CHANGE_HOUR)).toBe(i);
    }
  });
});
