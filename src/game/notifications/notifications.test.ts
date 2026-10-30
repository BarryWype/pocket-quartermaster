import { dungeons } from '@/content/dungeons';
import { notificationTexts } from '@/content/notifications';
import { recipes } from '@/content/recipes';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { emptyLoot } from '../loot/types';
import type { Heist } from '../types';
import { createInitialSave, type SaveData } from '../save';
import { timeToFull } from '../team/health';
import { equip } from '../team/team';
import { stepChests } from '../rewards/chests';
import { defaultNotificationSettings, planNotifications, previewExpedition } from './plan';
import { deliveryTime, inQuietHours, quietHoursEnd } from './quietHours';
import { stepAlerts } from './steps';
import type { NotificationSettings } from './types';

const at = (hours: number, minutes = 0, day = 26) => new Date(2026, 9, day, hours, minutes).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

/** Settings with quiet hours off, so timing tests see raw times. */
function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  const base = defaultNotificationSettings();
  return { ...base, quietHours: { ...base.quietHours, enabled: false }, ...overrides };
}
const withCategories = (categories: Partial<NotificationSettings['categories']>) =>
  settings({ categories: { ...defaultNotificationSettings().categories, ...categories } });

/** A strong team that knows every recipe and holds 3 Sigils, so results are plain unless a boss falls. */
function veterans(): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 9 })),
    gear: ['sword5', 'bow5', 'wand5', 'mail5', 'mail5', 'mail5'].map((itemId, i) => ({ uid: `g${i}`, itemId, quality: 'normal' })),
    knownRecipes: recipes.map((r) => r.id),
    clearedDungeons: dungeons.filter((d) => d.isBoss).map((d) => d.id),
    sigils: [1, 1, 1],
    firstSigilGiven: true,
    tutorial: { step: 'done', woodSpot: null },
  };
  ['bram', 'lyra', 'mira'].forEach((id, i) => {
    save = equip(save, id, 'weapon', `g${i}`);
    save = equip(save, id, 'armor', `g${i + 3}`);
  });
  return save;
}

describe('quiet hours', () => {
  const quiet = { enabled: true, start: 22 * 60, end: 8 * 60 };

  it('spans midnight', () => {
    expect(inQuietHours(at(23), quiet)).toBe(true);
    expect(inQuietHours(at(3), quiet)).toBe(true);
    expect(inQuietHours(at(8), quiet)).toBe(false);
    expect(inQuietHours(at(12), quiet)).toBe(false);
    expect(inQuietHours(at(23), { ...quiet, enabled: false })).toBe(false);
  });

  it('works within a day too', () => {
    expect(inQuietHours(at(13), { enabled: true, start: 12 * 60, end: 14 * 60 })).toBe(true);
    expect(inQuietHours(at(15), { enabled: true, start: 12 * 60, end: 14 * 60 })).toBe(false);
  });

  it('holds notifications until quiet hours end', () => {
    expect(quietHoursEnd(at(23), quiet)).toBe(at(8, 0, 27));
    expect(quietHoursEnd(at(3), quiet)).toBe(at(8));
    const s = defaultNotificationSettings();
    expect(deliveryTime(at(23), 'chestUnlocked', s)).toBe(at(8, 0, 27));
    expect(deliveryTime(at(12), 'chestUnlocked', s)).toBe(at(12));
  });

  it('can let expedition results through', () => {
    const s = { ...defaultNotificationSettings(), allowResultsInQuietHours: true };
    expect(deliveryTime(at(23), 'expeditionFinished', s)).toBe(at(23));
    expect(deliveryTime(at(23), 'bigResult', s)).toBe(at(23));
    expect(deliveryTime(at(23), 'heroesIdle', s)).toBe(at(8, 0, 27));
  });
});

describe('expedition notifications', () => {
  const now = at(12);

  it('announces a team coming back with its outcome, at its end time', () => {
    const save = startExpedition(veterans(), 'ratCellar', ['bram', 'lyra', 'mira'], now);
    const report = previewExpedition(save, save.expeditions[0]);
    const [notification] = planNotifications(save, settings(), now);
    expect(notification).toMatchObject({ category: 'expeditionFinished', group: 'expeditions', at: save.expeditions[0].endsAt });
    expect(notification.body).toContain('Rat Cellar');
    expect(notification.body).toContain(notificationTexts.outcome[report.outcome]);
  });

  it('groups expeditions ending within a couple of minutes', () => {
    let save = startExpedition(veterans(), 'ratCellar', ['bram'], now);
    save = startExpedition(save, 'wolfDen', ['lyra'], now); // 10 min: separate
    save = startExpedition(save, 'ratCellar', ['mira'], now + MIN); // ends a minute after the first
    const results = planNotifications(save, settings(), now).filter((n) => n.group === 'expeditions');
    expect(results).toHaveLength(2);
    expect(results[0].title).toMatch(/teams are back/);
    expect(results[0].at).toBe(now + 6 * MIN);
  });

  it('highlights boss victories and blueprints', () => {
    const save = startExpedition(veterans(), 'banditStockade', ['bram', 'lyra', 'mira'], now);
    expect(previewExpedition(save, save.expeditions[0]).success).toBe(true);
    const [notification] = planNotifications(save, settings(), now);
    expect(notification.category).toBe('bigResult');
    expect(notification.body).toContain('boss defeated');
    const tutorial: SaveData = { ...createInitialSave(), tutorial: { step: 'sendExpedition', woodSpot: null } };
    const first = startExpedition(tutorial, 'ratCellar', ['bram'], now);
    expect(planNotifications(first, settings(), now)[0].body).toMatch(/new blueprint \(.+\)/);
  });

  it('respects the expedition categories', () => {
    const save = startExpedition(veterans(), 'ratCellar', ['bram', 'lyra', 'mira'], now);
    expect(planNotifications(save, withCategories({ expeditionFinished: false }), now)).toEqual([]);
    const boss = startExpedition(veterans(), 'banditStockade', ['bram', 'lyra', 'mira'], now);
    const onlyBig = planNotifications(boss, withCategories({ expeditionFinished: false }), now);
    expect(onlyBig.every((n) => n.category === 'bigResult')).toBe(true);
    const plain = planNotifications(boss, withCategories({ bigResult: false }), now);
    expect(plain.every((n) => n.category === 'expeditionFinished')).toBe(true);
  });

  it('plans nothing with the master switch off', () => {
    const save = startExpedition(veterans(), 'ratCellar', ['bram'], now);
    expect(planNotifications(save, settings({ enabled: false }), now)).toEqual([]);
  });

  it('delays results to the end of quiet hours unless allowed', () => {
    const night = at(23);
    const save = startExpedition(veterans(), 'ratCellar', ['bram'], night);
    expect(planNotifications(save, defaultNotificationSettings(), night)[0].at).toBe(at(8, 0, 27));
    const allowed = { ...defaultNotificationSettings(), allowResultsInQuietHours: true };
    expect(planNotifications(save, allowed, night)[0].at).toBe(save.expeditions[0].endsAt);
  });
});

describe('idle reminder', () => {
  const idleOn = withCategories({ heroesIdle: true, expeditionFinished: false, bigResult: false });

  it('is off by default', () => {
    const save = startExpedition(veterans(), 'ratCellar', ['bram'], at(12));
    expect(planNotifications(save, settings(), at(12)).some((n) => n.category === 'heroesIdle')).toBe(false);
  });

  it('comes 4 hours after the last team is due back, and moves when one starts', () => {
    const save = startExpedition(veterans(), 'ratCellar', ['bram'], at(12));
    const idle = planNotifications(save, idleOn, at(12)).find((n) => n.category === 'heroesIdle')!;
    expect(idle.at).toBe(save.expeditions[0].endsAt + 4 * HOUR);
    const later = startExpedition(save, 'wolfDen', ['lyra'], at(13));
    const moved = planNotifications(later, idleOn, at(13)).find((n) => n.category === 'heroesIdle')!;
    expect(moved.at).toBe(at(13) + 10 * MIN + 4 * HOUR);
  });

  it('counts from the last report once everyone is home, and is not sent late', () => {
    const earlier = startExpedition(veterans(), 'ratCellar', ['bram'], at(10));
    const report = { ...previewExpedition(earlier, earlier.expeditions[0]), finishedAt: at(10) };
    const save: SaveData = { ...veterans(), reports: [report] };
    expect(planNotifications(save, idleOn, at(12)).find((n) => n.category === 'heroesIdle')!.at).toBe(at(14));
    expect(planNotifications(save, idleOn, at(15)).some((n) => n.category === 'heroesIdle')).toBe(false);
  });
});

describe('heroes rested', () => {
  const restedOn = withCategories({ heroesRested: true, expeditionFinished: false, bigResult: false });
  /** Bram alone with no gear in the boss dungeon: he comes back hurt. */
  const hurtRun = () => startExpedition({ ...createInitialSave(), tutorial: { step: 'done', woodSpot: null } }, 'banditStockade', ['bram'], at(12));

  it('is off by default', () => {
    expect(planNotifications(hurtRun(), settings(), at(12)).some((n) => n.category === 'heroesRested')).toBe(false);
  });

  it('comes when every hero who came back hurt is full again', () => {
    const save = hurtRun();
    const { save: back, report } = resolveExpedition(save, save.expeditions[0]);
    const bram = back.heroes.find((h) => h.id === 'bram')!;
    expect(report.heroHp[0].hp).toBeLessThan(report.heroHp[0].maxHp);
    const endsAt = save.expeditions[0].endsAt;
    const expected = endsAt + timeToFull(back, bram, endsAt);
    expect(planNotifications(save, restedOn, at(12)).find((n) => n.category === 'heroesRested')!.at).toBe(expected);
    // Once home, from the report.
    expect(planNotifications(back, restedOn, endsAt).find((n) => n.category === 'heroesRested')!.at).toBe(expected);
  });

  it('waits for the end of quiet hours', () => {
    const save = hurtRun();
    const quiet = { ...restedOn, quietHours: { enabled: true, start: 12 * 60, end: 18 * 60 } };
    expect(planNotifications(save, quiet, at(12)).find((n) => n.category === 'heroesRested')!.at).toBe(at(18));
  });
});

describe('daily reset', () => {
  it('is off by default and arrives at midnight, or after quiet hours', () => {
    expect(planNotifications(veterans(), settings(), at(12))).toEqual([]);
    const on = withCategories({ dailyReset: true });
    expect(planNotifications(veterans(), on, at(12))[0]).toMatchObject({ category: 'dailyReset', at: at(0, 0, 27) });
    const quiet = { ...on, quietHours: defaultNotificationSettings().quietHours };
    expect(planNotifications(veterans(), quiet, at(12))[0].at).toBe(at(8, 0, 27));
  });
});

describe('step alerts', () => {
  const [wooden, iron] = [...stepChests].sort((a, b) => a.steps - b.steps);
  const day = '2026-10-26';
  const fresh = { day, sent: [] };

  it('says when a chest unlocks, once per day', () => {
    const first = stepAlerts(createInitialSave(), wooden.steps, day, fresh, settings());
    expect(first.alerts.map((a) => a.category)).toEqual(['chestUnlocked']);
    expect(stepAlerts(createInitialSave(), wooden.steps + 50, day, first.log, settings()).alerts).toEqual([]);
    expect(stepAlerts(createInitialSave(), wooden.steps, '2026-10-27', first.log, settings()).alerts).toHaveLength(1);
  });

  it('does not announce a chest already opened today', () => {
    const opened: SaveData = { ...createInitialSave(), chests: { day, opened: [wooden.id] } };
    expect(stepAlerts(opened, wooden.steps, day, fresh, settings()).alerts).toEqual([]);
  });

  it('says when the next chest is close, once per chest per day', () => {
    const near = iron.steps - 600;
    const { alerts, log } = stepAlerts(
      { ...createInitialSave(), chests: { day, opened: [wooden.id] } },
      near,
      day,
      fresh,
      settings(),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ category: 'chestClose' });
    expect(alerts[0].body).toContain('600');
    expect(stepAlerts(createInitialSave(), near + 100, day, log, settings()).alerts.filter((a) => a.category === 'chestClose')).toEqual([]);
    expect(stepAlerts(createInitialSave(), iron.steps - 1500, day, fresh, settings()).alerts.filter((a) => a.category === 'chestClose')).toEqual([]);
  });

  it('follows the step categories and the master switch', () => {
    expect(stepAlerts(createInitialSave(), wooden.steps, day, fresh, withCategories({ chestUnlocked: false })).alerts).toEqual([]);
    expect(stepAlerts(createInitialSave(), wooden.steps, day, fresh, settings({ enabled: false })).alerts).toEqual([]);
  });
});

describe('heist notifications', () => {
  const now = at(12);

  const heistOf = (over: Partial<Heist> = {}): Heist => ({
    id: 'heist9',
    placeId: 'place:thievesGuild:tile:0:1',
    heroId: 'bram',
    startedAt: now,
    endsAt: now + 20 * MIN,
    success: true,
    reward: { ...emptyLoot(), gold: 100 },
    ...over,
  });

  it('announces a hero back from a heist, with loot or empty-handed', () => {
    const save: SaveData = { ...createInitialSave(), heists: [heistOf()] };
    const [notification] = planNotifications(save, settings(), now);
    expect(notification).toMatchObject({ category: 'heistFinished', group: 'expeditions', at: now + 20 * MIN });
    expect(notification.body).toContain('Bram');
    expect(notification.body).toContain(notificationTexts.heistOutcome.loot);
    const lost: SaveData = { ...createInitialSave(), heists: [heistOf({ success: false })] };
    expect(planNotifications(lost, settings(), now)[0].body).toContain(notificationTexts.heistOutcome.empty);
  });

  it('groups heists ending within a couple of minutes, and follows the category', () => {
    const save: SaveData = {
      ...createInitialSave(),
      heists: [heistOf(), heistOf({ id: 'heist10', heroId: 'lyra', endsAt: now + 21 * MIN })],
    };
    const planned = planNotifications(save, settings(), now);
    expect(planned).toHaveLength(1);
    expect(planned[0].body).toContain('Bram');
    expect(planned[0].body).toContain('Lyra');
    expect(planNotifications(save, withCategories({ heistFinished: false }), now)).toEqual([]);
  });
});
