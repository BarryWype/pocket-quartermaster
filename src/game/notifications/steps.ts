import { chests as allChests } from '@/content/chests';
import { notificationRules, notificationTexts } from '@/content/notifications';

import { chestState } from '../rewards/chests';
import type { SaveData } from '../save';
import type { ChestDef } from '../types';
import { fill } from './plan';
import type { NotificationSettings, PlannedNotification } from './types';

/** Step alerts already sent today, e.g. 'unlocked:wooden' or 'close:iron'. */
export type StepAlertLog = { day: string; sent: string[] };

/**
 * Step alerts due now: a chest that today's steps have unlocked, or the next
 * chest within reach. Each is sent once per chest per day.
 */
export function stepAlerts(
  save: SaveData,
  steps: number,
  day: string,
  log: StepAlertLog,
  settings: NotificationSettings,
  { chests = allChests, closeToChestSteps = notificationRules.closeToChestSteps }: { chests?: ChestDef[]; closeToChestSteps?: number } = {},
): { alerts: PlannedNotification[]; log: StepAlertLog } {
  const sent = log.day === day ? log.sent : [];
  if (!settings.enabled) return { alerts: [], log: { day, sent } };
  const { categories } = settings;
  const alerts: PlannedNotification[] = [];
  const nextLocked = [...chests].sort((a, b) => a.steps - b.steps).find((c) => steps < c.steps);

  for (const chest of chests) {
    const key = `unlocked:${chest.id}`;
    if (categories.chestUnlocked && chestState(save, chest, steps, day) === 'ready' && !sent.includes(key)) {
      alerts.push({
        id: `step:${key}:${day}`,
        category: 'chestUnlocked',
        group: 'steps',
        at: null,
        title: notificationTexts.chestUnlocked.title,
        body: fill(notificationTexts.chestUnlocked.body, { chest: chest.name.toLowerCase() }),
      });
    }
  }
  if (nextLocked && categories.chestClose && nextLocked.steps - steps <= closeToChestSteps) {
    const key = `close:${nextLocked.id}`;
    if (!sent.includes(key)) {
      alerts.push({
        id: `step:${key}:${day}`,
        category: 'chestClose',
        group: 'steps',
        at: null,
        title: notificationTexts.chestClose.title,
        body: fill(notificationTexts.chestClose.body, {
          steps: (nextLocked.steps - steps).toLocaleString('en'),
          chest: nextLocked.name.toLowerCase(),
        }),
      });
    }
  }
  return { alerts, log: { day, sent: [...sent, ...alerts.map((a) => a.id.split(':').slice(1, 3).join(':'))] } };
}
