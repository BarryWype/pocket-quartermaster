import type { NotificationCategory, NotificationSettings } from './types';

type QuietHours = NotificationSettings['quietHours'];

const minuteOfDay = (ms: number) => {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
};

/** Whether a moment falls in quiet hours (local time); windows may cross midnight. */
export function inQuietHours(ms: number, quiet: QuietHours) {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const minute = minuteOfDay(ms);
  return quiet.start < quiet.end
    ? minute >= quiet.start && minute < quiet.end
    : minute >= quiet.start || minute < quiet.end;
}

/** The next end of quiet hours after `ms`. */
export function quietHoursEnd(ms: number, quiet: QuietHours) {
  const end = new Date(ms);
  end.setHours(Math.floor(quiet.end / 60), quiet.end % 60, 0, 0);
  if (end.getTime() <= ms) end.setDate(end.getDate() + 1);
  return end.getTime();
}

const RESULTS: NotificationCategory[] = ['expeditionFinished', 'bigResult'];

/** When a notification meant for `ms` should actually arrive: held until quiet hours end, unless allowed through. */
export function deliveryTime(ms: number, category: NotificationCategory, settings: NotificationSettings) {
  const allowed = settings.allowResultsInQuietHours && RESULTS.includes(category);
  return !allowed && inQuietHours(ms, settings.quietHours) ? quietHoursEnd(ms, settings.quietHours) : ms;
}
