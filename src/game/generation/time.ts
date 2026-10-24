import type { TimeOfDay } from './types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function windowIndex(timeMs: number, windowMinutes: number): number {
  return Math.floor(timeMs / (windowMinutes * MINUTE_MS));
}

export function windowRange(index: number, windowMinutes: number): { start: number; end: number } {
  const length = windowMinutes * MINUTE_MS;
  return { start: index * length, end: (index + 1) * length };
}

/**
 * Local solar hour (0-24) derived from UTC time and longitude, so every device
 * at the same place agrees on it regardless of its timezone setting.
 */
export function solarHour(timeMs: number, longitude: number): number {
  const utcHours = (timeMs % (24 * HOUR_MS)) / HOUR_MS;
  return (((utcHours + longitude / 15) % 24) + 24) % 24;
}

export function timeOfDayAt(
  timeMs: number,
  longitude: number,
  periodStarts: Record<TimeOfDay, number>,
): TimeOfDay {
  const hour = solarHour(timeMs, longitude);
  const periods = (Object.keys(periodStarts) as TimeOfDay[]).sort(
    (a, b) => periodStarts[a] - periodStarts[b],
  );
  const current = periods.filter((period) => periodStarts[period] <= hour).pop();
  return current ?? periods[periods.length - 1];
}
