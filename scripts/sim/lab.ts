import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RunLog } from '@/game/sim/bot';
import { BOT_RULES, profiles, simConfig } from '@/game/sim/config';
import { runSim } from '@/game/sim/engine';
import { oddsMatrix, type MatrixRow } from '@/game/sim/matrix';
import { milestoneMisses, summarize, type ProfileSummary } from '@/game/sim/metrics';
import { applyOverrides, parseOverride } from '@/game/sim/overrides';
import { measurePatrolRates, patrolCacheKey, type PatrolRates } from '@/game/sim/patrols';
import { spamCheck, type SpamCheck } from '@/game/sim/spam';
import { bossTarget, targets } from '@/game/sim/targets';
import { autoYieldRatio, measureWalkRates, PICKAXES, walkCacheKey, type WalkRates } from '@/game/sim/walking';
import { compare, type Comparison } from './compare';
import { craftsCsv, dailyCsv, expeditionsCsv } from './csv';
import { renderReport } from './report';

export type LabOptions = {
  profiles: string[];
  days: number;
  runs: number;
  seed: string;
  /** `path=value` strings. */
  overrides: string[];
  outDir: string;
  compareWith?: string;
  /** The odds matrix takes a while; tests skip it. */
  matrix?: boolean;
  /** Measured walk yields; read from (or written to) the cache when not given. */
  rates?: WalkRates;
  /** Measured patrol sighting rates; read from (or written to) the cache when not given. */
  patrolRates?: PatrolRates;
  cacheDir?: string;
  print?: (line: string) => void;
};

export type Summary = {
  settings: { profiles: string[]; days: number; runs: number; seed: string; overrides: string[]; walkEfficiency: number };
  profiles: Record<string, ProfileSummary>;
  oddsMatrix: MatrixRow[];
  /** Same 3 heroes on the shortest tier 1 dungeon vs rotating the roster. */
  spam: SpamCheck;
  /** Locked ore nodes seen on the measured walks, by pickaxes owned (see walking.ts). */
  nodes: WalkRates['nodes'];
  /** Auto-gather's yield ÷ tapping's on the same walks, per material, by pickaxes owned (0–5). */
  autoRatio: Record<string, number>[];
};

function walkRates(cacheDir: string, print: (line: string) => void): WalkRates {
  const file = path.join(cacheDir, `walk-${walkCacheKey()}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as WalkRates;
  print('Measuring walk yields (cached for next time)…');
  const rates = measureWalkRates();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rates));
  return rates;
}

function measuredPatrolRates(cacheDir: string, print: (line: string) => void): PatrolRates {
  const file = path.join(cacheDir, `patrol-${patrolCacheKey()}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as PatrolRates;
  print('Measuring patrol sighting rates (cached for next time)…');
  const rates = measurePatrolRates();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rates));
  return rates;
}

/** Runs every profile and seed, writes the report, CSVs and summary, and prints the headlines. */
export function runLab(options: LabOptions) {
  const print = options.print ?? console.log;
  const started = performance.now();
  for (const name of options.profiles) if (!profiles[name]) throw new Error(`Unknown profile ${name}`);
  const undo = applyOverrides(options.overrides.map(parseOverride));
  try {
    const rates = options.rates ?? walkRates(options.cacheDir ?? 'sim-output/.cache', print);
    const patrolRates = options.patrolRates ?? measuredPatrolRates(options.cacheDir ?? 'sim-output/.cache', print);
    const logs: RunLog[] = [];
    const summaries: Record<string, ProfileSummary> = {};
    for (const profile of options.profiles) {
      const runs = Array.from({ length: options.runs }, (_, i) =>
        runSim({ profile, days: options.days, seed: `${options.seed}-${i + 1}`, rates, patrolRates }),
      );
      logs.push(...runs);
      // The same seeds without traveller recruits, to measure how far they move the roster milestones.
      const withoutRecruits = simConfig.patrols.enabled
        ? Array.from({ length: options.runs }, (_, i) =>
            runSim({
              profile,
              days: options.days,
              seed: `${options.seed}-${i + 1}`,
              rates,
              patrolRates,
              config: { ...simConfig, patrols: { ...simConfig.patrols, travellerRecruits: false } },
            }),
          )
        : undefined;
      summaries[profile] = withoutRecruits ? summarize(runs, targets, withoutRecruits) : summarize(runs);
    }
    const summary: Summary = {
      settings: {
        profiles: options.profiles,
        days: options.days,
        runs: options.runs,
        seed: options.seed,
        overrides: options.overrides,
        walkEfficiency: simConfig.walk.efficiency,
      },
      profiles: summaries,
      oddsMatrix: options.matrix === false ? [] : oddsMatrix(),
      spam: spamCheck(),
      nodes: rates.nodes,
      autoRatio: PICKAXES.map((_, i) => i).concat(PICKAXES.length).map((pickaxes) => autoYieldRatio(rates, pickaxes)),
    };
    const comparison: Comparison | null = options.compareWith
      ? compare(JSON.parse(fs.readFileSync(options.compareWith, 'utf8')) as Summary, summary, targets.compareThreshold)
      : null;
    const elapsed = (performance.now() - started) / 1000;

    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(path.join(options.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(options.outDir, 'daily.csv'), dailyCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'expeditions.csv'), expeditionsCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'crafts.csv'), craftsCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'report.html'), renderReport({ summary, comparison, elapsed, rules: BOT_RULES, compareWith: options.compareWith ?? null }));

    printSummary(summary, comparison, print);
    print(`\n${logs.length} runs in ${elapsed.toFixed(1)} s → ${path.join(options.outDir, 'report.html')}`);
    return { summary, comparison, elapsed };
  } finally {
    undo();
  }
}

function printSummary(summary: Summary, comparison: Comparison | null, print: (line: string) => void) {
  const day = (value: number | null) => (value === null ? '—' : String(value));
  const one = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 1 });
  const total = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
  for (const [name, p] of Object.entries(summary.profiles)) {
    print(`\n${name} (${p.runs} runs × ${p.days} days)`);
    for (let tier = 1; tier <= 5; tier++) {
      const s = p.milestones[`boss:${tier}`];
      const [min, max] = bossTarget(tier, name);
      print(`  Tier ${tier} boss: day ${day(s?.median ?? null)} (${day(s?.p10 ?? null)}–${day(s?.p90 ?? null)}), target ${min}–${max}`);
    }
    const recruits = [4, 5, 6].map((n) => `${n}th day ${day(p.milestones[`recruit:${n}`]?.median ?? null)}`).join(', ');
    print(`  Recruits: ${recruits}. Gold held at the end: ${day(p.gold.final.median)}. Idle: ${Math.round(p.heroes.idleShare * 100)}%`);
    print(
      `  Overnight quests: ${p.expeditions.overnight.runsPerDay}/day, ${Math.round(p.expeditions.overnight.goldShare * 100)}% of gold, ${Math.round(
        p.expeditions.overnight.xpShare * 100,
      )}% of XP · daily blueprints: ${p.expeditions.blueprints}/run · walking bonus: ${Math.round(p.materials.bonusShare * 100)}% of materials`,
    );
    const misses = milestoneMisses(p);
    print(
      `  Auto-gather: ${Math.round((profiles[name]?.autoShare ?? 0) * 100)}% of walking time, ${Math.round(p.materials.autoShare * 100)}% of walking materials · milestones ${
        misses.length === 0 ? 'met ✓' : `missed ⚠ (${misses.length})`
      }`,
    );
    print(
      `  Patrols: ${one(total(p.patrols.seen))} met, ${one(total(p.patrols.engaged))} engaged (${one(total(p.patrols.won))} won), ${one(
        p.patrols.escort.fought,
      )} escort fights · ${Math.round(p.patrols.goldShare * 100)}% of gold from patrols`,
    );
    for (const w of p.warnings) print(`  ⚠ ${w}`);
  }
  const ratio = summary.autoRatio[summary.autoRatio.length - 1] ?? {};
  print(
    `\nAuto-gather ÷ tapping yield (all pickaxes): ${Object.entries(ratio)
      .map(([id, r]) => `${id} ${Math.round(r * 100)}%`)
      .join(', ')}`,
  );
  const { spam } = summary;
  print(
    `\nSpam check (${spam.dungeonId}, ${spam.hours} h): rotating earns ×${spam.ratio.xp} XP and ×${spam.ratio.gold} gold per hour of the same 3 heroes ${
      spam.ok ? '✓' : `⚠ (target ×${targets.spamAdvantage})`
    }`,
  );
  if (comparison) {
    print(`\nCompared with the previous run: ${comparison.changes.filter((c) => c.big).length} changes over ${targets.compareThreshold * 100}%`);
    for (const c of comparison.changes.filter((c) => c.big).slice(0, 15)) print(`  ${c.key}: ${c.before ?? '—'} → ${c.after ?? '—'}`);
    for (const w of comparison.warningsAdded) print(`  + ${w}`);
    for (const w of comparison.warningsRemoved) print(`  − ${w}`);
  }
}
