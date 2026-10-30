import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { items } from '@/content/items';
import { tierMaterials } from '@/content/materials';
import { placeFightRules } from '@/content/placeFights';
import { placeInfo } from '@/content/places';
import { REVEAL_KINDS, type RevealKind } from '@/content/reveal';

import type { LootCategory, LootSourceId } from '../loot/types';
import { PATROL_KINDS, TRAVELLER_KINDS, type PatrolKind } from '../patrols/generate';
import type { ProbeRow, RunLog } from './bot';
import { expectedLevels, profiles } from './config';
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

/** One patrol or fight event kind: its probe line and the fights the bot took on. */
export type KindOdds = { id: string; line: OddsLine; fought: number; won: number };

export type TierSummary = {
  tier: number;
  days: Stat;
  odds: { prepared: OddsLine; unprepared: OddsLine; gap: Stat; boss: OddsLine; events: OddsLine; kinds: KindOdds[] };
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
  /** The day each map kind first showed, median over seeds; no target. */
  reveals: Record<RevealKind, Stat>;
  /** Regular profile only: designed vs observed weekly drops. */
  loot: { category: LootCategory; column: string; designed: number; observed: number; off: number }[];
  health: {
    pileUps: { id: string; final: number }[];
    dead: { items: string[]; recipes: string[]; places: string[]; dungeons: string[] };
    /** Classes the profile never saw, saw but never recruited, and recruited but never fielded. */
    classes: { neverOffered: string[]; offeredNeverRecruited: string[]; recruitedNeverFielded: string[] };
    /** Per class, over all seeds: offers seen, heroes recruited, party slots fielded. */
    classCounts: Record<string, { offered: number; recruited: number; fielded: number }>;
    classSpread: Record<string, number>;
    milestones: Record<string, Stat>;
    skipped: Record<string, number>;
  };
  /** The profile's planned visits per day next to the median over seeds of visits done per day. */
  visits: { activity: string; planned: number; done: Stat }[];
  /** Expeditions still owed at a day's start, per day median over seeds, by why the last session stopped. */
  notLaunched: Record<string, Stat>;
  /** Owed place visits that couldn't happen, per day median over seeds, by reason. */
  placesNotDone: Record<string, Stat>;
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
  const snapshot = (match: (p: ProbeRow) => boolean, value: (p: ProbeRow) => number | null, last: boolean) =>
    stat(
      logs.map((log) => {
        const rows = log.probes.filter((p) => p.tier === tier && match(p));
        if (!rows.length) return null;
        const at = last ? Math.max(...rows.map((p) => p.at)) : Math.min(...rows.map((p) => p.at));
        return mean(rows.filter((p) => p.at === at).map(value).filter((v): v is number => v !== null));
      }),
    );
  const line = (match: (p: ProbeRow) => boolean, value: (p: ProbeRow) => number | null) => ({
    probe: snapshot(match, value, true),
    start: snapshot(match, value, false),
  });
  const rate = (rows: { won: boolean }[]) => (rows.length ? rows.filter((r) => r.won).length / rows.length : null);
  const normalRuns = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && !e.boss && !e.overnight).map((e) => ({ won: e.success })));
  const bossRuns = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && e.boss).map((e) => ({ won: e.success })));
  const eventRuns = logs.flatMap((log) => [
    ...log.places.filter((p) => p.tier === tier && p.won !== null && p.kind !== 'thievesGuild').map((p) => ({ won: !!p.won })),
    ...log.patrols.fights.filter((f) => f.tier === tier).map((f) => ({ won: f.won })),
  ]);
  const gap = snapshot((p) => p.kind === 'normal', (p) => (p.unprepared === null ? null : p.prepared - p.unprepared), true);

  // Each patrol and fight event kind's own probe line and fight record.
  const kinds: KindOdds[] = ([...PATROL_KINDS, ...(Object.keys(placeFightRules.kinds) as (keyof typeof placeFightRules.kinds)[])] as string[]).map(
    (id) => {
      const patrol = (PATROL_KINDS as string[]).includes(id);
      const fought = logs.flatMap((log) =>
        patrol
          ? log.patrols.fights.filter((f) => f.tier === tier && f.kind === (id as PatrolKind)).map((f) => ({ won: f.won }))
          : log.places
              .filter((p) => p.tier === tier && p.kind === id && p.won !== null)
              .map((p) => ({ won: !!p.won })),
      );
      return {
        id,
        line: { ...line((p) => p.kind === (patrol ? 'patrol' : 'event') && p.id === id, (p) => p.prepared), actual: rate(fought), runs: fought.length, target: t.odds.events },
        fought: fought.length,
        won: fought.filter((f) => f.won).length,
      };
    },
  );

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
      prepared: { ...line((p) => p.kind === 'normal', (p) => p.prepared), actual: rate(normalRuns), runs: normalRuns.length, target: t.odds.prepared },
      unprepared: { ...line((p) => p.kind === 'normal', (p) => p.unprepared), actual: null, runs: 0, target: t.odds.unprepared },
      gap,
      boss: { ...line((p) => p.kind === 'boss', (p) => p.prepared), actual: rate(bossRuns), runs: bossRuns.length, target: t.odds.boss },
      events: {
        ...line((p) => p.kind === 'event' || p.kind === 'patrol', (p) => p.prepared),
        actual: rate(eventRuns),
        runs: eventRuns.length,
        target: t.odds.events,
      },
      kinds,
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

  // Classes by how far the profile got with them: offered (tavern, traveller, secret place), recruited, fielded.
  const allClasses = Object.keys(heroClasses);
  const offeredList = logs.flatMap((log) => Object.values(log.offered));
  const recruitedList = logs.flatMap((log) => log.recruits.map((r) => r.classId));
  const offered = new Set(offeredList);
  const recruited = new Set(recruitedList);
  const fieldedSet = new Set(fielded);
  const count = (list: string[], c: string) => list.filter((x) => x === c).length;
  const classCounts = Object.fromEntries(
    allClasses.map((c) => [c, { offered: count(offeredList, c), recruited: count(recruitedList, c), fielded: spread[c] ?? 0 }]),
  );
  const classes = {
    neverOffered: allClasses.filter((c) => !offered.has(c)),
    offeredNeverRecruited: allClasses.filter((c) => offered.has(c) && !recruited.has(c)),
    recruitedNeverFielded: allClasses.filter((c) => recruited.has(c) && !fieldedSet.has(c)),
  };

  // Each activity's planned visits per day against what the bot actually did.
  const placeSources: LootSourceId[] = [
    'banditCamp',
    'goblinRaid',
    'beastDen',
    'hauntedCrypt',
    'elementalRift',
    'abandonedCaravan',
    'wantedOutlaw',
    'monsterLair',
    'ruinsDig',
    'heist',
    'fishingDock',
  ];
  const perDay = (log: RunLog, done: (log: RunLog) => number) => (log.days > 0 ? done(log) / log.days : null);
  const visits = (
    [
      ['expeditions', (v) => (v.dungeonRun ?? 0) + (v.firstWin ?? 0) + (v.overnightExpedition ?? 0), (log) => log.expeditions.length],
      [
        'quests',
        (v) => (v.questShort ?? 0) + (v.questMedium ?? 0) + (v.questLong ?? 0),
        (log) => log.quests.claimed.short + log.quests.claimed.medium + log.quests.claimed.long,
      ],
      [
        'patrols',
        (v) => (v.patrolGoblins ?? 0) + (v.patrolHerd ?? 0) + (v.patrolBandits ?? 0),
        (log) => log.patrols.seen.filter((s) => (PATROL_KINDS as string[]).includes(s.kind)).length,
      ],
      ['travellers', (v) => v.traveller ?? 0, (log) => log.patrols.seen.filter((s) => (TRAVELLER_KINDS as string[]).includes(s.kind)).length],
      ['places', (v) => placeSources.reduce((sum, s) => sum + (v[s] ?? 0), 0), (log) => log.places.filter((p) => placeSources.includes(p.kind as LootSourceId)).length],
    ] as [string, (v: (typeof profiles)[string]['visits']) => number, (log: RunLog) => number][]
  ).map(([activity, planned, done]) => ({ activity, planned: planned(profiles[profile].visits), done: stat(logs.map((log) => perDay(log, done))) }));

  const byReason = (keys: string[], total: (log: RunLog, key: string) => number) =>
    Object.fromEntries(keys.map((key) => [key, stat(logs.map((log) => perDay(log, (l) => total(l, key))))]));
  const notLaunched = byReason(['noParty', 'hp', 'odds', 'noSession'], (log, key) => log.notLaunched[key] ?? 0);
  const placesNotDone = byReason(['nothing', 'odds', 'noParty', 'hidden'], (log, key) => log.placesNotDone[key] ?? 0);

  return {
    profile,
    seeds: logs.length,
    finished: logs.filter((l) => l.finished).length,
    totalDays: stat(logs.map((l) => (l.finished ? l.days : null))),
    tiers,
    reveals: Object.fromEntries(REVEAL_KINDS.map((kind) => [kind, stat(logs.map((l) => l.milestones[`reveal:${kind}`]))])) as Record<RevealKind, Stat>,
    loot,
    health: {
      pileUps: pileList,
      dead: {
        items: consumables.filter((id) => !carried.has(id) && !crafted.has(id)),
        recipes: [...new Set(logs.flatMap((l) => l.knownRecipes))].filter((id) => !crafted.has(id)),
        places: Object.keys(placeInfo).filter((k) => !visited.has(k)),
        dungeons: dungeons.filter((d) => !picked.has(d.id)).map((d) => d.id),
      },
      classes,
      classCounts,
      classSpread: Object.fromEntries(Object.entries(spread).map(([c, n]) => [c, n / Math.max(1, fielded.length)])),
      milestones: Object.fromEntries(keys.map((k) => [k, stat(logs.map((l) => l.milestones[k]))])),
      skipped: medianTotals(logs.map((l) => l.skipped)),
    },
    visits,
    notLaunched,
    placesNotDone,
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
