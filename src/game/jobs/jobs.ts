import { choiceOf, jobById, jobRules, jobs, type JobDef } from '@/content/jobs';

import { highestUnlockedTier } from '../dungeons/unlock';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import type { JobOutput, SaveData } from '../save';
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

/** The material a roll index becomes: fixed, weighted, or the job's chosen material. */
export function unitMaterial(save: SaveData, jobId: string, heroId: string, index: number): string {
  const produces = jobById[jobId].produces;
  if (typeof produces === 'string') return produces;
  if ('weights' in produces) {
    return createRng(`job|${jobId}|${heroId}|${index}`).weighted(Object.keys(produces.weights), (m) => produces.weights[m]);
  }
  const material = save.jobChoice[jobId];
  if (material === null || material === undefined) throw new Error(`Job ${jobId} has no chosen material`);
  return material;
}

/** Every material the job can produce, whatever shape its `produces` takes. */
export function jobMaterials(job: JobDef): string[] {
  const produces = job.produces;
  if (typeof produces === 'string') return [produces];
  if ('weights' in produces) return Object.keys(produces.weights);
  return produces.choice.map((option) => option.material);
}

/** The ore options a choice job has at the save's tier; empty for any other job. */
export function jobChoices(save: SaveData, jobId: string): string[] {
  const choice = choiceOf(jobById[jobId]);
  if (!choice) return [];
  const tier = highestUnlockedTier(save);
  return choice.filter((option) => option.fromTier <= tier).map((option) => option.material);
}

/** Whether the save's tier has opened the station yet. */
export const isJobOpen = (save: SaveData, jobId: string): boolean =>
  !!jobById[jobId] && highestUnlockedTier(save) >= jobById[jobId].opensAtTier;

/** The stations the save's tier has opened, in content order. */
export const openJobs = (save: SaveData): JobDef[] => jobs.filter((job) => isJobOpen(save, job.id));

/** The output a job holds once full. */
export const jobCap = (jobId: string) => jobById[jobId].ratePerHour * jobRules.capHours;

/** The amount an entry holds: its whole units plus the fraction of the next one. */
const totalOf = (entry: JobOutput | undefined) =>
  entry ? Object.values(entry.amounts).reduce((sum, amount) => sum + amount, 0) + entry.fraction : 0;

/** What the job produced since its output was last settled, at rate but only through the worker's working phases. */
export function jobProduced(save: SaveData, jobId: string, now: number): number {
  const worker = jobWorker(save, jobId);
  if (!worker) return 0;
  const entry = save.jobOutput[jobId];
  const amount = totalOf(entry);
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
  return totalOf(save.jobOutput[jobId]) + jobProduced(save, jobId, now);
}

export const isJobFull = (save: SaveData, jobId: string, now: number) => jobOutputNow(save, jobId, now) >= jobCap(jobId) - 1e-9;

/** The job's entry as of `now`: new whole units get their material rolled, the fraction keeps waiting. */
export function jobOutputDetail(save: SaveData, jobId: string, now: number): JobOutput {
  const entry = save.jobOutput[jobId];
  if (!entry) return { amounts: {}, fraction: 0, units: 0, since: now };
  const worker = jobWorker(save, jobId);
  const fraction = entry.fraction + jobProduced(save, jobId, now);
  // The epsilon keeps float error from swallowing a unit that was fully made.
  const made = Math.floor(fraction + 1e-9);
  const amounts = { ...entry.amounts };
  for (let i = 0; i < made && worker; i++) {
    const material = unitMaterial(save, jobId, worker.id, entry.units + i);
    amounts[material] = (amounts[material] ?? 0) + 1;
  }
  return { amounts, fraction: Math.max(0, fraction - made), units: entry.units + made, since: now };
}

/** Writes every job's output and every hero's energy as of `now`: output first, from the old energy state. */
export function settleJobs(save: SaveData, now: number): SaveData {
  const jobOutput = { ...save.jobOutput };
  for (const job of jobs) {
    if (!jobWorker(save, job.id) && !(job.id in jobOutput)) continue;
    jobOutput[job.id] = jobOutputDetail(save, job.id, now);
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

export type AssignProblem = 'away' | 'working' | 'taken' | 'unknown' | 'closed' | null;

/** Why the hero cannot take the job now, or null when they can. */
export function assignProblem(save: SaveData, heroId: string, jobId: string, now: number): AssignProblem {
  if (!jobById[jobId]) return 'unknown';
  if (!isJobOpen(save, jobId)) return 'closed';
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
  const withJob = {
    ...settled,
    heroes: settled.heroes.map((h) =>
      h.id === heroId ? { ...h, job: { jobId, since: now, tired: hero.energy.value <= 0 } } : h,
    ),
    jobOutput: jobId in settled.jobOutput ? settled.jobOutput : { ...settled.jobOutput, [jobId]: { amounts: {}, fraction: 0, units: 0, since: now } },
  };
  // A choice job starts on its highest unlocked material until the player picks one.
  const choices = jobChoices(settled, jobId);
  const current = settled.jobChoice[jobId];
  if (choices.length > 0 && (current === null || current === undefined)) {
    return { ...withJob, jobChoice: { ...settled.jobChoice, [jobId]: choices[choices.length - 1] } };
  }
  return withJob;
}

/** Sends the choice job's future units to `material`; units already made keep their old material. */
export function setJobChoice(save: SaveData, jobId: string, material: string, now: number): SaveData {
  if (!jobById[jobId] || !choiceOf(jobById[jobId])) throw new Error(`Job ${jobId} takes no choice`);
  if (!jobChoices(save, jobId).includes(material)) throw new Error(`Job ${jobId} cannot make ${material}`);
  const settled = settleJobs(save, now);
  return { ...settled, jobChoice: { ...settled.jobChoice, [jobId]: material } };
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
  const entry = settled.jobOutput[jobId];
  const whole = Object.entries(entry?.amounts ?? {}).filter(([, amount]) => amount > 0);
  if (whole.length === 0) return save;
  return {
    ...settled,
    materials: addMaterials(settled.materials, whole.map(([materialId, amount]) => ({ materialId, amount }))),
    jobOutput: { ...settled.jobOutput, [jobId]: { amounts: {}, fraction: entry!.fraction, units: entry!.units, since: now } },
  };
}
