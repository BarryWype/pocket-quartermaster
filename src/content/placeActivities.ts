/**
 * PLACEHOLDER reward tables, replaced by the loot rework: rules for digging
 * ruins, thieves' guild heists and fishing docks.
 */
import type { Quality, ThreatId } from '@/game/types';
import type { ThreatState } from '@/game/threats/score';

export const ruinRules = {
  /** A dug ruin's replacement shows this many hours later. */
  respawnHours: 24,
  /** How long the replacement stays before moving on. */
  lifetimeHours: 72,
  /** How far from the dug spot the replacement grows. */
  replacementMeters: [300, 900] as [min: number, max: number],
  /** Digs between relics; the dig that reaches it pays one and resets. */
  relicEvery: 5,
  keyFragmentChance: 0.25,
  /** Stone every dig, plus this many nodes of ore the player's pickaxe covers. */
  loot: { stone: [2, 4] as [min: number, max: number], oreNodes: 1 },
  relicQuality: 'rare' as Quality,
  legendaryChance: 0.1,
};

export const heistRules = {
  minutes: [15, 30] as [min: number, max: number],
  threat: 'locked' as ThreatId,
  /** The Locked threat's level at each dungeon tier, 1-indexed by tier. */
  levelByTier: [1, 1, 2, 2, 3],
  successChance: { met: 0.9, half: 0.5, full: 0.1 } as Record<ThreatState, number>,
  reward: {
    /** Share of the tier's short dungeon gold; a gear piece comes instead at `gearChance`. */
    goldShareOfShort: 2.0,
    gearChance: 0.3,
  },
};

export const dockRules = {
  fish: [3, 5] as [min: number, max: number],
  /** A dock only works while water is within this many metres. */
  waterMeters: 250,
};
