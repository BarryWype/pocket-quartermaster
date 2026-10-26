import { dungeons } from '@/content/dungeons';
import { guildRules, guildTracks } from '@/content/guild';
import type { Quality } from '@/game/types';

import { rankCost, rankGate } from '../guild/guild';
import { QUALITY_ORDER, type RunLog } from './bot';
import { bossTarget, targets as defaultTargets, type Targets } from './targets';

/** Median and 10th–90th percentiles across runs; null where a run never got there. */
export type Stat = { median: number | null; p10: number | null; p90: number | null; reached: number };
export type Point = { day: number; median: number; p10: number; p90: number };

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const value = sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  return Number.isFinite(value) ? value : null;
}

/** Runs that never got there count as later than any that did. */
export function stat(values: (number | undefined)[]): Stat {
  const sorted = values.map((v) => v ?? Infinity).sort((a, b) => a - b);
  return { median: percentile(sorted, 0.5), p10: percentile(sorted, 0.1), p90: percentile(sorted, 0.9), reached: values.filter((v) => v !== undefined).length };
}

const median = (values: number[]) => percentile([...values].sort((a, b) => a - b), 0.5) ?? 0;
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function series(logs: RunLog[], days: number, value: (log: RunLog, day: number) => number): Point[] {
  return Array.from({ length: days }, (_, i) => {
    const sorted = logs.map((log) => value(log, i + 1)).sort((a, b) => a - b);
    return { day: i + 1, median: round(percentile(sorted, 0.5)!), p10: round(percentile(sorted, 0.1)!), p90: round(percentile(sorted, 0.9)!) };
  });
}

const sumBy = <T>(items: T[], key: (item: T) => string, value: (item: T) => number) => {
  const totals: Record<string, number> = {};
  for (const item of items) totals[key(item)] = (totals[key(item)] ?? 0) + value(item);
  return totals;
};

/** The median over runs of each key's total, for keys any run has. */
function medianTotals(perRun: Record<string, number>[]) {
  const keys = [...new Set(perRun.flatMap((totals) => Object.keys(totals)))].sort();
  return Object.fromEntries(keys.map((k) => [k, round(median(perRun.map((totals) => totals[k] ?? 0)))]));
}

const dayTier = (log: RunLog, day: number) => log.daily[day - 1]?.tier ?? 1;

export type ProfileSummary = {
  profile: string;
  runs: number;
  days: number;
  milestones: Record<string, Stat>;
  gold: {
    held: Point[];
    final: Stat;
    /** Median run totals by source and sink. */
    income: Record<string, number>;
    spend: Record<string, number>;
    /** Median per day, by source and sink. */
    incomePerDay: { day: number; values: Record<string, number> }[];
    spendPerDay: { day: number; values: Record<string, number> }[];
    /** Median gold per day while each tier was the highest, by source. */
    perDayByTier: Record<number, Record<string, number>>;
  };
  heroes: { roster: Point[]; avgLevel: Point[]; maxLevel: Point[]; idle: Point[]; idleShare: number };
  materials: {
    gathered: Record<string, number>;
    used: Record<string, number>;
    final: Record<string, number>;
    gatheredBySource: Record<string, Record<string, number>>;
    neverUsed: string[];
    /** The material most often missing for a forge, by tier. */
    bottleneck: Record<number, string | null>;
  };
  crafting: {
    forgesPerTier: Record<number, number>;
    /** Share of each quality among forged pieces, by tier. */
    quality: Record<number, Record<Quality, number>>;
    mastery: Record<string, Point[]>;
    salvageReturned: Record<string, number>;
    /** Share of each quality among worn pieces at boss attempts, by tier. */
    bossQuality: Record<number, Record<Quality, number> & { attempts: number }>;
  };
  expeditions: {
    perDungeon: Record<string, { tier: number; runs: number; predicted: number; actual: number; outcomes: Record<string, number> }>;
    /** Times each ability changed an encounter, median per run. */
    effects: Record<string, number>;
    sanctums: { attempts: number; wins: number };
  };
  guild: {
    /** Median gold per day while playing a tier, from the runs, and what a rank pays back. */
    paybacks: { track: string; rank: number; cost: number; tier: number; days: number | null }[];
    buildings: Record<string, Stat>;
  };
  warnings: string[];
};

/** Days for each gold and main-reward rank to earn back its cost, at the tier it opens, from the income the runs measured. */
function measuredPaybacks(perDayByTier: ProfileSummary['gold']['perDayByTier']) {
  const gain = {
    gold: (income: Record<string, number>) => (income.dungeon ?? 0) * 0.1,
    mainRewards: (income: Record<string, number>) => ((income.pouch ?? 0) + (income.treasure ?? 0)) * 0.1,
  };
  return guildTracks.flatMap((track) => {
    const perDay = gain[track.id as keyof typeof gain];
    if (!perDay) return [];
    return Array.from({ length: track.ranks }, (_, i) => {
      const rank = i + 1;
      const tier = Math.min(5, Math.max(1, rankGate(track, rank, guildRules)) + 1);
      const cost = rankCost(track, rank);
      const income = perDayByTier[tier];
      const daily = income ? perDay(income) : 0;
      return { track: track.id, rank, cost, tier, days: daily > 0 ? round(cost / daily, 1) : null };
    });
  });
}

export function summarize(logs: RunLog[], targets: Targets = defaultTargets): ProfileSummary {
  const { profile, days } = logs[0];
  const keys = [...new Set(logs.flatMap((log) => Object.keys(log.milestones)))].sort();
  const milestones = Object.fromEntries(keys.map((k) => [k, stat(logs.map((log) => log.milestones[k]))]));

  const perDay = (entries: (log: RunLog) => { day: number; key: string; amount: number }[]) =>
    Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      values: medianTotals(logs.map((log) => sumBy(entries(log).filter((e) => e.day === i + 1), (e) => e.key, (e) => e.amount))),
    }));
  const incomeOf = (log: RunLog) => log.goldIn.map((g) => ({ day: g.day, key: g.source, amount: g.amount }));
  const spendOf = (log: RunLog) => log.goldOut.map((g) => ({ day: g.day, key: g.sink, amount: g.amount }));

  const perDayByTier: Record<number, Record<string, number>> = {};
  for (let tier = 1; tier <= 5; tier++) {
    const perRun = logs.flatMap((log) => {
      const tierDays = log.daily.filter((d) => d.tier === tier).length;
      if (!tierDays) return [];
      const totals = sumBy(log.goldIn.filter((g) => dayTier(log, g.day) === tier), (g) => g.source, (g) => g.amount);
      return [Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / tierDays]))];
    });
    if (perRun.length) perDayByTier[tier] = medianTotals(perRun);
  }

  // Materials.
  const gathered = medianTotals(logs.map((log) => Object.fromEntries(Object.entries(log.gathered).map(([m, s]) => [m, Object.values(s).reduce((a, b) => a + b, 0)]))));
  const used = medianTotals(logs.map((log) => Object.fromEntries(Object.entries(log.used).map(([m, s]) => [m, Object.values(s).reduce((a, b) => a + b, 0)]))));
  const final = medianTotals(logs.map((log) => log.daily.at(-1)?.stock ?? {}));
  const gatheredBySource = Object.fromEntries(
    Object.keys(gathered).map((m) => [m, medianTotals(logs.map((log) => log.gathered[m] ?? {}))]),
  );
  const bottleneck: Record<number, string | null> = {};
  for (let tier = 1; tier <= 5; tier++) {
    const missing = medianTotals(logs.map((log) => log.missing[tier] ?? {}));
    bottleneck[tier] = Object.entries(missing).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  // Crafting.
  const forged = logs.flatMap((log) => log.crafts.filter((c) => c.quality && c.kind !== 'salvage'));
  const forgesPerTier: Record<number, number> = {};
  const quality: Record<number, Record<Quality, number>> = {};
  for (let tier = 1; tier <= 5; tier++) {
    const ofTier = forged.filter((c) => c.tier === tier);
    if (!ofTier.length) continue;
    forgesPerTier[tier] = round(ofTier.length / logs.length, 1);
    quality[tier] = Object.fromEntries(QUALITY_ORDER.map((q) => [q, round(ofTier.filter((c) => c.quality === q).length / ofTier.length)])) as Record<Quality, number>;
  }
  const masteryTypes = [...new Set(logs.flatMap((log) => Object.keys(log.daily[0]?.mastery ?? {})))];
  const mastery = Object.fromEntries(masteryTypes.map((t) => [t, series(logs, days, (log, day) => log.daily[day - 1]?.mastery[t] ?? 1)]));
  const salvageReturned = medianTotals(logs.map((log) => Object.fromEntries(Object.entries(log.gathered).map(([m, s]) => [m, s.salvage ?? 0]))));
  const bossQuality: ProfileSummary['crafting']['bossQuality'] = {};
  for (let tier = 1; tier <= 5; tier++) {
    const attempts = logs.flatMap((log) => log.expeditions.filter((e) => e.boss && e.tier === tier));
    if (!attempts.length) continue;
    const pieces = QUALITY_ORDER.map((q) => attempts.reduce((s, e) => s + e.qualities[q], 0));
    const total = pieces.reduce((a, b) => a + b, 0) || 1;
    bossQuality[tier] = { ...(Object.fromEntries(QUALITY_ORDER.map((q, i) => [q, round(pieces[i] / total)])) as Record<Quality, number>), attempts: round(attempts.length / logs.length, 1) };
  }

  // Expeditions.
  const all = logs.flatMap((log) => log.expeditions);
  const perDungeon: ProfileSummary['expeditions']['perDungeon'] = {};
  for (const id of [...new Set(all.map((e) => e.dungeonId))]) {
    const runs = all.filter((e) => e.dungeonId === id);
    perDungeon[id] = {
      tier: runs[0].tier,
      runs: round(runs.length / logs.length, 1),
      predicted: round(runs.reduce((s, e) => s + e.odds, 0) / runs.length),
      actual: round(runs.filter((e) => e.success).length / runs.length),
      outcomes: sumBy(runs, (e) => e.outcome, () => 1),
    };
  }
  const effects = medianTotals(logs.map((log) => {
    const totals: Record<string, number> = {};
    for (const e of log.expeditions) for (const [k, n] of Object.entries(e.effects)) totals[k] = (totals[k] ?? 0) + n;
    return totals;
  }));
  const sanctumRuns = logs.flatMap((log) => log.sanctums);

  const summary: ProfileSummary = {
    profile,
    runs: logs.length,
    days,
    milestones,
    gold: {
      held: series(logs, days, (log, day) => log.daily[day - 1]?.gold ?? 0),
      final: stat(logs.map((log) => log.daily.at(-1)?.gold ?? 0)),
      income: medianTotals(logs.map((log) => sumBy(log.goldIn, (g) => g.source, (g) => g.amount))),
      spend: medianTotals(logs.map((log) => sumBy(log.goldOut, (g) => g.sink, (g) => g.amount))),
      incomePerDay: perDay(incomeOf),
      spendPerDay: perDay(spendOf),
      perDayByTier,
    },
    heroes: {
      roster: series(logs, days, (log, day) => log.daily[day - 1]?.roster ?? 0),
      avgLevel: series(logs, days, (log, day) => log.daily[day - 1]?.avgLevel ?? 0),
      maxLevel: series(logs, days, (log, day) => log.daily[day - 1]?.maxLevel ?? 0),
      idle: series(logs, days, (log, day) => log.daily[day - 1]?.idle ?? 0),
      idleShare: round(median(logs.map((log) => log.daily.reduce((s, d) => s + d.idle, 0) / log.daily.length))),
    },
    materials: {
      gathered,
      used,
      final,
      gatheredBySource,
      neverUsed: Object.keys(gathered).filter((m) => gathered[m] >= targets.unusedStockpile && !(used[m] > 0)),
      bottleneck,
    },
    crafting: { forgesPerTier, quality, mastery, salvageReturned, bossQuality },
    expeditions: {
      perDungeon,
      effects,
      sanctums: { attempts: round(sanctumRuns.length / logs.length, 1), wins: round(sanctumRuns.filter((s) => s.win).length / logs.length, 1) },
    },
    guild: {
      paybacks: measuredPaybacks(perDayByTier),
      buildings: Object.fromEntries(['warRoom', 'treasury', 'barracks'].map((b) => [b, stat(logs.map((log) => log.milestones[`building:${b}`]))])),
    },
    warnings: [],
  };
  summary.warnings = warnings(summary, logs, targets);
  return summary;
}

/** Gold held above `goldPileDays` days of income for more than `goldPileStreak` days in a row; the first day it happens, or null. */
function goldPileDay(log: RunLog, targets: Targets) {
  let streak = 0;
  for (const row of log.daily) {
    if (row.day < 4) continue;
    const recent = log.goldIn.filter((g) => g.day > row.day - 3 && g.day <= row.day).reduce((s, g) => s + g.amount, 0) / 3;
    streak = recent > 0 && row.gold > targets.goldPileDays * recent ? streak + 1 : 0;
    if (streak > targets.goldPileStreak) return row.day;
  }
  return null;
}

function warnings(summary: ProfileSummary, logs: RunLog[], targets: Targets): string[] {
  const out: string[] = [];
  const { profile, days } = summary;
  for (let tier = 1; tier <= 5; tier++) {
    const [min, max] = bossTarget(tier, profile, targets);
    const day = summary.milestones[`boss:${tier}`]?.median ?? null;
    if (day === null && max <= days) out.push(`Tier ${tier} boss not beaten within ${days} days (target day ${min}–${max}).`);
    else if (day !== null && (day < min || day > max)) out.push(`Tier ${tier} boss first beaten on day ${day} (target ${min}–${max}).`);
  }
  const piles = logs.map((log) => goldPileDay(log, targets)).filter((d) => d !== null);
  if (piles.length * 2 >= logs.length) {
    out.push(`Gold piles up: more than ${targets.goldPileDays} days of income held for over ${targets.goldPileStreak} days in a row in ${piles.length}/${logs.length} runs (from about day ${median(piles)}).`);
  }
  if (summary.heroes.idleShare > targets.idleShare) out.push(`Heroes are left idle in ${Math.round(summary.heroes.idleShare * 100)}% of sessions.`);
  for (const m of summary.materials.neverUsed) out.push(`${m}: ${summary.materials.gathered[m]} gathered, never used.`);
  for (const p of summary.guild.paybacks) {
    if (p.days !== null && (p.days < targets.paybackDays[0] || p.days > targets.paybackDays[1])) {
      out.push(`Guild Hall ${p.track} rank ${p.rank} (${p.cost} gold) pays back in ${p.days} days at tier ${p.tier} (target ${targets.paybackDays.join('–')}).`);
    }
  }
  // Dungeons of tiers every run reached at least 3 days before the end.
  const reached = Math.min(...logs.map((log) => log.daily[Math.max(0, days - 4)]?.tier ?? 1));
  for (const d of dungeons.filter((d) => d.tier <= reached && !summary.expeditions.perDungeon[d.id])) {
    out.push(`${d.name} (tier ${d.tier}) was never picked.`);
  }
  for (const [tier, q] of Object.entries(summary.crafting.bossQuality)) {
    if (q.crappy > targets.crappyAtBoss) out.push(`Tier ${tier} boss attempted with ${Math.round(q.crappy * 100)}% Crappy gear.`);
  }
  return out;
}
