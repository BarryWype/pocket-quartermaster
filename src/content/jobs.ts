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

/**
 * One material, a weighted roll per unit, a player-picked material from an
 * unlock list, or — for the gatherer — whatever nodes it gathers (`nodes`).
 */
export type JobProduces =
  | string
  | { weights: Record<string, number> }
  | { choice: { material: string; fromTier: number }[] }
  | { nodes: true };

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

/** The ore list a choice job picks from, or undefined. */
export const choiceOf = (job: JobDef) => (typeof job.produces === 'object' && 'choice' in job.produces ? job.produces.choice : undefined);

/** Rate fitted to the simulator's regular profile: a full day of work makes 10–15% of the wood it spends per day. */
export const jobs: JobDef[] = [
  { id: 'woodcutter', name: 'Woodcutter', produces: 'wood', ratePerHour: 0.3, opensAtTier: 1, emoji: '🪓' },
  { id: 'forager', name: 'Forager', produces: { weights: { herb: 50, berries: 30, mushroom: 20 } }, ratePerHour: 0.3, opensAtTier: 1, emoji: '🧺' },
  { id: 'trapper', name: 'Trapper', produces: { weights: { meat: 45, hide: 35, bone: 20 } }, ratePerHour: 0.3, opensAtTier: 1, emoji: '🪤' },
  {
    id: 'miner',
    name: 'Miner',
    produces: { choice: [{ material: 'stone', fromTier: 2 }, { material: 'copper', fromTier: 3 }, { material: 'iron', fromTier: 4 }] },
    ratePerHour: 0.3,
    opensAtTier: 2,
    emoji: '⛏️',
  },
  { id: 'charcoalBurner', name: 'Charcoal burner', produces: 'coal', ratePerHour: 0.3, opensAtTier: 5, emoji: '🔥' },
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
