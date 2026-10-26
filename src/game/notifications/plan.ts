import { dungeonById, recipeById, recipeOutput } from '@/content/lookup';
import { frNotificationTexts } from '@/content/fr/notifications';
import { notificationCategories, notificationRules, notificationTexts as enNotificationTexts } from '@/content/notifications';
import { fill, localized, tr } from '@/i18n';

import { resolveExpedition } from '../expeditions/expeditions';
import type { SaveData } from '../save';
import type { ActiveExpedition, ExpeditionReport } from '../types';
import { deliveryTime } from './quietHours';
import type { NotificationCategory, NotificationSettings, PlannedNotification } from './types';

type Rules = typeof notificationRules;

export { fill };

/** The notification wording in the current language. */
export const notificationTexts = () => localized({ en: enNotificationTexts, fr: frNotificationTexts });

export function defaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    categories: Object.fromEntries(
      Object.entries(notificationCategories).map(([id, category]) => [id, category.defaultOn]),
    ) as Record<NotificationCategory, boolean>,
    quietHours: { enabled: true, ...notificationRules.quietHours },
    allowResultsInQuietHours: false,
  };
}

/**
 * How an expedition will turn out. Resolution is deterministic and the party's
 * gear is locked while away, so this can be known when it sets out.
 */
export function previewExpedition(save: SaveData, expedition: ActiveExpedition): ExpeditionReport {
  return resolveExpedition(save, expedition).report;
}

/** What makes a result worth highlighting. Sigils come from the main reward roll. */
export function highlightsOf(report: ExpeditionReport): string[] {
  if (!report.success) return [];
  const { highlights } = notificationTexts();
  return [
    dungeonById[report.dungeonId].isBoss ? highlights.boss : null,
    report.recipeId ? fill(highlights.blueprint, { item: tr(recipeOutput(recipeById[report.recipeId]).name) }) : null,
    report.mainRewards.some((r) => r.kind === 'sigil') ? highlights.sigil : null,
  ].filter((line): line is string => line !== null);
}

/** One notification per group of expeditions ending within a couple of minutes of each other. */
function expeditionNotifications(save: SaveData, settings: NotificationSettings, rules: Rules): PlannedNotification[] {
  const { categories } = settings;
  const sorted = [...save.expeditions].sort((a, b) => a.endsAt - b.endsAt);
  const clusters: ActiveExpedition[][] = [];
  for (const expedition of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && expedition.endsAt - last[0].endsAt <= rules.groupWindowMinutes * 60_000) last.push(expedition);
    else clusters.push([expedition]);
  }

  return clusters.flatMap((cluster): PlannedNotification[] => {
    const results = cluster
      .map((expedition) => {
        const report = previewExpedition(save, expedition);
        return { expedition, report, highlights: categories.bigResult ? highlightsOf(report) : [] };
      })
      .filter((r) => categories.expeditionFinished || r.highlights.length > 0);
    if (results.length === 0) return [];

    const big = results.some((r) => r.highlights.length > 0);
    const category: NotificationCategory = big ? 'bigResult' : 'expeditionFinished';
    const at = Math.max(...cluster.map((e) => e.endsAt));
    const id = `expedition:${cluster.map((e) => e.id).join('+')}`;
    const t = notificationTexts();
    if (results.length === 1) {
      const [{ report, highlights }] = results;
      const dungeon = tr(dungeonById[report.dungeonId].name);
      const text = big ? t.bigResult : t.finished;
      return [
        {
          id,
          category,
          group: 'expeditions',
          at,
          title: text.title,
          body: fill(text.body, { dungeon, outcome: t.outcome[report.outcome], highlights: highlights.join(', ') }),
        },
      ];
    }
    const lines = results.map(({ report, highlights }) => {
      const dungeon = tr(dungeonById[report.dungeonId].name);
      return `${dungeon}: ${highlights.length ? highlights.join(', ') : t.outcome[report.outcome]}`;
    });
    const text = big ? t.groupBigResult : t.groupFinished;
    return [{ id, category, group: 'expeditions', at, title: text.title, body: fill(text.body, { results: lines.join(' · ') }) }];
  });
}

/** Idle reminder: a while after the last team comes home, if nobody goes out again. */
function idleNotification(save: SaveData, rules: Rules): PlannedNotification[] {
  const lastActive = save.expeditions.length
    ? Math.max(...save.expeditions.map((e) => e.endsAt))
    : (save.reports[0]?.finishedAt ?? null);
  if (lastActive === null) return [];
  const t = notificationTexts().heroesIdle;
  return [
    { id: 'idle', category: 'heroesIdle', group: 'expeditions', at: lastActive + rules.idleHours * 3_600_000, ...t },
  ];
}

/** The next local midnight, when step chests reset. */
function dailyResetNotification(now: number): PlannedNotification[] {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return [{ id: 'daily', category: 'dailyReset', group: 'steps', at: midnight.getTime(), ...notificationTexts().dailyReset }];
}

/**
 * Every notification that should be scheduled right now, given the game state
 * and settings: expedition results, the idle reminder and the daily reset,
 * each moved out of quiet hours. Re-planned whenever either changes.
 */
export function planNotifications(
  save: SaveData,
  settings: NotificationSettings,
  now: number,
  rules: Rules = notificationRules,
): PlannedNotification[] {
  if (!settings.enabled) return [];
  const { categories } = settings;
  const planned = [
    ...expeditionNotifications(save, settings, rules),
    ...(categories.heroesIdle ? idleNotification(save, rules) : []),
    ...(categories.dailyReset ? dailyResetNotification(now) : []),
  ];
  return planned
    .map((n) => (n.at === null ? n : { ...n, at: deliveryTime(n.at, n.category, settings) }))
    .filter((n) => n.at === null || n.at > now);
}

