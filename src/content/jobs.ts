import type { ResourceKind } from '@/game/generation/types';

import { spawnConfig } from './spawnConfig';

/** Guild jobs: a hero at a station turns time into materials (see doc/design/jobs/README.md). */
export const jobRules = {
  /** Hours of work a station's output holds before it fills up. */
  capHours: 8,
  /** Hero energy: drained by work, regained by rest (see game/jobs/jobs.ts). */
  energy: { max: 100, drainHours: 24, restHours: 6 },
};

/** The outdoor gatherer: it gathers, around the player, the resource nodes the player can see on the map. */
export const gathererRules = {
  /**
   * The hero's walking pace between nodes, which sets how many it gathers: 4 trips an hour of half the
   * average of the wood and herb sight ranges ((300 + 100) / 2 / 2 × 4 = 400 m an hour).
   */
  heroWalkMetersPerMinute: ((spawnConfig.kinds.wood.visibilityMeters + spawnConfig.kinds.herb.visibilityMeters) / 2 / 2) * 4 / 60,
  /** Minutes spent gathering at a node, on top of the walk. */
  gatherMinutes: 3,
  /** At most one node every this many minutes: 4 an hour. */
  minMinutesPerNode: 15,
  /** A full output holds this much time at the pace: capHours × 60 ÷ minMinutesPerNode nodes. */
  capHours: 8,
  /** Chance per gathered node of a minor wound. */
  woundChancePerNode: 0.03,
  /** The share of max HP a wound costs. */
  woundHpShare: 0.15,
  /** The anchor history gets a new point once the player is this far from the last one… */
  anchorMoveMeters: 50,
  /** …and at least this long after it. */
  anchorEveryMinutes: 15,
  /** The resource kinds each focus prefers; with none of them in sight, the hero takes any. */
  focus: { wood: ['wood'], food: ['herb', 'animal'], ore: ['ore'] } as Record<'wood' | 'food' | 'ore', ResourceKind[]>,
};

/** What the gatherer looks for first: anything, or one focus of gathererRules.focus. */
export type GathererFocus = 'any' | keyof typeof gathererRules.focus;

/** One material, a weighted roll per unit, or — for the gatherer — whatever nodes it gathers (`nodes`). */
export type JobProduces = string | { weights: Record<string, number> } | { nodes: true };

export type JobDef = {
  id: string;
  name: string;
  /** A station hero works at the guild (absent) or the outdoor gatherer. */
  kind?: 'guild' | 'outdoor';
  /** What the station produces (see JobProduces). */
  produces: JobProduces;
  /** Units per hour of work. */
  ratePerHour: number;
  /** The dungeon tier the station opens at. */
  opensAtTier: number;
  /** Hours of work a full energy bar buys; the job Rules' default when absent. */
  drainHours?: number;
  /** The station's band icon. */
  emoji: string;
};

/** The outdoor gatherer; the guild's gathering stations left with the supply network's buildings (doc/design/supply-lines/replacements.md). */
export const jobs: JobDef[] = [
  {
    id: 'gatherer',
    name: 'Outdoor gatherer',
    kind: 'outdoor',
    produces: { nodes: true },
    ratePerHour: 0, // unused: the gatherer's output is the nodes it gathers
    opensAtTier: 1,
    drainHours: 16,
    emoji: '🎒',
  },
];

export const jobById: Record<string, JobDef> = Object.fromEntries(jobs.map((job) => [job.id, job]));
