import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RunLog } from '@/game/sim/bot';
import { profiles } from '@/game/sim/config';
import { runSim } from '@/game/sim/engine';
import { applyOverrides, parseOverride } from '@/game/sim/overrides';
import { measureWalkRates, walkCacheKey, type WalkRates } from '@/game/sim/walking';
import { craftsCsv, dailyCsv, expeditionsCsv } from './csv';

export type LabOptions = {
  profiles: string[];
  seeds: number;
  seed: string;
  /** `path=value` strings. */
  overrides: string[];
  /** Where the CSVs go. */
  outDir: string;
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

/** Plays every profile with every seed to the end of tier 5, writes the CSVs and prints the days per tier. */
export function runLab(options: LabOptions) {
  const print = options.print ?? console.log;
  const started = performance.now();
  for (const name of options.profiles) if (!profiles[name]) throw new Error(`Unknown profile ${name}`);
  const undo = applyOverrides(options.overrides.map(parseOverride));
  try {
    const rates = options.rates ?? walkRates(options.cacheDir ?? 'sim-output/.cache', print);
    const logs: RunLog[] = [];
    for (const profile of options.profiles) {
      for (let i = 1; i <= options.seeds; i++) {
        const log = runSim({ profile, seed: `${options.seed}-${i}`, rates, maxDays: options.maxDays });
        logs.push(log);
        const days = tierDays(log).map((d) => d ?? '—').join(' / ');
        print(`${profile} seed ${i}: ${log.finished ? 'finished' : 'not finished'} in ${log.days} days; tiers end on days ${days}`);
      }
    }
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(path.join(options.outDir, 'daily.csv'), dailyCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'expeditions.csv'), expeditionsCsv(logs));
    fs.writeFileSync(path.join(options.outDir, 'crafts.csv'), craftsCsv(logs));
    const elapsed = (performance.now() - started) / 1000;
    print(`\n${logs.length} games in ${elapsed.toFixed(1)} s → ${options.outDir}`);
    return { logs, elapsed };
  } finally {
    undo();
  }
}
