import { formatDistance } from '@/i18n';

import type { BackgroundAlert } from '../patrols/escort';
import { patrolPositionAt } from '../patrols/generate';
import { findSpawn } from '../patrols/testHelpers';
import { defaultNotificationSettings } from './plan';
import { patrolNotifications } from './patrols';
import type { NotificationSettings } from './types';

const at = (hours: number, minutes = 0, day = 26) => new Date(2026, 9, day, hours, minutes).getTime();
const now = at(12);

/** Settings with quiet hours off, so timing tests see raw times. */
function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  const base = defaultNotificationSettings();
  return { ...base, quietHours: { ...base.quietHours, enabled: false }, ...overrides };
}
const withCategories = (categories: Partial<NotificationSettings['categories']>) =>
  settings({ categories: { ...defaultNotificationSettings().categories, ...categories } });

const { spawn: goblins } = findSpawn((s) => s.kind === 'goblins');
const { spawn: wounded } = findSpawn((s) => s.kind === 'wounded');

/** A patrol spotted 123 m away, at the given tier. */
const spotted = (spawn = goblins): BackgroundAlert => ({ kind: 'patrolSpotted', spawn, distance: 123, tier: 3 });

describe('patrol alerts', () => {
  it('says what was spotted, how far, and where it is now', () => {
    const [alert] = patrolNotifications([spotted()], null, settings(), now);
    expect(alert).toMatchObject({
      id: `patrol:${goblins.id}`,
      category: 'patrolSpotted',
      group: 'patrols',
      at: null,
      title: 'Goblin patrol spotted',
      body: `Goblin patrol ${formatDistance(120)} away (tier 3)`,
    });
    expect(alert!.data).toEqual({ route: 'map', patrolId: goblins.id, ...patrolPositionAt(goblins, now) });
  });

  it('says a traveller by name, with their line', () => {
    const [alert] = patrolNotifications([spotted(wounded)], null, settings(), now);
    expect(alert!.title).toBe('Wounded traveller nearby');
    expect(alert!.body).toBe('Hurt and far from the road — a healing potion would help.');
    expect(alert!.data).toEqual({ route: 'map', patrolId: wounded.id, ...patrolPositionAt(wounded, now) });
  });

  it('is dropped when quiet hours would hold it stale, while escort alerts are held', () => {
    const planned = patrolNotifications(
      [spotted(), { kind: 'escortPaused', hpShare: 0.45 }],
      'Bram',
      defaultNotificationSettings(),
      at(23),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ category: 'escort', at: at(8, 0, 27) });
  });

  it('follows the categories and the master switch', () => {
    expect(patrolNotifications([spotted()], null, withCategories({ patrolSpotted: false }), now)).toEqual([]);
    expect(patrolNotifications([{ kind: 'escortKnockedOut' }], 'Bram', withCategories({ escort: false }), now)).toEqual([]);
    expect(patrolNotifications([spotted()], null, settings({ enabled: false }), now)).toEqual([]);
  });
});

describe('escort alerts', () => {
  it('says the hero and how much HP they have left', () => {
    const [alert] = patrolNotifications([{ kind: 'escortPaused', hpShare: 0.456 }], 'Bram', settings(), now);
    expect(alert).toMatchObject({
      id: `escort:escortPaused:${now}:0`,
      category: 'escort',
      group: 'patrols',
      at: null,
      title: 'Escort paused',
    });
    expect(alert!.body).toBe('Bram is at 46% HP.');
    expect(alert!.data).toEqual({ route: 'pocketMode' });
  });

  it('says when the escort is knocked out', () => {
    const [alert] = patrolNotifications([{ kind: 'escortKnockedOut' }], 'Lyra', settings(), now);
    expect(alert).toMatchObject({ id: `escort:escortKnockedOut:${now}:0`, category: 'escort', at: null, title: 'Escort knocked out' });
    expect(alert!.body).toBe('Lyra needs rest.');
  });
});
