import * as fs from 'node:fs';
import * as path from 'node:path';
import { fork } from 'node:child_process';

import type { SaveData } from '@/game/save';
import { highestTier, type RunLog } from '@/game/sim/bot';
import { BOT_RULES, profiles } from '@/game/sim/config';
import { runSim } from '@/game/sim/engine';
import { summarize, type ProfileSummary, type Summary } from '@/game/sim/metrics';
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
  /** Games played at the same time, each in its own process (1: in this process, one after another). */
  workers?: number;
  /** Script forked per game when workers > 1. */
  workerScript?: string;
};

/** One game, sent to a worker process over IPC. */
type WorkerJob = { profile: string; index: number; seed: string; maxDays?: number; overrides: string[]; rates: WalkRates };

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

/** The per-game line printed once its log is in: finished or not, and the day each tier ended. */
function finishedLine(profile: string, index: number, log: RunLog) {
  const days = tierDays(log).map((d) => d ?? '—').join(' / ');
  return `${profile} seed ${index}: ${log.finished ? 'finished' : 'not finished'} in ${log.days} days; tiers end on days ${days}`;
}

/** An `afterDay` that prints one line per simulated week, elapsed since the game started. */
function weeklyProgress(profile: string, index: number, print: (line: string) => void) {
  const started = performance.now();
  return (day: number, save: SaveData) => {
    if (day % 7 === 0) print(`${profile} seed ${index}: day ${day}, tier ${highestTier(save)}, ${((performance.now() - started) / 1000).toFixed(1)} s`);
  };
}

/** Runs one job in a forked worker and resolves with its log. */
function forkJob(options: LabOptions, job: WorkerJob): Promise<RunLog> {
  return new Promise((resolve, reject) => {
    const child = fork(options.workerScript!, ['--worker'], { serialization: 'advanced', stdio: 'inherit' });
    let log: RunLog | undefined;
    child.on('message', (message: { log?: RunLog }) => {
      if (message?.log) log = message.log;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 || !log) reject(new Error(`${job.profile} seed ${job.index}: worker ${code === 0 ? 'sent no log' : `exited with code ${code}`}`));
      else resolve(log);
    });
    child.send(job);
  });
}

/** Runs every job in a worker process, at most `workers` at a time, and returns the logs in job order. */
async function forkJobs(options: LabOptions, jobs: WorkerJob[]): Promise<RunLog[]> {
  const logs: RunLog[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      logs[i] = await forkJob(options, jobs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.workers!, jobs.length) }, worker));
  return logs;
}

/** The worker side: plays the one job received over IPC, sends the log back, and exits. */
export function runWorker() {
  process.once('message', (job: WorkerJob) => {
    const undo = applyOverrides(job.overrides.map(parseOverride));
    let log: RunLog;
    try {
      log = runSim({ profile: job.profile, seed: job.seed, rates: job.rates, maxDays: job.maxDays, afterDay: weeklyProgress(job.profile, job.index, console.log) });
    } finally {
      undo();
    }
    process.send?.({ log }, () => process.exit(0));
  });
}

/** Plays every profile with every seed to the end of tier 5, writes the report, the summary and the CSVs, and prints the days per tier. */
export async function runLab(options: LabOptions) {
  const print = options.print ?? console.log;
  const started = performance.now();
  for (const name of options.profiles) if (!profiles[name]) throw new Error(`Unknown profile ${name}`);
  const undo = applyOverrides(options.overrides.map(parseOverride));
  try {
    const rates = options.rates ?? walkRates(options.cacheDir ?? 'sim-output/.cache', print);
    const jobs: WorkerJob[] = [];
    for (const profile of options.profiles)
      for (let i = 1; i <= options.seeds; i++) jobs.push({ profile, index: i, seed: `${options.seed}-${i}`, maxDays: options.maxDays, overrides: options.overrides, rates });
    let logs: RunLog[];
    if ((options.workers ?? 1) > 1) {
      if (!options.workerScript) throw new Error('workers > 1 needs a workerScript');
      logs = await forkJobs(options, jobs);
      for (let i = 0; i < jobs.length; i++) print(finishedLine(jobs[i].profile, jobs[i].index, logs[i]));
    } else {
      logs = jobs.map((job) => {
        const log = runSim({ profile: job.profile, seed: job.seed, rates, maxDays: job.maxDays, afterDay: weeklyProgress(job.profile, job.index, print) });
        print(finishedLine(job.profile, job.index, log));
        return log;
      });
    }
    const summaries: ProfileSummary[] = [];
    for (let i = 0; i < options.profiles.length; i++) summaries.push(summarize(logs.slice(i * options.seeds, (i + 1) * options.seeds)));
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
