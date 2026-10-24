import { spawnConfig } from '@/content/spawnConfig';

import { solarHour, timeOfDayAt, windowIndex, windowRange } from './time';

const HOUR = 3_600_000;

describe('windows', () => {
  it('maps times inside the same window to the same index', () => {
    expect(windowIndex(0, 60)).toBe(0);
    expect(windowIndex(HOUR - 1, 60)).toBe(0);
    expect(windowIndex(HOUR, 60)).toBe(1);
    expect(windowIndex(5 * HOUR, 180)).toBe(1);
  });

  it('returns the start and end of a window', () => {
    expect(windowRange(2, 60)).toEqual({ start: 2 * HOUR, end: 3 * HOUR });
  });
});

describe('time of day', () => {
  it('derives solar hour from UTC time and longitude', () => {
    expect(solarHour(12 * HOUR, 0)).toBe(12);
    expect(solarHour(12 * HOUR, 90)).toBe(18);
    expect(solarHour(2 * HOUR, -90)).toBe(20);
  });

  it.each([
    [6, 'dawn'],
    [12, 'day'],
    [18, 'dusk'],
    [22, 'night'],
    [3, 'night'],
  ] as const)('solar hour %i is %s', (hour, expected) => {
    expect(timeOfDayAt(hour * HOUR, 0, spawnConfig.timeOfDay)).toBe(expected);
  });
});
