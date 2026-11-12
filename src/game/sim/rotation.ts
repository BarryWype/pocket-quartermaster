import type { RunLog } from './bot';
import { stat, type Stat } from './metrics';
import { targets as defaultTargets, type Targets } from './targets';

/** How the roster rotates: which classes fill the party's slots, and how many distinct heroes a week fields. */
export type Rotation = {
  tiers: Record<number, { slots: Record<string, number>; heroesPerWeek: Stat }>;
  topClassShare: Stat;
  topClass: string | null;
  fewestHeroesPerWeek: Stat;
};

/** The tier the bot was in at the start of a day: 1 plus the bosses beaten before it. */
const tierOfDay = (log: RunLog, day: number) => 1 + [1, 2, 3, 4].filter((t) => (log.milestones[`boss:${t}`] ?? Infinity) < day).length;

/** The game's complete 7-day weeks: their first day, its tier, and the distinct heroes fielded in the week. */
const weeksOf = (log: RunLog) => {
  const weeks: { day: number; tier: number; heroes: Set<string> }[] = [];
  for (let w = 0; 7 * (w + 1) <= log.days; w++) weeks.push({ day: 7 * w + 1, tier: tierOfDay(log, 7 * w + 1), heroes: new Set<string>() });
  for (const row of log.expeditions) {
    const week = weeks.find((wk) => row.day >= wk.day && row.day < wk.day + 7);
    if (week) for (const id of row.heroIds) week.heroes.add(id);
  }
  return weeks;
};

/** The expeditions launched after the day the roster first held `roster` heroes (null if it never did). */
const afterFullRoster = (log: RunLog, roster: number) => {
  const day = log.daily.find((row) => row.roster >= roster)?.day;
  return day === undefined ? null : log.expeditions.filter((row) => row.day > day);
};

export function rotationOf(logs: RunLog[], t: Targets = defaultTargets): Rotation {
  const tiers: Rotation['tiers'] = {};
  for (const tier of [1, 2, 3, 4, 5]) {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const log of logs)
      for (const row of log.expeditions) {
        if (tierOfDay(log, row.day) !== tier) continue;
        for (const classId of row.classes) {
          counts[classId] = (counts[classId] ?? 0) + 1;
          total++;
        }
      }
    const slots = Object.fromEntries(Object.entries(counts).map(([classId, n]) => [classId, n / Math.max(1, total)]));
    const heroesPerWeek = stat(
      logs.map((log) => {
        const sizes = weeksOf(log).filter((w) => w.tier === tier).map((w) => w.heroes.size);
        return sizes.length ? stat(sizes).median : null;
      }),
    );
    tiers[tier] = { slots, heroesPerWeek };
  }

  const shareOf = (rows: RunLog['expeditions']) => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows)
      for (const classId of row.classes) {
        counts[classId] = (counts[classId] ?? 0) + 1;
        total++;
      }
    return { counts, total };
  };
  const windows = logs.map((log) => afterFullRoster(log, t.rotation.roster));
  const topClassShare = stat(
    windows.map((rows) => {
      if (!rows) return null;
      const { counts, total } = shareOf(rows);
      return total ? Math.max(...Object.values(counts)) / total : null;
    }),
  );
  const pooled = shareOf(windows.flatMap((rows) => rows ?? []));
  const topClass = Object.entries(pooled.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const fewestHeroesPerWeek = stat(
    logs.map((log) => {
      const sizes = weeksOf(log).filter((w) => w.tier >= t.rotation.fromTier).map((w) => w.heroes.size);
      return sizes.length ? Math.min(...sizes) : null;
    }),
  );
  return { tiers, topClassShare, topClass, fewestHeroesPerWeek };
}
