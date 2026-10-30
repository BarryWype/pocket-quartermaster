import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RunLog } from '@/game/sim/bot';
import { BOT_RULES, profiles } from '@/game/sim/config';
import { runSim } from '@/game/sim/engine';
import { summarize, type ProfileSummary } from '@/game/sim/metrics';
import { applyOverrides, parseOverride } from '@/game/sim/overrides';
import { measureWalkRates, walkCacheKey, type WalkRates } from '@/game/sim/walking';
import { craftsCsv, dailyCsv, expeditionsCsv } from './csv';
import { renderReport } from './report';

export type LabOptions = {
  profiles: string[];
  seeds: number;
  seed: string;
  /** `path=value` strings. */
  overrides: string[];
  /** Where the CSVs go. */
  outDir: string;
  /** Where report.md and summary.json go, overwritten each run. */
  reportDir: string;
  /** Stops every game earlier than its profile's day cap. */
  maxDays?: number;
  /** Measured walk yields; read from (or written to) the cache when not given. */
  rates?: WalkRates;
  cacheDir?: string;
  print?: (line: string) => void;
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

/** Day each tier ended (its boss first beaten), or null. */
const tierDays = (log: RunLog) => [1, 2, 3, 4, 5].map((tier) => log.milestones[`boss:${tier}`] ?? null);

export type Summary = {
  settings: { profiles: string[]; seeds: number; seed: string; overrides: string[]; maxDays: number | null };
  profiles: Record<string, ProfileSummary>;
};

/** Plays every profile with every seed to the end of tier 5, writes the report, the summary and the CSVs, and prints the days per tier. */
export function runLab(options: LabOptions) {
  const print = options.print ?? console.log;
  const started = performance.now();
  for (const name of options.profiles) if (!profiles[name]) throw new Error(`Unknown profile ${name}`);
  const undo = applyOverrides(options.overrides.map(parseOverride));
  try {
    const rates = options.rates ?? walkRates(options.cacheDir ?? 'sim-output/.cache', print);
    const logs: RunLog[] = [];
    const summaries: ProfileSummary[] = [];
    for (const profile of options.profiles) {
      const runs: RunLog[] = [];
      for (let i = 1; i <= options.seeds; i++) {
        const log = runSim({ profile, seed: `${options.seed}-${i}`, rates, maxDays: options.maxDays });
        runs.push(log);
        const days = tierDays(log).map((d) => d ?? '—').join(' / ');
        print(`${profile} seed ${i}: ${log.finished ? 'finished' : 'not finished'} in ${log.days} days; tiers end on days ${days}`);
      }
      logs.push(...runs);
      summaries.push(summarize(runs));
    }
    const summary: Summary = {
      settings: { profiles: options.profiles, seeds: options.seeds, seed: options.seed, overrides: options.overrides, maxDays: options.maxDays ?? null },
      profiles: Object.fromEntries(summaries.map((s) => [s.profile, s])),
    };
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(path.join(options.outDir, 'daily.csv'), dailyCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'expeditions.csv'), expeditionsCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'crafts.csv'), craftsCsv(logs));
    const elapsed = (performance.now() - started) / 1000;
    const date = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(options.reportDir, { recursive: true });
    fs.writeFileSync(path.join(options.reportDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(
      path.join(options.reportDir, 'report.md'),
      renderReport({ summaries, rules: BOT_RULES, settings: { seeds: options.seeds, seed: options.seed, overrides: options.overrides, elapsed, date } }),
    );
    print(`\n${logs.length} games in ${elapsed.toFixed(1)} s → ${path.join(options.reportDir, 'report.md')} (CSVs in ${options.outDir})`);
    return { logs, summary, elapsed };
  } finally {
    undo();
  }
}
