import { jobById, jobRules, jobs } from '@/content/jobs';

import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { isAway } from '../team/team';
import type { HeroState } from '../types';

const HOUR = 3_600_000;

/** One energy cycle: a work phase of D hours, then a rest phase of R hours. */
const D = jobRules.energy.drainHours;
const R = jobRules.energy.restHours;
const C = D + R;
const MAX = jobRules.energy.max;
/** Energy lost per hour of work, and gained per hour of rest. */
const DRAIN = MAX / D;
const REST = MAX / R;

const mod = (x: number, m: number) => ((x % m) + m) % m;
const clampEnergy = (value: number) => Math.min(MAX, Math.max(0, value));

/** Where a worker sits in the cycle at `at` (hours): work 0..D, rest D..C, unrolled over whole cycles. */
function cycleAt(hero: HeroState, at: number) {
  const offset = hero.job?.tired ? D + hero.energy.value / REST : (MAX - hero.energy.value) / DRAIN;
  return offset + (at - hero.energy.at) / HOUR;
}

/** The absolute time of cycle position `x`. */
const timeOf = (hero: HeroState, x: number) => hero.energy.at + (x - cycleAt(hero, hero.energy.at)) * HOUR;

/** Work hours a worker puts in over `x` hours of the cycle, whole cycles via floor/modulo. */
const workDone = (x: number) => Math.floor(x / C) * D + Math.min(mod(x, C), D);

/** Energy now, worked out from the stored value and its timestamp: a worker cycles work and rest, anyone else rests. */
export function currentEnergy(save: SaveData, hero: HeroState, now: number): number {
  if (!hero.job) {
    const hours = Math.max(0, now - hero.energy.at) / HOUR;
    return clampEnergy(hero.energy.value + REST * hours);
  }
  const p = mod(cycleAt(hero, now), C);
  return clampEnergy(p < D ? MAX - p * DRAIN : (p - D) * REST);
}

/** Whether a worker's cycle position is in the tired (rest) phase. */
export function isTired(save: SaveData, hero: HeroState, now: number): boolean {
  return hero.job !== null && mod(cycleAt(hero, now), C) >= D;
}

/** The hero working `jobId`, if any. */
export const jobWorker = (save: SaveData, jobId: string): HeroState | undefined =>
  save.heroes.find((hero) => hero.job?.jobId === jobId);

/** The output a job holds once full. */
export const jobCap = (jobId: string) => jobById[jobId].ratePerHour * jobRules.capHours;

/** What the job produced since its output was last settled, at rate but only through the worker's working phases. */
export function jobProduced(save: SaveData, jobId: string, now: number): number {
  const worker = jobWorker(save, jobId);
  if (!worker) return 0;
  const entry = save.jobOutput[jobId];
  const amount = entry?.amount ?? 0;
  const room = jobCap(jobId) - amount;
  if (room <= 0) return 0;
  // Counted from the later of the output's and the worker's timestamps, both on the worker's cycle.
  const from = Math.max(entry?.since ?? now, worker.energy.at);
  if (now <= from) return 0;
  const produced = jobById[jobId].ratePerHour * (workDone(cycleAt(worker, now)) - workDone(cycleAt(worker, from)));
  return Math.min(Math.max(0, produced), room);
}

/** The output waiting at the job now, capped at the job's cap. */
export function jobOutputNow(save: SaveData, jobId: string, now: number): number {
  return (save.jobOutput[jobId]?.amount ?? 0) + jobProduced(save, jobId, now);
}

export const isJobFull = (save: SaveData, jobId: string, now: number) => jobOutputNow(save, jobId, now) >= jobCap(jobId) - 1e-9;

/** Writes every job's output and every hero's energy as of `now`: output first, from the old energy state. */
export function settleJobs(save: SaveData, now: number): SaveData {
  const jobOutput = { ...save.jobOutput };
  for (const job of jobs) {
    if (!jobWorker(save, job.id) && !(job.id in jobOutput)) continue;
    jobOutput[job.id] = { amount: jobOutputNow(save, job.id, now), since: now };
  }
  return {
    ...save,
    jobOutput,
    heroes: save.heroes.map((hero) => ({
      ...hero,
      job: hero.job ? { ...hero.job, tired: isTired(save, hero, now) } : null,
      energy: { value: currentEnergy(save, hero, now), at: now },
    })),
  };
}

/** When the output reaches the job's cap with the current worker's cycle, or null with no worker or already full. */
export function fullAt(save: SaveData, jobId: string, now: number): number | null {
  const worker = jobWorker(save, jobId);
  if (!worker || isJobFull(save, jobId, now)) return null;
  let need = (jobCap(jobId) - jobOutputNow(save, jobId, now)) / jobById[jobId].ratePerHour;
  let x = cycleAt(worker, now);
  for (;;) {
    const m = mod(x, C);
    // Resting: work starts again at the top of the cycle.
    if (m >= D) x += C - m;
    else if (need <= D - m) return timeOf(worker, x + need);
    else {
      need -= D - m;
      x += C - m;
    }
  }
}

/** When the worker's energy next reaches 0, or null with no job; a tired hero rests a full phase first. */
export function tiredAt(save: SaveData, hero: HeroState, now: number): number | null {
  if (!hero.job) return null;
  const x = cycleAt(hero, now);
  const m = mod(x, C);
  const zero = Math.floor(x / C) * C + D + (m >= D ? C : 0);
  return timeOf(hero, zero);
}

export type AssignProblem = 'away' | 'working' | 'taken' | 'unknown' | null;

/** Why the hero cannot take the job now, or null when they can. */
export function assignProblem(save: SaveData, heroId: string, jobId: string, now: number): AssignProblem {
  if (!jobById[jobId]) return 'unknown';
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero || isAway(save, heroId)) return 'away';
  if (hero.job) return 'working';
  if (jobWorker(save, jobId)) return 'taken';
  return null;
}

/** Puts the hero to work at the station: settled energy 0 sends them into the tired phase at once. */
export function assignJob(save: SaveData, heroId: string, jobId: string, now: number): SaveData {
  const problem = assignProblem(save, heroId, jobId, now);
  if (problem) throw new Error(`Cannot assign ${heroId} to ${jobId}: ${problem}`);
  const settled = settleJobs(save, now);
  const hero = settled.heroes.find((h) => h.id === heroId)!;
  return {
    ...settled,
    heroes: settled.heroes.map((h) =>
      h.id === heroId ? { ...h, job: { jobId, since: now, tired: hero.energy.value <= 0 } } : h,
    ),
    jobOutput: jobId in settled.jobOutput ? settled.jobOutput : { ...settled.jobOutput, [jobId]: { amount: 0, since: now } },
  };
}

/** Takes the hero off the job: their energy keeps its settled value, the output stays at the station. */
export function recallFromJob(save: SaveData, heroId: string, now: number): SaveData {
  const settled = settleJobs(save, now);
  const hero = settled.heroes.find((h) => h.id === heroId);
  if (!hero || !hero.job) throw new Error(`Cannot recall ${heroId} from a job`);
  return { ...settled, heroes: settled.heroes.map((h) => (h.id === heroId ? { ...h, job: null } : h)) };
}

/** Collects the job's output: whole units go to the materials, the fraction stays until the next collect. */
export function collectJob(save: SaveData, jobId: string, now: number): SaveData {
  if (!jobById[jobId]) throw new Error(`Unknown job ${jobId}`);
  const settled = settleJobs(save, now);
  const amount = settled.jobOutput[jobId]?.amount ?? 0;
  const whole = Math.floor(amount);
  if (whole <= 0) return save;
  return {
    ...settled,
    materials: addMaterials(settled.materials, [{ materialId: jobById[jobId].produces, amount: whole }]),
    jobOutput: { ...settled.jobOutput, [jobId]: { amount: amount - whole, since: now } },
  };
}
