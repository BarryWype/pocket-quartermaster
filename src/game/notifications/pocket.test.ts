import { pocketRules } from '@/content/pocketMode';
import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { emptyPocketLog, pocketNotifications, type PocketAlert } from './pocket';
import { defaultNotificationSettings } from './plan';
import type { NotificationSettings } from './types';

const at = (hours: number, minutes = 0) => new Date(2026, 9, 26, hours, minutes).getTime();
const now = at(12);
const MINUTE = 60_000;
const spot: LatLng = { latitude: 51.5, longitude: -0.12 };

/** Settings with quiet hours off, unless a test turns them on. */
function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  const base = defaultNotificationSettings();
  return { ...base, quietHours: { ...base.quietHours, enabled: false }, ...overrides };
}
const without = (category: keyof NotificationSettings['categories']) =>
  settings({ categories: { ...defaultNotificationSettings().categories, [category]: false } });
const quiet = settings({ quietHours: { enabled: true, start: 11 * 60, end: 13 * 60 } });

const questReady = (questId = 'q|1', objective: 'walk' | 'patrols' = 'walk'): PocketAlert => ({ kind: 'questReady', questId, objective });
const chest: PocketAlert = { kind: 'chestReady', chestId: 'steps2000', steps: 2000 };
const ruin = (placeId = 'place:ruins:a', distance = 120): PocketAlert => ({
  kind: 'nearbyPlace',
  placeId,
  place: 'ruins',
  position: offsetPosition(spot, distance, 0),
  distance,
});
const secret: PocketAlert = { kind: 'secretPlace', placeId: 'secret:den', secret: 'hiddenDen', position: spot, distance: 80 };
const target: PocketAlert = {
  kind: 'questTarget',
  questId: 'q|2',
  target: { placeId: 'chapel-1', kind: 'chapel', position: spot, from: spot, expiresAt: now + 60 * MINUTE },
};

const send = (alerts: PocketAlert[], s = settings(), log = emptyPocketLog(), time = now) => pocketNotifications(alerts, log, s, time);

describe('Pocket mode notifications', () => {
  it('sends each kind to the right screen', () => {
    const { notifications } = send([questReady(), target, chest, ruin(), secret]);
    expect(notifications.map((n) => [n.category, n.data?.route])).toEqual([
      ['questReady', 'quests'],
      ['questTarget', 'quests'],
      ['chestUnlocked', 'chests'],
      ['nearbyPlaces', 'place'],
      ['secretPlace', 'place'],
    ]);
    const place = notifications.find((n) => n.category === 'nearbyPlaces');
    expect(place?.data).toMatchObject({ placeId: 'place:ruins:a' });
    expect(notifications.every((n) => n.at === null)).toBe(true);
  });

  it('respects each switch and the master switch', () => {
    expect(send([questReady()], without('questReady')).notifications).toEqual([]);
    expect(send([target], without('questTarget')).notifications).toEqual([]);
    expect(send([chest], without('chestUnlocked')).notifications).toEqual([]);
    expect(send([ruin()], without('nearbyPlaces')).notifications).toEqual([]);
    expect(send([secret], without('secretPlace')).notifications).toEqual([]);
    expect(send([questReady(), ruin()], settings({ enabled: false })).notifications).toEqual([]);
  });

  it('groups several of a kind into one', () => {
    const { notifications } = send([questReady('q|1'), questReady('q|2', 'patrols'), ruin('a', 140), ruin('b', 60)]);
    expect(notifications).toHaveLength(2);
    expect(notifications[0].title).toContain('2');
    // The map centres on the nearest place.
    expect(notifications[1].data).toMatchObject({ placeId: 'b' });
    expect(notifications[1].body).toContain('Ruins');
  });

  it('sends at most one of a kind every few minutes: quests wait, places pass', () => {
    const first = send([questReady('q|1'), ruin('a')]);
    const soon = send([questReady('q|2'), ruin('b')], settings(), first.log, now + MINUTE);
    expect(soon.notifications).toEqual([]);
    expect(soon.log.held).toEqual([questReady('q|2')]);

    const later = send([], settings(), soon.log, now + pocketRules.notifyEveryMinutes * MINUTE);
    expect(later.notifications.map((n) => n.id)).toEqual(['questReady:q|2']);
    expect(later.log.held).toEqual([]);

    // Other kinds aren't held back by it.
    expect(send([chest], settings(), first.log, now + MINUTE).notifications).toHaveLength(1);
  });

  it('holds quests and chests until quiet hours end, and drops places', () => {
    const { notifications } = send([questReady(), chest, ruin(), secret], quiet);
    expect(notifications.map((n) => [n.category, n.at])).toEqual([
      ['questReady', at(13)],
      ['chestUnlocked', at(13)],
    ]);
  });
});
