import { dungeons } from '@/content/dungeons';
import { RARITIES, type Rarity } from '@/content/gear';
import { heroClasses } from '@/content/heroes';
import { dungeonById, itemById } from '@/content/lookup';
import { items } from '@/content/items';
import { jobs as jobList } from '@/content/jobs';
import { lootConfig } from '@/content/loot/config';
import { tierMaterials } from '@/content/materials';
import { placeFightRules } from '@/content/placeFights';
import { placeInfo } from '@/content/places';
import { REVEAL_KINDS, type RevealKind } from '@/content/reveal';
import { workToolRules } from '@/content/workTools';
import type { ClassSwap } from './classSwap';

import { jobMaterials } from '../jobs/jobs';
import type { LootCategory, LootSourceId } from '../loot/types';
import type { GearDef } from '../types';
import { PATROL_KINDS, TRAVELLER_KINDS, type PatrolKind } from '../patrols/generate';
import { families, type FamilyId } from '@/content/families';

import type { ExpeditionRow, ProbeRow, RunLog } from './bot';
import type { AffixRow, FocusRow } from './familyFocus';
import { expectedLevels, profiles } from './config';
import type { DifficultyOdds } from './difficultyOdds';
import { lootPacing } from './pacing';
import { rotationOf } from './rotation';
import { inRange, targets as defaultTargets, type Targets } from './targets';

const TIERS = [1, 2, 3, 4, 5];

/** The difficulties a threat gap is measured on. */
type GapDifficulty = keyof Targets['odds']['threatGap'];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

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

/** Probed odds at the tier's last probe (gear of the tier) and at the end of its first day, the launched runs' win rate, and the target. */
export type OddsLine = { probe: Stat; start: Stat; actual: number | null; runs: number; target: [number, number] };

/** One difficulty's normal expeditions: prepared odds at its first and last probe of the tier, the launched runs' win rate, and the targets. */
export type DifficultyLine = { start: Stat; end: Stat; actual: number | null; runs: number; target: { start: [number, number] | null; end: [number, number] } };

/** The tier boss: prepared odds at its first attempts (the probes on the day it first opens) and at its last probe, and its runs; the target is for the first attempts. */
export type BossLine = { first: Stat; last: Stat; actual: number | null; runs: number; target: [number, number] };

/** One patrol or fight event kind: its probe line and the fights the bot took on. */
export type KindOdds = { id: string; line: OddsLine; fought: number; won: number };

export type TierSummary = {
  tier: number;
  days: Stat;
  odds: {
    difficulty: Record<GapDifficulty | 'easy', DifficultyLine>;
    /** Prepared minus the briefing skipped at the tier's last probe, over its dungeons of the difficulty. */
    gap: Record<GapDifficulty, Stat>;
    boss: BossLine;
    events: OddsLine;
    kinds: KindOdds[];
  };
  gold: { income: Record<string, number>; spend: Record<string, number>; growth: Stat; incomePerDay: Stat; surplus: boolean };
  material: { id: string; gathered: Stat; spent: Stat; share: Stat };
  /** Wood per day over the tier: gathered by walking, spent, the woodcutter's output, and its share of the spend. */
  wood: { walked: Stat; spent: Stat; woodcutter: Stat; share: Stat };
  /** Every job's materials over the tier: gathered by walking, gathered at the job, and the job's share of the walk. */
  jobs: Record<string /* material */, { job: string; walked: Stat; fromJob: Stat; share: Stat }>;
  /**
   * Every station's work tool over the tier: the job's output per day with and
   * without the tool, the tool's scavenge per day, the walking intake of the
   * material, and the job's share of it.
   */
  tools: Record<string /* material */, { job: string; withTool: Stat; withoutTool: Stat; scavenge: Stat; walked: Stat; share: Stat }>;
  /** The gatherer's own output over the tier: its materials against the same walking intake as the guild jobs, and its nodes and wounds per day. */
  gatherer: { materials: Record<string, { walked: Stat; fromJob: Stat; share: Stat }>; nodes: Stat; wounds: Stat };
  /**
   * Gear over the tier: looted pieces by rarity (trinkets included, relics
   * apart) with their per-day rates, affixes per hero and the share of heroes
   * wearing a helmet at the tier's end, and the gear actions — rerolls (gold and materials), stones and
   * ingredient forges.
   */
  gear: {
    rarity: Record<Rarity, Stat>;
    relics: Stat;
    uncommonPerDay: Stat;
    rarePerDay: Stat;
    daysPerRare: Stat;
    affixes: Stat;
    helmets: Stat;
    rerolls: Stat;
    rerollGold: Stat;
    /** Material → median spent on rerolls over the tier (positive amounts). */
    rerollMaterials: Record<string, number>;
    stones: Stat;
    /** Stones applied before the tier's first day, per seed. */
    stonesBefore: Stat;
    forges: Stat;
  };
  /** Share of the roster's trinket slots holding loot trinkets, sampled daily and averaged over the tier. */
  lootTrinkets: Stat;
  /** The tier's party slots by class (share of the tier's slots, all seeds pooled). */
  slots: Record<string, number>;
  /** Median over seeds of each seed's median distinct heroes over the tier's complete weeks. */
  heroesPerWeek: Stat;
  level: { end: Stat; target: number };
};

/** Where gained pieces come from, in the report's order: every loot source and the shops, grouped. */
export const GEAR_SOURCE_GROUPS: [group: string, sources: (LootSourceId | 'shop')[]][] = [
  ['Dungeon runs', ['dungeonRun', 'firstWin', 'firstDungeonClear', 'overnightExpedition']],
  ['Bosses and elites', ['tierBoss', 'firstTierClear', 'monsterLair']],
  ['Patrols', ['patrol']],
  ['Fight events', ['banditCamp', 'goblinRaid', 'beastDen', 'hauntedCrypt', 'elementalRift', 'abandonedCaravan', 'wantedOutlaw']],
  ['Chests', ['stepChest', 'treasureSpot', 'fishingDock']],
  ['Quests', ['questShort', 'questMedium', 'questLong', 'secretQuest']],
  ['Sanctums', ['sanctum']],
  ['Shops', ['shop']],
  ['Other', ['traveller', 'ruinsDig', 'heist']],
];

/** One source's pieces per week (median over seeds); `source` is 'total' on the last row. */
export type GearSourceRow = { group: string; source: LootSourceId | 'shop' | 'total'; gear: Stat; trinkets: Stat; rare: Stat; legendary: Stat };

export type ProfileSummary = {
  profile: string;
  /** The Families report: what the bot's parties reached per tier (see familyTiers). */
  families: FamilyTier[];
  seeds: number;
  finished: number;
  totalDays: Stat;
  tiers: TierSummary[];
  /** The day each map kind first showed, median over seeds; no target. */
  reveals: Record<RevealKind, Stat>;
  /** Regular profile only: designed vs observed weekly drops. */
  loot: { category: LootCategory; column: string; designed: number; observed: number; off: number }[];
  /** Gear: the observed rarity split of looted pieces (relics apart) by the loot ladder their source rolls on. */
  ladders: { ladder: 'basic' | 'big' | 'boss'; drops: Stat; split: Record<Rarity, number> }[];
  /** Gear: pieces gained per week by source (gear and trinkets apart, Rares and Legendaries among them), the loot total (shops apart) last. */
  gearSources: GearSourceRow[];
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
  /**
   * Runs launched with at least one threat unanswered (full penalty), over
   * all seeds: their share of the runs launched and their win rate, next to
   * the win rate of all runs; `half` counts runs whose worst threat was half answered.
   */
  unanswered: { launched: number; runs: number; won: number; allWon: number; half: number; halfWon: number };
  /** Expeditions still owed at a day's start, per day median over seeds, by why the last session stopped. */
  notLaunched: Record<string, Stat>;
  /** Owed place visits that couldn't happen, per day median over seeds, by reason. */
  placesNotDone: Record<string, Stat>;
  /**
   * Rotation: the top class's share of party slots once the roster holds
   * `targets.rotation.roster` heroes (null for a seed that never got there),
   * and the fewest distinct heroes a complete week fields from
   * `targets.rotation.fromTier` on.
   */
  rotation: { topClass: string | null; topClassShare: Stat; fewestHeroesPerWeek: Stat };
};

/** What `npm run sim` writes to doc/design/simulator/summary.json, and the balance band tests read. */
export type Summary = {
  settings: { profiles: string[]; seeds: number; seed: string; overrides: string[]; maxDays: number | null; jobs: boolean };
  profiles: Record<string, ProfileSummary>;
  /** The reference roster's odds per tier and difficulty, measured once per run (see difficultyOdds.ts). */
  difficultyOdds: Record<number, DifficultyOdds>;
  /** The family probes, measured once per run (see familyFocus.ts). */
  familyProbes?: { focus: FocusRow[]; venom: AffixRow[] };
  /** Each class swapped into the fitted party, measured once per run (see classSwap.ts). */
  classProbe?: ClassSwap;
};

/** One tier of the Families report, from the bot's own runs. */
export type FamilyTier = {
  tier: number;
  /** The tier's dungeon runs (bosses and overnight runs apart), over all seeds. */
  runs: number;
  /** Per family the parties reached: the share of runs at level 1 or more, 2 or more, and 3. */
  reached: Partial<Record<FamilyId, [number, number, number]>>;
  /** Per threat in the briefings: runs that met it, half met it, or missed it. */
  threats: Record<string, { met: number; half: number; full: number }>;
  /** The probe's not-prepared party, in fixed natural gear (picked without regard to families): probes, and the share reaching level 2 or more, and 3. */
  natural: { probes: number; level2: number; level3: number };
  /**
   * Runs with Cunning 2 or more against the rest, on the same dungeons: their
   * share, the mean hours from launch to the end of the run and to the session
   * that collected it, and how much faster that cycle is (the runs a week it
   * allows), weighted by the Cunning runs; null without a pair.
   */
  cunning: { runs: number; share: number; hours: [number, number] | null; cycle: [number, number] | null; speedup: number | null };
  /** Trophies and blueprint overflow over the tier, per seed: drops, gold, monster parts, relics and stones, and drops a week. */
  trophies: { drops: Stat; gold: Stat; parts: Stat; relics: Stat; stones: Stat; perWeek: Stat };
};

/** The Families report's per-tier rows (see FamilyTier). */
export function familyTiers(logs: RunLog[]): FamilyTier[] {
  return TIERS.map((tier) => {
    const rows = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && !e.boss && !e.overnight));
    const share = (count: number) => (rows.length ? count / rows.length : 0);
    const reached: FamilyTier['reached'] = {};
    for (const family of families) {
      const levels = rows.map((r) => r.families?.[family.id] ?? 0);
      if (levels.every((l) => l === 0)) continue;
      reached[family.id] = [share(levels.filter((l) => l >= 1).length), share(levels.filter((l) => l >= 2).length), share(levels.filter((l) => l >= 3).length)];
    }
    const threats: FamilyTier['threats'] = {};
    for (const row of rows) {
      for (const part of row.threats.split(', ').filter(Boolean)) {
        const [id, , state] = part.split(' ');
        const t = (threats[id] ??= { met: 0, half: 0, full: 0 });
        if (state === 'met' || state === 'half' || state === 'full') t[state]++;
      }
    }
    const probes = logs.flatMap((log) => log.probes.filter((p) => p.tier === tier && p.kind === 'normal' && p.natural !== null && p.natural !== undefined));
    const natural = {
      probes: probes.length,
      level2: probes.length ? probes.filter((p) => p.natural! >= 2).length / probes.length : 0,
      level3: probes.length ? probes.filter((p) => p.natural! >= 3).length / probes.length : 0,
    };
    const cunning = (r: ExpeditionRow) => (r.families?.cunning ?? 0) >= 2;
    const paired = [...new Set(rows.filter(cunning).map((r) => r.dungeonId))].filter((id) => rows.some((r) => r.dungeonId === id && !cunning(r)));
    const avg = (values: number[]) => mean(values) ?? 0;
    const weighted = (pick: (r: ExpeditionRow) => number) => {
      let w = 0;
      let withSum = 0;
      let withoutSum = 0;
      for (const id of paired) {
        const on = rows.filter((r) => r.dungeonId === id && cunning(r));
        const off = rows.filter((r) => r.dungeonId === id && !cunning(r));
        w += on.length;
        withSum += avg(on.map(pick)) * on.length;
        withoutSum += avg(off.map(pick)) * on.length;
      }
      return w ? ([withSum / w, withoutSum / w] as [number, number]) : null;
    };
    const cycle = weighted((r) => r.cycleHours ?? r.hours);
    const windows = logs.map((log) => tierWindow(log, tier));
    const drops = (i: number) => (windows[i] ? logs[i].trophies.filter((t) => within(t.day, windows[i])) : null);
    const total = (pick: (t: RunLog['trophies'][number]) => number) => stat(logs.map((_, i) => drops(i)?.reduce((sum, t) => sum + pick(t), 0) ?? null));
    return {
      tier,
      runs: rows.length,
      reached,
      threats,
      natural,
      cunning: {
        runs: rows.filter(cunning).length,
        share: share(rows.filter(cunning).length),
        hours: weighted((r) => r.hours),
        cycle,
        speedup: cycle && cycle[0] > 0 ? cycle[1] / cycle[0] - 1 : null,
      },
      trophies: {
        drops: total(() => 1),
        gold: total((t) => t.gold),
        parts: total((t) => t.parts),
        relics: total((t) => t.relics),
        stones: total((t) => t.stones),
        perWeek: stat(logs.map((_, i) => (windows[i] ? ((drops(i)?.length ?? 0) / (windows[i]![1] - windows[i]![0] + 1)) * 7 : null))),
      },
    };
  });
}

/** Cunning 2 parties' speed-up over the whole game: the per-tier speed-ups weighted by their Cunning runs; null without any. */
export function cunningSpeedup(tiers: FamilyTier[]): number | null {
  const counted = tiers.filter((t) => t.cunning.speedup !== null && t.cunning.runs > 0);
  const runs = counted.reduce((sum, t) => sum + t.cunning.runs, 0);
  return runs ? counted.reduce((sum, t) => sum + t.cunning.speedup! * t.cunning.runs, 0) / runs : null;
}

/** Median of each key over seeds, of per-seed totals. */
function medianTotals(perSeed: Record<string, number>[]): Record<string, number> {
  const keys = [...new Set(perSeed.flatMap((r) => Object.keys(r)))];
  return Object.fromEntries(keys.map((k) => [k, stat(perSeed.map((r) => r[k] ?? 0)).median ?? 0]));
}

function tierSummary(logs: RunLog[], tier: number, t: Targets): Omit<TierSummary, 'slots' | 'heroesPerWeek'> {
  const windows = logs.map((log) => tierWindow(log, tier));
  const days = stat(logs.map((log, i) => (log.milestones[`boss:${tier}`] !== undefined && windows[i] ? windows[i]![1] - windows[i]![0] + 1 : null)));

  /** The mean of one probe snapshot in each game, over seeds: the tier's last, or the last of its first day (the start). */
  const snapshot = (match: (p: ProbeRow) => boolean, value: (p: ProbeRow) => number | null, last: boolean) =>
    stat(
      logs.map((log) => {
        const rows = log.probes.filter((p) => p.tier === tier && match(p));
        if (!rows.length) return null;
        const firstDay = Math.min(...rows.map((p) => p.day));
        const at = Math.max(...rows.filter((p) => last || p.day === firstDay).map((p) => p.at));
        return mean(rows.filter((p) => p.at === at).map(value).filter((v): v is number => v !== null));
      }),
    );
  const line = (match: (p: ProbeRow) => boolean, value: (p: ProbeRow) => number | null) => ({
    probe: snapshot(match, value, true),
    start: snapshot(match, value, false),
  });
  const rate = (rows: { won: boolean }[]) => (rows.length ? rows.filter((r) => r.won).length / rows.length : null);
  const normalRuns = (difficulty: string) =>
    logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && !e.boss && !e.overnight && dungeonById[e.dungeonId]?.difficulty === difficulty).map((e) => ({ won: e.success })));
  const bossRuns = logs.flatMap((log) => log.expeditions.filter((e) => e.tier === tier && e.boss).map((e) => ({ won: e.success })));
  const eventRuns = logs.flatMap((log) => [
    ...log.places.filter((p) => p.tier === tier && p.won !== null && p.kind !== 'thievesGuild').map((p) => ({ won: !!p.won })),
    ...log.patrols.fights.filter((f) => f.tier === tier).map((f) => ({ won: f.won })),
  ]);
  const ofDifficulty = (difficulty: string) => (p: ProbeRow) => p.kind === 'normal' && dungeonById[p.id]?.difficulty === difficulty;
  const difficulty = Object.fromEntries(
    DIFFICULTIES.map((d) => {
      const runs = normalRuns(d);
      const { start, probe: end } = line(ofDifficulty(d), (p) => p.prepared);
      return [d, { start, end, actual: rate(runs), runs: runs.length, target: t.odds.difficulty[d] }];
    }),
  ) as TierSummary['odds']['difficulty'];
  const gap = Object.fromEntries(
    (Object.keys(t.odds.threatGap) as GapDifficulty[]).map((d) => [d, snapshot(ofDifficulty(d), (p) => (p.unprepared === null ? null : p.prepared - p.unprepared), true)]),
  ) as TierSummary['odds']['gap'];
  // The boss's first attempts: its probes on the first day it is open (boss rows start when it opens).
  const bossFirst = stat(
    logs.map((log) => {
      const rows = log.probes.filter((p) => p.tier === tier && p.kind === 'boss');
      return rows.length ? mean(rows.filter((p) => p.day === rows[0].day).map((p) => p.prepared)) : null;
    }),
  );

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
  const flowOf = (log: RunLog, window: [number, number] | null, material: string, index: 0 | 1) =>
    window ? sum(Object.entries(log.materialFlow).filter(([day]) => within(Number(day), window)).map(([, m]) => m[material]?.[index] ?? 0)) : null;
  const flow = (log: RunLog, window: [number, number] | null, index: 0 | 1) => flowOf(log, window, id, index);
  const gathered = stat(logs.map((log, i) => flow(log, windows[i], 0)));
  const spent = stat(logs.map((log, i) => flow(log, windows[i], 1)));
  const share = stat(logs.map((log, i) => {
    const g = flow(log, windows[i], 0);
    const s = flow(log, windows[i], 1);
    return g ? (s ?? 0) / g : null;
  }));

  // Wood per day: what walking and the map brought in, what every sink spent, and the woodcutter's share of it.
  const perDay = (total: number | null, window: [number, number] | null) => (total === null || !window ? null : total / (window[1] - window[0] + 1));
  const jobFlowOfDay = (log: RunLog, window: [number, number] | null, jobId: string, material: string) =>
    window ? sum(Object.entries(log.jobFlow).filter(([day]) => within(Number(day), window)).map(([, jobs]) => jobs[jobId]?.[material] ?? 0)) : null;
  const jobFlowOf = (log: RunLog, window: [number, number] | null, material: string) =>
    window
      ? sum(Object.entries(log.jobFlow).filter(([day]) => within(Number(day), window)).map(([, jobs]) => sum(Object.values(jobs).map((m) => m[material] ?? 0))))
      : null;
  /** A material's scavenge over the window: what work tools took from won fights. */
  const scavengeOf = (log: RunLog, window: [number, number] | null, material: string) =>
    window ? sum(Object.entries(log.scavenge).filter(([day]) => within(Number(day), window)).map(([, m]) => m[material] ?? 0)) : null;
  /** A material's walking intake over the window: what everything but the jobs and the scavenge gathered of it. */
  const walkedOf = (log: RunLog, window: [number, number] | null, material: string) => {
    const gathered = flowOf(log, window, material, 0);
    const jobs = jobFlowOf(log, window, material);
    const scavenged = scavengeOf(log, window, material);
    return gathered !== null && jobs !== null && scavenged !== null ? gathered - jobs - scavenged : null;
  };
  const woodSeeds = logs.map((log, i) => {
    const window = windows[i];
    const spentWood = flowOf(log, window, 'wood', 1);
    const job = jobFlowOfDay(log, window, 'woodcutter', 'wood');
    const walked = walkedOf(log, window, 'wood');
    return {
      walked: perDay(walked, window),
      spent: perDay(spentWood, window),
      woodcutter: perDay(job, window),
      share: job !== null && spentWood ? job / spentWood : null,
    };
  });
  const wood = {
    walked: stat(woodSeeds.map((s) => s.walked)),
    spent: stat(woodSeeds.map((s) => s.spent)),
    woodcutter: stat(woodSeeds.map((s) => s.woodcutter)),
    share: stat(woodSeeds.map((s) => s.share)),
  };

  // Each job's materials over the tier: what the station added against the same material gathered by walking.
  const jobs = Object.fromEntries(
    jobList.flatMap((job) =>
      jobMaterials(job).map((material) => {
        const seeds = logs.map((log, i) => {
          const window = windows[i];
          const fromJob = jobFlowOfDay(log, window, job.id, material);
          const scavenged = scavengeOf(log, window, material);
          const walked = walkedOf(log, window, material);
          if (fromJob === null || walked === null) return { walked: null, fromJob: null, share: null };
          return {
            walked: perDay(walked, window),
            fromJob: perDay(fromJob, window),
            share: walked > 0 ? (fromJob + (scavenged ?? 0)) / walked : null,
          };
        });
        return [
          material,
          {
            job: job.name,
            walked: stat(seeds.map((s) => s.walked)),
            fromJob: stat(seeds.map((s) => s.fromJob)),
            share: stat(seeds.map((s) => s.share)),
          },
        ] as const;
      }),
    ),
  );

  // Each station's work tool over the tier: the job's output per day with the tool
  // (logged) and without it (the tool's bonus removed), its scavenge per day,
  // against the same walking intake as the guild jobs.
  const tools = Object.fromEntries(
    jobList
      .filter((job) => job.id !== 'gatherer')
      .flatMap((job) =>
        jobMaterials(job).map((material) => {
          const bonus = workToolRules.outputBonus[tier - 1];
          const seeds = logs.map((log, i) => {
            const window = windows[i];
            const withTool = jobFlowOfDay(log, window, job.id, material);
            const scavenged = scavengeOf(log, window, material);
            const walked = walkedOf(log, window, material);
            if (withTool === null || walked === null) return { withTool: null, withoutTool: null, scavenge: null, walked: null, share: null };
            const perDayWithTool = perDay(withTool, window);
            return {
              withTool: perDayWithTool,
              withoutTool: perDayWithTool !== null ? perDayWithTool / (1 + bonus) : null,
              scavenge: perDay(scavenged, window),
              walked: perDay(walked, window),
              share: walked > 0 ? (withTool + (scavenged ?? 0)) / walked : null,
            };
          });
          return [
            material,
            {
              job: job.name,
              withTool: stat(seeds.map((s) => s.withTool)),
              withoutTool: stat(seeds.map((s) => s.withoutTool)),
              scavenge: stat(seeds.map((s) => s.scavenge)),
              walked: stat(seeds.map((s) => s.walked)),
              share: stat(seeds.map((s) => s.share)),
            },
          ] as const;
        }),
      ),
  );

  // The gatherer: its nodes and wounds per day, and its own materials against the walking intake the guild jobs share.
  const gathererTotal = (log: RunLog, window: [number, number] | null, key: 'nodes' | 'wounds') =>
    window ? sum(Object.entries(log.gatherer).filter(([day]) => within(Number(day), window)).map(([, g]) => g[key])) : null;
  const gathererMaterials = [...new Set(logs.flatMap((log, i) => Object.entries(log.jobFlow)
    .filter(([day]) => within(Number(day), windows[i]))
    .flatMap(([, jobs]) => Object.keys(jobs.gatherer ?? {}))))];
  const gatherer = {
    materials: Object.fromEntries(
      gathererMaterials.map((material) => {
        const seeds = logs.map((log, i) => {
          const window = windows[i];
          const fromJob = jobFlowOfDay(log, window, 'gatherer', material);
          const walked = walkedOf(log, window, material);
          if (fromJob === null || walked === null) return { walked: null, fromJob: null, share: null };
          return {
            walked: perDay(walked, window),
            fromJob: perDay(fromJob, window),
            share: walked > 0 ? fromJob / walked : null,
          };
        });
        return [
          material,
          {
            walked: stat(seeds.map((s) => s.walked)),
            fromJob: stat(seeds.map((s) => s.fromJob)),
            share: stat(seeds.map((s) => s.share)),
          },
        ] as const;
      }),
    ),
    nodes: stat(logs.map((log, i) => perDay(gathererTotal(log, windows[i], 'nodes'), windows[i]))),
    wounds: stat(logs.map((log, i) => perDay(gathererTotal(log, windows[i], 'wounds'), windows[i]))),
  };

  const end = stat(logs.map((log) => {
    const day = log.milestones[`boss:${tier}`];
    return day === undefined ? null : (log.daily[day - 1]?.topLevel ?? null);
  }));

  // Gear over the tier: what was looted and what the bot did with it.
  const daysIn = (window: [number, number] | null) => (window ? window[1] - window[0] + 1 : null);
  const lootOf = (log: RunLog, window: [number, number] | null, match: (row: RunLog['gearLoot'][number]) => boolean) =>
    window ? log.gearLoot.filter((row) => within(row.day, window) && match(row)).length : null;
  const countOf = (match: (row: RunLog['gearLoot'][number]) => boolean) => stat(logs.map((log, i) => lootOf(log, windows[i], match)));
  const perDayOf = (match: (row: RunLog['gearLoot'][number]) => boolean) =>
    stat(logs.map((log, i) => {
      const days = daysIn(windows[i]);
      const count = lootOf(log, windows[i], match);
      return days !== null && count !== null ? count / days : null;
    }));
  const isGear = (row: RunLog['gearLoot'][number]) => row.rarity !== null;
  const rarityPerDay = (rarity: Rarity) => perDayOf((row) => isGear(row) && row.rarity === rarity);
  const rareCount = logs.map((log, i) => lootOf(log, windows[i], (row) => isGear(row) && row.rarity === 'rare'));
  const gear = {
    rarity: Object.fromEntries(RARITIES.map((rarity) => [rarity, countOf((row) => isGear(row) && row.rarity === rarity)])) as Record<Rarity, Stat>,
    relics: countOf((row) => !isGear(row)),
    uncommonPerDay: rarityPerDay('uncommon'),
    rarePerDay: rarityPerDay('rare'),
    daysPerRare: stat(logs.map((log, i) => {
      const days = daysIn(windows[i]);
      const rare = rareCount[i];
      return days !== null && rare !== null && rare > 0 ? days / rare : null;
    })),
    affixes: stat(logs.map((log) => {
      const day = log.milestones[`boss:${tier}`];
      return day === undefined ? null : (log.daily[day - 1]?.affixes ?? null);
    })),
    helmets: stat(logs.map((log) => {
      const day = log.milestones[`boss:${tier}`];
      return day === undefined ? null : (log.daily[day - 1]?.helmets ?? null);
    })),
    rerolls: stat(logs.map((log, i) => (windows[i] ? log.rerolls.filter((row) => within(row.day, windows[i])).length : null))),
    rerollGold: stat(logs.map((log, i) => (windows[i] ? sum(log.rerolls.filter((row) => within(row.day, windows[i])).map((row) => row.gold)) : null))),
    rerollMaterials: medianTotals(
      logs.map((log, i) => {
        const spent: Record<string, number> = {};
        for (const row of windows[i] ? log.rerolls.filter((row) => within(row.day, windows[i])) : [])
          for (const [id, amount] of Object.entries(row.materials)) spent[id] = (spent[id] ?? 0) + amount;
        return Object.fromEntries(Object.entries(spent).map(([id, amount]) => [id, -amount]));
      }),
    ),
    stones: stat(logs.map((log, i) => (windows[i] ? log.stones.filter((day) => within(day, windows[i])).length : null))),
    stonesBefore: stat(logs.map((log, i) => (windows[i] ? log.stones.filter((day) => day < windows[i]![0]).length : null))),
    forges: stat(logs.map((log, i) => (windows[i] ? log.crafts.filter((row) => row.kind === 'component' && within(row.day, windows[i])).length : null))),
  };

  return {
    tier,
    days,
    odds: {
      difficulty,
      gap,
      boss: { first: bossFirst, last: snapshot((p) => p.kind === 'boss', (p) => p.prepared, true), actual: rate(bossRuns), runs: bossRuns.length, target: t.odds.boss },
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
    wood,
    jobs,
    tools,
    gatherer,
    gear,
    lootTrinkets: stat(
      logs.map((log, i) =>
        windows[i] ? mean(log.daily.filter((row) => within(row.day, windows[i])).map((row) => row.lootTrinkets)) : null,
      ),
    ),
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
  const stocks = ends.map((day) => log.daily[day - 1]).filter(Boolean).map((row) => ({ ...row.stock, ...row.consumables }));
  if (stocks.length < 3) return [];
  const ids = Object.keys(stocks.at(-1)!);
  return ids
    .filter((id) => stocks.every((s, i) => i === 0 || (s[id] ?? 0) > (stocks[i - 1][id] ?? 0)) && stocks.at(-1)![id] > t.pileUp)
    .map((id) => ({ id, final: stocks.at(-1)![id] }));
}

export function summarize(logs: RunLog[], t: Targets = defaultTargets): ProfileSummary {
  const profile = logs[0].profile;
  const rotation = rotationOf(logs, t);
  const tiers = TIERS.map((tier) => ({ ...tierSummary(logs, tier, t), slots: rotation.tiers[tier]!.slots, heroesPerWeek: rotation.tiers[tier]!.heroesPerWeek }));

  const designed = lootPacing();
  const loot =
    profile === 'regular'
      ? designed.map((row) => {
          const observed = (sum(logs.map((log) => (log.loot[row.category] ?? 0) / log.days)) / logs.length) * 7;
          return { category: row.category, column: row.column, designed: row.perWeek, observed, off: row.perWeek ? observed / row.perWeek - 1 : observed ? Infinity : 0 };
        })
      : [];
  const { ladders: rarityLadders, ladderBySource } = lootConfig.gearRarity;
  const ladderOf = (source: LootSourceId) => ladderBySource[source] ?? 'basic';
  const ladderSummary = (Object.keys(rarityLadders) as ('basic' | 'big' | 'boss')[]).map((ladder) => {
    const perSeed = logs.map((log) => {
      const rows = log.gearLoot.filter((row) => row.rarity !== null && row.source !== 'shop' && ladderOf(row.source) === ladder);
      return { drops: rows.length, byRarity: Object.fromEntries(RARITIES.map((rarity) => [rarity, rows.filter((row) => row.rarity === rarity).length])) };
    });
    return {
      ladder,
      drops: stat(perSeed.map((seed) => seed.drops)),
      split: Object.fromEntries(RARITIES.map((rarity) => [rarity, stat(perSeed.map((seed) => (seed.drops ? seed.byRarity[rarity as Rarity] / seed.drops : null))).median ?? 0])) as Record<Rarity, number>,
    };
  });

  // Pieces per week by source; a trinket is told apart by its slot.
  const perWeek = (match: (row: RunLog['gearLoot'][number]) => boolean) =>
    stat(logs.map((log) => (log.days > 0 ? (log.gearLoot.filter((row) => row.rarity !== null && match(row)).length / log.days) * 7 : null)));
  const isTrinket = (row: RunLog['gearLoot'][number]) => (itemById[row.itemId!] as GearDef | undefined)?.slot === 'trinket';
  const sourceRow = (group: string, source: GearSourceRow['source'], of: (row: RunLog['gearLoot'][number]) => boolean): GearSourceRow => ({
    group,
    source,
    gear: perWeek((row) => of(row) && !isTrinket(row)),
    trinkets: perWeek((row) => of(row) && isTrinket(row)),
    rare: perWeek((row) => of(row) && row.rarity === 'rare'),
    legendary: perWeek((row) => of(row) && row.rarity === 'legendary'),
  });
  const gearSources = [
    ...GEAR_SOURCE_GROUPS.flatMap(([group, sources]) => sources.map((source) => sourceRow(group, source, (row) => row.source === source))),
    sourceRow('', 'total', (row) => row.source !== 'shop'),
  ].filter((row) => row.source === 'total' || row.gear.max || row.trinkets.max);

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
  const keys = ['componentFound', 'componentForged', 'relicFound', 'relicRestored', 'firstKey', 'firstTip', 'secretPlace'];

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
        (v) => v.patrol ?? 0,
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

  const runs = logs.flatMap((log) => log.expeditions);
  const missed = runs.filter((r) => / full(,|$)/.test(r.threats));
  const halfOnly = runs.filter((r) => !/ full(,|$)/.test(r.threats) && / half(,|$)/.test(r.threats));
  const wins = (list: typeof runs) => (list.length ? list.filter((r) => r.success).length / list.length : 0);
  const unanswered = { launched: runs.length, runs: missed.length, won: wins(missed), allWon: wins(runs), half: halfOnly.length, halfWon: wins(halfOnly) };
  return {
    profile,
    unanswered,
    families: familyTiers(logs),
    seeds: logs.length,
    finished: logs.filter((l) => l.finished).length,
    totalDays: stat(logs.map((l) => (l.finished ? l.days : null))),
    tiers,
    ladders: ladderSummary,
    gearSources,
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
    rotation: { topClass: rotation.topClass, topClassShare: rotation.topClassShare, fewestHeroesPerWeek: rotation.fewestHeroesPerWeek },
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
      for (const d of DIFFICULTIES) {
        const line = tier.odds.difficulty[d];
        if (line.target.start) check(`${s.profile}: tier ${tier.tier} ${d} odds at the start`, line.start.median, line.target.start);
        check(`${s.profile}: tier ${tier.tier} ${d} odds at the end`, line.end.median, line.target.end);
      }
      for (const [d, min] of Object.entries(defaultTargets.odds.threatGap)) check(`${s.profile}: tier ${tier.tier} ${d} threat gap`, tier.odds.gap[d as GapDifficulty].median, [min, 1]);
      check(`${s.profile}: tier ${tier.tier} boss odds at the first attempts`, tier.odds.boss.first.median, tier.odds.boss.target);
      check(`${s.profile}: tier ${tier.tier} fight event and patrol odds`, tier.odds.events.probe.median, tier.odds.events.target);
    }
    for (const row of s.loot) check(`loot: ${row.column} per week`, row.observed, [row.designed * (1 - defaultTargets.lootPacing), row.designed * (1 + defaultTargets.lootPacing)]);
  }
  return out.sort((a, b) => b.off - a.off);
}
