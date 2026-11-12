import * as fs from 'node:fs';
import * as path from 'node:path';

import { dungeonFactors, patrolFactors, placeFactors } from '@/content/difficultyFactors';
import { bossById, mobById, patrolMobId, placeMobId } from '@/content/enemies';
import { dungeonById } from '@/content/lookup';
import { patrolRow, type PatrolDifficulty } from '@/content/patrols';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { difficultyRules, type Difficulty } from '@/content/difficulty';
import { ELEMENTS, type Element } from '@/game/elements';
import type { PatrolKind } from '@/game/patrols/generate';
import { tierChain } from '@/game/dungeons/unlock';
import { sourceOdds, type FitSource } from '@/game/sim/difficultyOdds';
import { targets } from '@/game/sim/targets';

const USAGE = `npm run sim:fit -- [options]
  --runs N    odds runs per estimate (default: 200)
  --steps N   bisection steps per source (default: 8)`;

function parse(argv: string[]) {
  const options = { runs: 200, steps: 8 };
  for (let i = 0; i < argv.length; i++) {
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return Number(next);
    };
    switch (argv[i]) {
      case '--runs': options.runs = value(); break;
      case '--steps': options.steps = value(); break;
      case '--help': console.log(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
    }
  }
  return options;
}

const options = parse(process.argv.slice(2));
const started = performance.now();
const DIFFICULTIES: PatrolDifficulty[] = ['easy', 'medium', 'hard'];
const ROLES = ['weak', 'normal', 'boss'] as const;

/** The tier bosses and the S key each is fitted under. */
const BOSSES = [
  { id: 'banditStockade', tier: 1, key: 'banditStockadeBoss' },
  { id: 'ogreQuarry', tier: 2, key: 'ogreQuarry' },
  { id: 'drownedCrypt', tier: 3, key: 'drownedCrypt' },
  { id: 'giantsHall', tier: 4, key: 'giantsHall' },
  { id: 'dragonLair', tier: 5, key: 'dragonLairBoss' },
];

/** One fitted source, with everything the bisection needs. */
type Job = {
  source: FitSource;
  label: string;
  tier: number;
  difficulty: Difficulty;
  /** The S key, patrol kind or place kind the factor is written under. */
  key: string;
  f0: number;
  /** The mob defs whose hp and damage the factor scales. */
  defs: { id: string; hp: number; damage: number }[];
};

/** The mob ids a patrol kind's or fight event kind's factor scales at a tier: every role, elite and element variant. */
function variantMobIds(prefix: 'patrol' | 'place', kind: string, tier: number, elemental: boolean): string[] {
  const elements: (Element | undefined)[] = elemental ? [...ELEMENTS] : [undefined];
  const id = (role: (typeof ROLES)[number], elite: boolean, element?: Element) =>
    prefix === 'patrol' ? patrolMobId(kind as PatrolKind, tier, role, elite, element) : placeMobId(kind as FightPlaceKind, tier, role, elite, element);
  return ROLES.flatMap((role) => [false, true].flatMap((elite) => elements.map((element) => id(role, elite, element))));
}

/** Every source the fit tunes, in the order the generated file lists them. */
function jobs(): Job[] {
  const out: Job[] = [];
  const bossOf = (id: string) => bossById[dungeonById[id].boss.id];
  for (const tier of [1, 2, 3, 4, 5]) {
    for (const dungeon of tierChain(tier).filter((d) => (d.chainIndex ?? 6) < 6)) {
      const fights = dungeon.encounters.filter((e) => e.type === 'fight').flatMap((e) => e.mobs.map((m) => m.mobId));
      out.push({
        source: { kind: 'dungeon', id: dungeon.id },
        label: dungeon.id,
        tier,
        difficulty: dungeon.difficulty,
        key: dungeon.id,
        f0: dungeonFactors[dungeon.id],
        defs: [...fights.map((id) => mobById[id]), dungeonById[dungeon.id].boss],
      });
    }
    for (const difficulty of DIFFICULTIES) {
      for (const kind of patrolRow(tier)[difficulty]) {
        out.push({
          source: { kind: 'patrol', patrolKind: kind },
          label: `patrol ${kind}`,
          tier,
          difficulty,
          key: kind,
          f0: patrolFactors[kind][tier - 1],
          defs: variantMobIds('patrol', kind, tier, kind === 'wyverns').map((id) => mobById[id]),
        });
      }
    }
  }
  for (const kind of Object.keys(placeFightRules.kinds) as FightPlaceKind[]) {
    for (const tier of [1, 2, 3, 4, 5]) {
      out.push({
        source: { kind: 'event', placeKind: kind },
        label: `event ${kind}`,
        tier,
        difficulty: placeFightRules.kinds[kind].difficulty,
        key: kind,
        f0: placeFactors[kind][tier - 1],
        defs: variantMobIds('place', kind, tier, kind === 'elementalRift').map((id) => mobById[id]),
      });
    }
  }
  // Ogre Quarry's, Drowned Crypt's and Giants' Hall's bosses share their S entry with their own encounter mobs; the tier 1 and 5 bosses have keys of their own.
  for (const { id, tier, key } of BOSSES) {
    const dungeon = dungeonById[id];
    out.push({
      source: { kind: 'boss', id },
      label: `boss ${id}`,
      tier,
      difficulty: 'boss',
      key,
      f0: dungeonFactors[key],
      defs: key === id ? [...dungeon.encounters.filter((e) => e.type === 'fight').flatMap((e) => e.mobs.map((m) => mobById[m.mobId])), bossOf(id)] : [bossOf(id)],
    });
  }
  return out;
}

/** Every mob stays fitted by at most one source; a second one keeps its mobs untouched. */
const claimed = new Map<string, string>();

const all = jobs().map((job) => {
  const defs = job.defs.filter((def) => {
    if (claimed.get(def.id) === job.label) return false;
    if (claimed.has(def.id)) {
      console.warn(`Warning: ${def.id} is already fitted by ${claimed.get(def.id)}; ${job.label} leaves it alone.`);
      return false;
    }
    claimed.set(def.id, job.label);
    return true;
  });
  return { ...job, defs, originals: defs.map((d) => ({ hp: d.hp, damage: d.damage })) };
});

/** Sets a source's mobs to a factor, relative to the factor they were built with. */
function scale(job: (typeof all)[number], factor: number) {
  job.defs.forEach((def, i) => {
    def.hp = Math.round((job.originals[i].hp * factor) / job.f0);
    def.damage = Math.round((job.originals[i].damage * factor) / job.f0);
  });
}

/** A source's target ranges: its difficulty's at the tier's end (and start, for easy); a boss's at its first attempts, measured with the tier's end kit. */
const rangesOf = (difficulty: Difficulty): { start: [number, number] | null; end: [number, number] } =>
  difficulty === 'boss' ? { start: null, end: targets.odds.boss } : difficultyRules.oddsTargets[difficulty];
const middle = ([min, max]: [number, number]) => (min + max) / 2;

/** The factor at which a source's odds at the tier's start or end meet `target`; a higher factor makes stronger mobs and lower odds. */
function bisect(job: (typeof all)[number], when: 'start' | 'end', target: number) {
  let lo = job.f0 / 4;
  let hi = job.f0 * 4;
  for (let step = 0; step < options.steps; step++) {
    const mid = Math.sqrt(lo * hi);
    scale(job, mid);
    if (sourceOdds(job.source, job.tier, when, options.runs) > target) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

type Result = {
  label: string;
  tier: number;
  difficulty: Difficulty;
  key: string;
  factor: number;
  /** The factors that alone would meet the start's and the end's targets. */
  forStart: number | null;
  forEnd: number;
  start: number | null;
  end: number;
};
const results: Result[] = [];

// One factor per source scales its enemies at both ends of the tier: the one
// that meets the start's target, kept within the factors that keep the end in
// its range (the end's middle for a boss). When the start can't be met that
// way, the end stays in range and the start comes as close as it can, except
// for the sources in START_FIRST: there the start's target wins, and the end
// lands where it lands (the fit table shows it).
const START_FIRST = new Set(tierChain(2).filter((d) => d.chainIndex === 0).map((d) => d.id));
for (const job of all) {
  const ranges = rangesOf(job.difficulty);
  const forEnd = bisect(job, 'end', middle(ranges.end));
  const forStart = ranges.start ? bisect(job, 'start', middle(ranges.start)) : null;
  let chosen = forEnd;
  if (forStart !== null) {
    const easiest = bisect(job, 'end', ranges.end[1]);
    const hardest = bisect(job, 'end', ranges.end[0]);
    chosen = START_FIRST.has(job.key) ? forStart : Math.min(hardest, Math.max(easiest, forStart));
  }
  const factor = Math.round(chosen * 100) / 100;
  scale(job, factor);
  const end = sourceOdds(job.source, job.tier, 'end', options.runs);
  const start = job.difficulty === 'boss' ? null : sourceOdds(job.source, job.tier, 'start', options.runs);
  results.push({ label: job.label, tier: job.tier, difficulty: job.difficulty, key: job.key, factor, forStart, forEnd, start, end });
  scale(job, job.f0);
}

/** One tier's factor for a kind it was not fitted at: the nearest fitted tier's. */
const nearest = (fitted: Map<number, number>, tier: number) =>
  fitted.get([...fitted.keys()].sort((a, b) => Math.abs(a - tier) - Math.abs(b - tier) || a - b)[0])!;

const round2 = (value: number) => Math.round(value * 100) / 100;
const writeFactors = () => {
  const chainIds = [1, 2, 3, 4, 5].flatMap((tier) => tierChain(tier).filter((d) => (d.chainIndex ?? 6) < 6).map((d) => d.id));
  const dungeonLines = [...chainIds, ...BOSSES.map((b) => b.key)].map((id) => `  ${id}: ${round2(results.find((r) => r.key === id)!.factor)},`);
  const patrolLines = (Object.keys(patrolFactors) as PatrolKind[]).map((kind) => {
    const fitted = new Map<number, number>();
    for (const result of results) if (result.key === kind) fitted.set(result.tier, result.factor);
    return `  ${kind}: [${[1, 2, 3, 4, 5].map((tier) => round2(nearest(fitted, tier))).join(', ')}],`;
  });
  const placeLines = (Object.keys(placeFightRules.kinds) as FightPlaceKind[]).map((kind) => {
    const fitted = new Map<number, number>();
    for (const result of results) if (result.key === kind) fitted.set(result.tier, result.factor);
    return `  ${kind}: [${[1, 2, 3, 4, 5].map((tier) => round2(nearest(fitted, tier))).join(', ')}],`;
  });
  const file = `// Generated by npm run sim:fit — do not edit by hand.
import type { FightPlaceKind } from '@/content/placeFights';
import type { PatrolKind } from '@/game/patrols/generate';

/**
 * Strength factors, fitted to the reference roster's win-odds targets (see
 * src/game/sim/difficultyOdds.ts and the fitting script scripts/sim/fitDifficulty.ts).
 */

/** Chain dungeons' S keys (src/content/enemies.ts), plus the tier bosses' keys. */
export const dungeonFactors: Record<string, number> = {
${dungeonLines.join('\n')}
};

/** One factor per tier for every patrol kind, whatever the tier it spawns in. */
export const patrolFactors: Record<PatrolKind, [number, number, number, number, number]> = {
${patrolLines.join('\n')}
};

/** One factor per tier for every fight event kind and the monster lair. */
export const placeFactors: Record<FightPlaceKind, [number, number, number, number, number]> = {
${placeLines.join('\n')}
};
`;
  fs.writeFileSync(path.resolve(process.cwd(), 'src/content/difficultyFactors.ts'), file);
};

const inRange = (value: number, [min, max]: [number, number]) => value >= min && value <= max;
const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const cell = (value: number | null, range: [number, number]) =>
  value === null ? '—' : `${pct(value)} ${inRange(value, range) ? '✓' : '✗'}`;
/** A start's odds, checked only where its difficulty has a start target. */
const startCell = (value: number | null, range: [number, number] | null) => (range ? cell(value, range) : pct(value));

// The curve: the start's factor over the end's. Below 1 the start party is too weak for one scale to fit both
// (the curve within the tier is too steep); above 1 too strong (too flat).
console.log('| source | tier | difficulty | factor | for start | for end | curve | start | end |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const ranges = rangesOf(r.difficulty);
  const curve = r.forStart === null ? '—' : (r.forStart / r.forEnd).toFixed(2);
  console.log(
    `| ${r.label} | ${r.tier} | ${r.difficulty} | ${r.factor} | ${r.forStart === null ? '—' : round2(r.forStart)} | ${round2(r.forEnd)} | ${curve} | ${startCell(r.start, ranges.start)} | ${cell(r.end, ranges.end)} |`,
  );
}

console.log('\n| tier | difficulty | start | end | curve (start factor / end factor) |');
console.log('| --- | --- | --- | --- | --- |');
for (const tier of [1, 2, 3, 4, 5]) {
  for (const difficulty of [...DIFFICULTIES, 'boss'] as Difficulty[]) {
    const rows = results.filter((r) => r.tier === tier && r.difficulty === difficulty);
    if (!rows.length) continue;
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const ranges = rangesOf(difficulty);
    const start = difficulty === 'boss' ? null : mean(rows.map((r) => r.start!));
    const curve = ranges.start ? mean(rows.map((r) => r.forStart! / r.forEnd)).toFixed(2) : '—';
    console.log(`| ${tier} | ${difficulty} | ${startCell(start, ranges.start)} | ${cell(mean(rows.map((r) => r.end)), ranges.end)} | ${curve} |`);
  }
}

writeFactors();
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s (${options.runs} runs, ${options.steps} steps per source)`);
