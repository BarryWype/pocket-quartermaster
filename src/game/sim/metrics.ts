import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { items } from '@/content/items';
import { tierMaterials } from '@/content/materials';
import { placeInfo } from '@/content/places';

import type { LootCategory } from '../loot/types';
import type { ProbeRow, RunLog } from './bot';
import { expectedLevels } from './config';
import { lootPacing } from './pacing';
import { inRange, targets as defaultTargets, type Targets } from './targets';

const TIERS = [1, 2, 3, 4, 5];

/** Median and range over seeds; null where no seed got there. */
export type Stat = { median: number | null; min: number | null; max: number | null; reached: number; seeds: number };

export function stat(values: (number | null | undefined)[]): Stat {
  const known = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  const mid = known.length ? (known.length % 2 ? known[(known.length - 1) / 2] : (known[known.length / 2 - 1] + known[known.length / 2]) / 2) : null;
  return { median: mid, min: known[0] ?? null, max: known.at(-1) ?? null, reached: known.length, seeds: values.length };
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** First and last day of a tier in a game: from the day after the previous boss's first win to the day of this one's. */
export function tierWindow(log: RunLog, tier: number): [number, number] | null {
  const start = tier === 1 ? 1 : (log.milestones[`boss:${tier - 1}`] ?? null);
  if (start === null) return null;
  const end = log.milestones[`boss:${tier}`] ?? (log.finished ? null : log.days);
  return end === null ? null : [tier === 1 ? 1 : start + 1, Math.max(tier === 1 ? 1 : start + 1, end)];
}

const within = (day: number, window: [number, number] | null) => !!window && day >= window[0] && day <= window[1];

/** Probed odds at the tier's last probe (gear of the tier) and at its first, the launched runs' win rate, and the target. */
export type OddsLine = { probe: Stat; start: Stat; actual: number | null; runs: number; target: [number, number] };

export type TierSummary = {
  tier: number;
  days: Stat;
  odds: { prepared: OddsLine; unprepared: OddsLine; gap: Stat; boss: OddsLine; events: OddsLine };
  gold: { income: Record<string, number>; spend: Record<string, number>; growth: Stat; incomePerDay: Stat; surplus: boolean };
  material: { id: string; gathered: Stat; spent: Stat; share: Stat };
  level: { end: Stat; target: number };
};

export type ProfileSummary = {
  profile: string;
  seeds: number;
  finished: number;
  totalDays: Stat;
  tiers: TierSummary[];
  /** Regular profile only: designed vs observed weekly drops. */
  loot: { category: LootCategory; column: string; designed: number; observed: number; off: number }[];
  health: {
    pileUps: { id: string; final: number }[];
    dead: { items: string[]; recipes: string[]; classes: string[]; places: string[]; dungeons: string[] };
    classSpread: Record<string, number>;
    milestones: Record<string, Stat>;
    skipped: Record<string, number>;
  };
};

/** What `npm run sim` writes to doc/design/simulator/summary.json, and the balance band tests read. */
export type Summary = {
  settings: { profiles: string[]; seeds: number; seed: string; overrides: string[]; maxDays: number | null };
  profiles: Record<string, ProfileSummary>;
};

/** Median of each key over seeds, of per-seed totals. */
function medianTotals(perSeed: Record<string, number>[]): Record<string, number> {
  const keys = [...new Set(perSeed.flatMap((r) => Object.keys(r)))];
  return Object.fromEntries(keys.map((k) => [k, stat(perSeed.map((r) => r[k] ?? 0)).median ?? 0]));
}

function tierSummary(logs: RunLog[], tier: number, t: Targets): TierSummary {
  const windows = logs.map((log) => tierWindow(log, tier));
  const days = stat(logs.map((log, i) => (log.milestones[`boss:${tier}`] !== undefined && windows[i] ? windows[i]![1] - windows[i]![0] + 1 : null)));

  /** The mean of one probe snapshot (the tier's first or last) in each game, over seeds. */
  const snapshot = (kinds: string[], value: (p: ProbeRow) => number | null, last: boolean) =>
    stat(
      logs.map((log) => {
        const rows = log.probes.filter((p) => p.tier === tier && kinds.includes(p.kind));
        if (!rows.length) return null;
        const at = last ? Math.max(...rows.map((p) => p.at)) : Math.min(...rows.map((p) => p.at));
        return mean(rows.filter((p) => p.at === at).map(value).filter((v): v is number => v !== null));
      }),
    );
  const line = (kinds: string[], value: (p: ProbeRow) => number | null) => ({ probe: snapshot(kinds, value, true), start: snapshot(kinds, value, false) });
  const rate = (rows: { won: boolean }[]) => (rows.length ? rows.filter((r) => r.won).length / rows.length : null);
  const normalRuns = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && !e.boss && !e.overnight).map((e) => ({ won: e.success })));
  const bossRuns = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && e.boss).map((e) => ({ won: e.success })));
  const eventRuns = logs.flatMap((log) => [
    ...log.places.filter((p) => p.tier === tier && p.won !== null && p.kind !== 'thievesGuild').map((p) => ({ won: !!p.won })),
    ...log.patrols.fights.filter((f) => f.tier === tier).map((f) => ({ won: f.won })),
  ]);
  const gap = snapshot(['normal'], (p) => (p.unprepared === null ? null : p.prepared - p.unprepared), true);

  const income = medianTotals(logs.map((log, i) => sumBy(log.goldIn.filter((g) => within(g.day, windows[i])), (g) => g.source, (g) => g.amount)));
  const spend = medianTotals(logs.map((log, i) => sumBy(log.goldOut.filter((g) => within(g.day, windows[i])), (g) => g.sink, (g) => g.amount)));
  const incomePerDay = stat(logs.map((log, i) => (windows[i] ? sum(log.goldIn.filter((g) => within(g.day, windows[i])).map((g) => g.amount)) / (windows[i]![1] - windows[i]![0] + 1) : null)));
  const goldAt = (log: RunLog, day: number) => (day <= 0 ? 0 : (log.daily[day - 1]?.gold ?? 0));
  const growth = stat(logs.map((log, i) => (windows[i] ? goldAt(log, windows[i]![1]) - goldAt(log, windows[i]![0] - 1) : null)));
  const surplus = (growth.median ?? 0) > t.goldSurplusDays * (incomePerDay.median ?? Infinity);

  const id = tierMaterials[tier - 1];
  const flow = (log: RunLog, window: [number, number] | null, index: 0 | 1) =>
    window ? sum(Object.entries(log.materialFlow).filter(([day]) => within(Number(day), window)).map(([, m]) => m[id]?.[index] ?? 0)) : null;
  const gathered = stat(logs.map((log, i) => flow(log, windows[i], 0)));
  const spent = stat(logs.map((log, i) => flow(log, windows[i], 1)));
  const share = stat(logs.map((log, i) => {
    const g = flow(log, windows[i], 0);
    const s = flow(log, windows[i], 1);
    return g ? (s ?? 0) / g : null;
  }));

  const end = stat(logs.map((log) => {
    const day = log.milestones[`boss:${tier}`];
    return day === undefined ? null : (log.daily[day - 1]?.topLevel ?? null);
  }));

  return {
    tier,
    days,
    odds: {
      prepared: { ...line(['normal'], (p) => p.prepared), actual: rate(normalRuns), runs: normalRuns.length, target: t.odds.prepared },
      unprepared: { ...line(['normal'], (p) => p.unprepared), actual: null, runs: 0, target: t.odds.unprepared },
      gap,
      boss: { ...line(['boss'], (p) => p.prepared), actual: rate(bossRuns), runs: bossRuns.length, target: t.odds.boss },
      events: { ...line(['event', 'patrol'], (p) => p.prepared), actual: rate(eventRuns), runs: eventRuns.length, target: t.odds.events },
    },
    gold: { income, spend, growth, incomePerDay, surplus },
    material: { id, gathered, spent, share },
    level: { end, target: expectedLevels[tier - 1] },
  };
}

function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + value(row);
  return out;
}

/** Stocks that grow at every tier end the game reached (at least three) and end above the pile-up line. */
function pileUps(log: RunLog, t: Targets) {
  const ends = TIERS.map((tier) => log.milestones[`boss:${tier}`]).filter((d): d is number => d !== undefined);
  if (!log.finished) ends.push(log.days);
  const stocks = ends.map((day) => log.daily[day - 1]).filter(Boolean).map((row) => ({ ...row.stock, ...row.consumables, ...row.valuables }));
  if (stocks.length < 3) return [];
  const ids = Object.keys(stocks.at(-1)!);
  return ids
    .filter((id) => stocks.every((s, i) => i === 0 || (s[id] ?? 0) > (stocks[i - 1][id] ?? 0)) && stocks.at(-1)![id] > t.pileUp)
    .map((id) => ({ id, final: stocks.at(-1)![id] }));
}

export function summarize(logs: RunLog[], t: Targets = defaultTargets): ProfileSummary {
  const profile = logs[0].profile;
  const tiers = TIERS.map((tier) => tierSummary(logs, tier, t));

  const designed = lootPacing();
  const loot =
    profile === 'regular'
      ? designed.map((row) => {
          const observed = (sum(logs.map((log) => (log.loot[row.category] ?? 0) / log.days)) / logs.length) * 7;
          return { category: row.category, column: row.column, designed: row.perWeek, observed, off: row.perWeek ? observed / row.perWeek - 1 : observed ? Infinity : 0 };
        })
      : [];

  const pile = new Map<string, number[]>();
  for (const log of logs) for (const p of pileUps(log, t)) pile.set(p.id, [...(pile.get(p.id) ?? []), p.final]);
  const pileList = [...pile.entries()].filter(([, finals]) => finals.length * 2 > logs.length).map(([id, finals]) => ({ id, final: stat(finals).median ?? 0 }));

  const carried = new Set(logs.flatMap((log) => log.expeditions.flatMap((e) => e.consumables)));
  const crafted = new Set(logs.flatMap((log) => log.crafts.map((c) => c.itemId)));
  const fielded = logs.flatMap((log) => log.expeditions.flatMap((e) => e.classes));
  const visited = new Set(logs.flatMap((log) => log.places.map((p) => p.kind)));
  const picked = new Set(logs.flatMap((log) => log.expeditions.map((e) => e.dungeonId)));
  const consumables = items.filter((i) => i.slot === 'consumable').map((i) => i.id);
  const spread = sumBy(fielded, (c) => c, () => 1);
  const keys = ['componentFound', 'componentForged', 'relicFound', 'relicRestored', 'firstKey', 'firstTip', 'secretPlace', 'charmCrafted'];

  return {
    profile,
    seeds: logs.length,
    finished: logs.filter((l) => l.finished).length,
    totalDays: stat(logs.map((l) => (l.finished ? l.days : null))),
    tiers,
    loot,
    health: {
      pileUps: pileList,
      dead: {
        items: consumables.filter((id) => !carried.has(id) && !crafted.has(id)),
        recipes: [...new Set(logs.flatMap((l) => l.knownRecipes))].filter((id) => !crafted.has(id)),
        classes: Object.keys(heroClasses).filter((c) => !(c in spread)),
        places: Object.keys(placeInfo).filter((k) => !visited.has(k)),
        dungeons: dungeons.filter((d) => !picked.has(d.id)).map((d) => d.id),
      },
      classSpread: Object.fromEntries(Object.entries(spread).map(([c, n]) => [c, n / Math.max(1, fielded.length)])),
      milestones: Object.fromEntries(keys.map((k) => [k, stat(logs.map((l) => l.milestones[k]))])),
      skipped: medianTotals(logs.map((l) => l.skipped)),
    },
  };
}

/** Every out-of-range result, with how far off it is (share of the range's nearest end), worst first. */
export function misses(summaries: ProfileSummary[]): { what: string; value: number; target: string; off: number }[] {
  const out: { what: string; value: number; target: string; off: number }[] = [];
  const check = (what: string, value: number | null, range: [number, number]) => {
    if (value === null || inRange(value, range)) return;
    const edge = value < range[0] ? range[0] : range[1];
    out.push({ what, value, target: `${+range[0].toFixed(2)}–${+range[1].toFixed(2)}`, off: Math.abs(value - edge) / Math.max(Math.abs(edge), 1e-9) });
  };
  for (const s of summaries) {
    for (const tier of s.tiers) {
      check(`${s.profile}: tier ${tier.tier} days`, tier.days.median, defaultTargets.daysPerTier[s.profile]);
      check(`${s.profile}: tier ${tier.tier} prepared odds`, tier.odds.prepared.probe.median, tier.odds.prepared.target);
      check(`${s.profile}: tier ${tier.tier} not prepared odds`, tier.odds.unprepared.probe.median, tier.odds.unprepared.target);
      check(`${s.profile}: tier ${tier.tier} boss odds`, tier.odds.boss.probe.median, tier.odds.boss.target);
      check(`${s.profile}: tier ${tier.tier} fight event and patrol odds`, tier.odds.events.probe.median, tier.odds.events.target);
    }
    for (const row of s.loot) check(`loot: ${row.column} per week`, row.observed, [row.designed * (1 - defaultTargets.lootPacing), row.designed * (1 + defaultTargets.lootPacing)]);
  }
  return out.sort((a, b) => b.off - a.off);
}
