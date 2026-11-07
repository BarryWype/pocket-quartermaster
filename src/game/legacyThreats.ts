import type { ThreatId } from './types';

/**
 * The seven threats of the families rework, and what each old threat id became
 * when it was merged into them. Read by the save migration and nothing else;
 * Locals was removed outright, so it maps to nothing.
 */
export const LEGACY_THREAT_MAP: Partial<Record<string, ThreatId>> = {
  holy: 'holy',
  beasts: 'beasts',
  darkness: 'darkness',
  traps: 'traps',
  poison: 'poison',
  element: 'element',
  armoured: 'armoured',
  undead: 'holy',
  desecrated: 'holy',
  swarm: 'beasts',
  ambush: 'darkness',
  thieves: 'traps',
  rubble: 'traps',
  locked: 'traps',
  puzzle: 'traps',
  maze: 'traps',
  casters: 'element',
  underwater: 'element',
  brute: 'armoured',
};
