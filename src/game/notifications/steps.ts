import { notificationRules } from '@/content/notifications';
import { formatNumber, t } from '@/i18n';

import { chestState, stepChests, type StepChest } from '../rewards/chests';
import type { SaveData } from '../save';
import { fill, notificationTexts } from './plan';
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
  { chests = stepChests, closeToChestSteps = notificationRules.closeToChestSteps }: { chests?: StepChest[]; closeToChestSteps?: number } = {},
): { alerts: PlannedNotification[]; log: StepAlertLog } {
  const sent = log.day === day ? log.sent : [];
  if (!settings.enabled) return { alerts: [], log: { day, sent } };
  const { categories } = settings;
  const alerts: PlannedNotification[] = [];
  const texts = notificationTexts();
  const nextLocked = [...chests].sort((a, b) => a.steps - b.steps).find((c) => steps < c.steps);

  for (const chest of chests) {
    const key = `unlocked:${chest.id}`;
    if (categories.chestUnlocked && chestState(save, chest, steps, day) === 'ready' && !sent.includes(key)) {
      alerts.push({
        id: `step:${key}:${day}`,
        category: 'chestUnlocked',
        group: 'steps',
        at: null,
        title: texts.chestUnlocked.title,
        body: fill(texts.chestUnlocked.body, { chest: t('chests.name', { steps: formatNumber(chest.steps) }) }),
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
        title: texts.chestClose.title,
        body: fill(texts.chestClose.body, {
          steps: formatNumber(nextLocked.steps - steps),
          chest: t('chests.name', { steps: formatNumber(nextLocked.steps) }),
        }),
      });
    }
  }
  return { alerts, log: { day, sent: [...sent, ...alerts.map((a) => a.id.split(':').slice(1, 3).join(':'))] } };
}
