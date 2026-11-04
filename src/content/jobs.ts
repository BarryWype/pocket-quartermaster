/** Guild jobs: a hero at a station turns time into materials (see doc/design/jobs/README.md). */
export const jobRules = {
  /** Hours of work a station's output holds before it fills up. */
  capHours: 8,
  /** Hero energy: drained by work, regained by rest (see game/jobs/jobs.ts). */
  energy: { max: 100, drainHours: 24, restHours: 6 },
};

export type JobDef = {
  id: string;
  name: string;
  /** The material the station produces. */
  produces: string;
  /** Units per hour of work. */
  ratePerHour: number;
  /** The station's band icon. */
  emoji: string;
};

/** Rate fitted to the simulator's regular profile: a full day of work makes 10–15% of the wood it spends per day. */
export const jobs: JobDef[] = [{ id: 'woodcutter', name: 'Woodcutter', produces: 'wood', ratePerHour: 0.3, emoji: '🪓' }];

export const jobById: Record<string, JobDef> = Object.fromEntries(jobs.map((job) => [job.id, job]));
