/**
 * Local calendar days counted from 1 January 2026, where a day starts at a
 * fixed local hour (like `localDayKey` in gathering/gathering.ts, this follows
 * the phone's clock, so the count is shared within a time zone and moves with
 * daylight saving).
 */

/** Whole local days since 1 January 2026, where a day starts at `hour` local time. */
export function localDayIndex(timeMs: number, hour: number): number {
  const d = new Date(timeMs);
  const idx = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86_400_000);
  return d.getHours() < hour ? idx - 1 : idx;
}

/** The moment local day `index` starts: `hour` local time on its own date. */
export function localDayStart(index: number, hour: number): number {
  return new Date(2026, 0, 1 + index, hour).getTime();
}
