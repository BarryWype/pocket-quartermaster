/** Rules for digging ruins, thieves' guild heists and fishing docks; what they pay is their loot matrix row. */
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
  /** Until relics exist, the relic dig pays a gear piece of the player's tier at this quality, sometimes Legendary. */
  relicQuality: 'rare' as Quality,
  legendaryChance: 0.1,
};

export const heistRules = {
  minutes: [15, 30] as [min: number, max: number],
  threat: 'locked' as ThreatId,
  /** The Locked threat's level at each dungeon tier, 1-indexed by tier. */
  levelByTier: [1, 1, 2, 2, 3],
  successChance: { met: 0.9, half: 0.5, full: 0.1 } as Record<ThreatState, number>,
};

export const dockRules = {
  /** A dock only works while water is within this many metres. */
  waterMeters: 250,
};
