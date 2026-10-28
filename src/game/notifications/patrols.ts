import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { formatDistance, localized } from '@/i18n';

import type { BackgroundAlert } from '../patrols/escort';
import { isTravellerKind, patrolPositionAt } from '../patrols/generate';
import { fill, notificationTexts } from './plan';
import { deliveryTime } from './quietHours';
import type { NotificationSettings, PlannedNotification } from './types';

/**
 * Patrol and escort alerts as notifications to send now: a patrol held for
 * quiet hours would be long gone by the time it arrived, so it is dropped
 * instead; escort alerts are held until quiet hours end.
 */
export function patrolNotifications(
  alerts: BackgroundAlert[],
  escortName: string | null,
  settings: NotificationSettings,
  now: number,
): PlannedNotification[] {
  if (!settings.enabled) return [];
  const texts = notificationTexts();
  const kinds = localized({ en: patrolTexts, fr: frPatrolTexts });
  const planned: PlannedNotification[] = [];

  for (const [index, alert] of alerts.entries()) {
    if (alert.kind === 'patrolSpotted') {
      if (!settings.categories.patrolSpotted) continue;
      if (deliveryTime(now, 'patrolSpotted', settings) > now) continue;
      const { spawn } = alert;
      const position = patrolPositionAt(spawn, now);
      const text = isTravellerKind(spawn.kind)
        ? {
            title: fill(texts.travellerSpotted.title, { traveller: kinds.travellers[spawn.kind].name }),
            body: fill(texts.travellerSpotted.body, { line: kinds.travellers[spawn.kind].line }),
          }
        : {
            title: fill(texts.patrolSpotted.title, { patrol: kinds.kinds[spawn.kind] }),
            body: fill(texts.patrolSpotted.body, {
              patrol: kinds.kinds[spawn.kind],
              distance: formatDistance(Math.round(alert.distance / 10) * 10),
              tier: alert.tier,
            }),
          };
      planned.push({
        id: `patrol:${spawn.id}`,
        category: 'patrolSpotted',
        group: 'patrols',
        at: null,
        ...text,
        data: { route: 'map', patrolId: spawn.id, latitude: position.latitude, longitude: position.longitude },
      });
      continue;
    }
    if (!settings.categories.escort) continue;
    const at = deliveryTime(now, 'escort', settings);
    planned.push({
      id: `escort:${alert.kind}:${now}:${index}`,
      category: 'escort',
      group: 'patrols',
      at: at > now ? at : null,
      title: alert.kind === 'escortPaused' ? texts.escortPaused.title : texts.escortKnockedOut.title,
      body:
        alert.kind === 'escortPaused'
          ? fill(texts.escortPaused.body, { hero: escortName ?? '', percent: Math.round(alert.hpShare * 100) })
          : fill(texts.escortKnockedOut.body, { hero: escortName ?? '' }),
      data: { route: 'pocketMode' },
    });
  }
  return planned;
}
