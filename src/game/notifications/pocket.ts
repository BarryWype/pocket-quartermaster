import { placeInfo } from '@/content/places';
import { pocketRules } from '@/content/pocketMode';
import { formatDistance, formatNumber, t, tr } from '@/i18n';

import type { BackgroundAlert } from '../patrols/escort';
import type { NearbyAlert } from '../patrols/pocketNearby';
import type { PocketCountAlert } from '../patrols/pocketCounts';
import { fill, notificationTexts } from './plan';
import { deliveryTime } from './quietHours';
import type { NotificationCategory, NotificationSettings, PlannedNotification } from './types';

const MINUTE = 60_000;

export type PocketAlert = PocketCountAlert | NearbyAlert | Extract<BackgroundAlert, { kind: 'questTarget' }>;

type PocketCategory = Extract<NotificationCategory, 'questReady' | 'questTarget' | 'chestUnlocked' | 'nearbyPlaces' | 'secretPlace'>;

/** When each kind was last sent, and what waits for its next turn. */
export type PocketNotifyLog = { sentAt: Partial<Record<PocketCategory, number>>; held: PocketAlert[] };

export const emptyPocketLog = (): PocketNotifyLog => ({ sentAt: {}, held: [] });

const CATEGORY: Record<PocketAlert['kind'], PocketCategory> = {
  questReady: 'questReady',
  questTarget: 'questTarget',
  chestReady: 'chestUnlocked',
  nearbyPlace: 'nearbyPlaces',
  secretPlace: 'secretPlace',
};

/** Places pass by: an alert that can't go now is dropped. Quests and chests wait, so none is lost. */
const PASSING: PocketCategory[] = ['nearbyPlaces', 'secretPlace'];

const ORDER: PocketCategory[] = ['questReady', 'questTarget', 'chestUnlocked', 'nearbyPlaces', 'secretPlace'];

const roundedDistance = (meters: number) => formatDistance(Math.round(meters / 10) * 10);

/** One notification for every alert of a kind that goes out together. */
function grouped(category: PocketCategory, alerts: PocketAlert[], at: number | null): PlannedNotification {
  const texts = notificationTexts();
  const base = { category, at };
  switch (category) {
    case 'questReady': {
      const quests = alerts.filter((a) => a.kind === 'questReady');
      const text =
        quests.length === 1
          ? { title: texts.questReady.title, body: fill(texts.questReady.body, { objective: texts.questObjective[quests[0].objective] }) }
          : { title: fill(texts.questsReady.title, { count: quests.length }), body: texts.questsReady.body };
      return { ...base, id: `questReady:${quests.map((a) => a.questId).join('+')}`, group: 'steps', ...text, data: { route: 'quests' } };
    }
    case 'questTarget': {
      const targets = alerts.filter((a) => a.kind === 'questTarget');
      const [first] = targets;
      const text =
        targets.length > 1
          ? { title: fill(texts.questTargets.title, { count: targets.length }), body: texts.questTargets.body }
          : first.target.kind === 'mark'
            ? texts.questMark
            : { title: fill(texts.questTarget.title, { place: tr(placeInfo[first.target.kind].name) }), body: texts.questTarget.body };
      return { ...base, id: `quest:${targets.map((a) => a.questId).join('+')}`, group: 'steps', ...text, data: { route: 'quests' } };
    }
    case 'chestUnlocked': {
      const chests = alerts.filter((a) => a.kind === 'chestReady');
      const names = chests.map((a) => t('chests.name', { steps: formatNumber(a.steps) }));
      const text =
        chests.length === 1
          ? { title: texts.chestUnlocked.title, body: fill(texts.chestUnlocked.body, { chest: names[0] }) }
          : { title: texts.chestsUnlocked.title, body: fill(texts.chestsUnlocked.body, { chests: names.join(', ') }) };
      return { ...base, id: `chest:${chests.map((a) => a.chestId).join('+')}`, group: 'steps', ...text, data: { route: 'chests' } };
    }
    case 'nearbyPlaces': {
      const places = alerts.filter((a) => a.kind === 'nearbyPlace').sort((a, b) => a.distance - b.distance);
      const name = (a: (typeof places)[number]) => (a.place === 'treasure' ? texts.treasureSpot : tr(placeInfo[a.place].name));
      const [nearest] = places;
      const text =
        places.length === 1
          ? { title: fill(texts.nearbyPlace.title, { place: name(nearest) }), body: fill(texts.nearbyPlace.body, { distance: roundedDistance(nearest.distance) }) }
          : {
              title: texts.nearbyPlaces.title,
              body: fill(texts.nearbyPlaces.body, { places: places.map((a) => `${name(a)} (${roundedDistance(a.distance)})`).join(', ') }),
            };
      const data = { route: 'place', placeId: nearest.placeId, latitude: nearest.position.latitude, longitude: nearest.position.longitude };
      return { ...base, id: `nearby:${places.map((a) => a.placeId).join('+')}`, group: 'places', ...text, data };
    }
    case 'secretPlace': {
      const secrets = alerts.filter((a) => a.kind === 'secretPlace').sort((a, b) => a.distance - b.distance);
      const [nearest] = secrets;
      const data = { route: 'place', placeId: nearest.placeId, latitude: nearest.position.latitude, longitude: nearest.position.longitude };
      return {
        ...base,
        id: `secret:${secrets.map((a) => a.placeId).join('+')}`,
        group: 'places',
        title: texts.secretPlace.title,
        body: fill(texts.secretPlace.body, { place: secrets.map((a) => tr(placeInfo[a.secret].name)).join(', '), distance: roundedDistance(nearest.distance) }),
        data,
      };
    }
  }
}

/**
 * Pocket mode's own notifications from the background task's alerts: each kind
 * only when switched on, at most one every `notifyEveryMinutes`, several of a
 * kind grouped into one. Quests and chests that can't go yet are held for the
 * next turn (and for the end of quiet hours); places nearby are dropped, since
 * the player will have walked on.
 */
export function pocketNotifications(
  alerts: PocketAlert[],
  log: PocketNotifyLog,
  settings: NotificationSettings,
  now: number,
  everyMinutes = pocketRules.notifyEveryMinutes,
): { notifications: PlannedNotification[]; log: PocketNotifyLog } {
  if (!settings.enabled) return { notifications: [], log: { ...log, held: [] } };
  const wanted = [...log.held, ...alerts].filter((alert) => settings.categories[CATEGORY[alert.kind]]);
  const sentAt = { ...log.sentAt };
  const held: PocketAlert[] = [];
  const notifications: PlannedNotification[] = [];

  for (const category of ORDER) {
    const due = wanted.filter((alert) => CATEGORY[alert.kind] === category);
    if (due.length === 0) continue;
    const passing = PASSING.includes(category);
    const last = sentAt[category];
    if (last !== undefined && now - last < everyMinutes * MINUTE) {
      if (!passing) held.push(...due);
      continue;
    }
    const at = deliveryTime(now, category, settings);
    if (at > now && passing) continue;
    notifications.push(grouped(category, due, at > now ? at : null));
    sentAt[category] = now;
  }
  return { notifications, log: { sentAt, held } };
}
