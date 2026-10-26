import type { MaterialStack } from '@/game/types';
import { formatPercent, t } from '@/i18n';

export type GuildBuildingId = 'warRoom' | 'treasury' | 'barracks';

export type GuildTrackId =
  | 'heroXp'
  | 'fasterExpeditions'
  | 'betterRetreats'
  | 'scouting'
  | 'partySlot'
  | 'gold'
  | 'mainRewards'
  | 'shards'
  | 'stepChests'
  | 'sigilCap'
  | 'tavernDiscount'
  | 'tavernOffer'
  | 'training'
  | 'rosterSlot7'
  | 'rosterSlot8';

export type GuildTrack = {
  id: GuildTrackId;
  building: GuildBuildingId;
  name: string;
  ranks: number;
  /** The effect at a rank, e.g. 0.1 per rank for +10%. See `game/guild/guild.ts` for how each is used. */
  perRank: number;
  /** Rank 1 cost; each rank after costs `rules.costMultiplier` times more. */
  baseCost: number;
  /** ⭐ Milestones also cost a charter and ask for confirmation. */
  milestone?: boolean;
  /** Tier whose boss must be beaten for rank 1 (single-rank tracks); ranked tracks use `rules.rankGates`. */
  gate?: number;
  /** A track that must be maxed first. */
  requires?: GuildTrackId;
  /** "+20% XP", for rank 0 → max. */
  describe: (rank: number) => string;
};

export const guildBuildings: Record<GuildBuildingId, { name: string; emoji: string }> = {
  warRoom: { name: 'War room', emoji: '🗺️' },
  treasury: { name: 'Treasury', emoji: '💰' },
  barracks: { name: 'Barracks', emoji: '🛏️' },
};

const pct = formatPercent;

export const guildTracks: GuildTrack[] = [
  // War room
  { id: 'heroXp', building: 'warRoom', name: 'Hero XP', ranks: 4, perRank: 0.1, baseCost: 150, describe: (r) => t('guildTracks.heroXp', { percent: pct(r * 0.1) }) },
  { id: 'fasterExpeditions', building: 'warRoom', name: 'Faster expeditions', ranks: 3, perRank: 0.1, baseCost: 250, describe: (r) => t('guildTracks.fasterExpeditions', { percent: pct(r * 0.1) }) },
  { id: 'betterRetreats', building: 'warRoom', name: 'Better retreats', ranks: 3, perRank: 0.15, baseCost: 80, describe: (r) => t('guildTracks.betterRetreats', { percent: pct(r * 0.15) }) },
  { id: 'scouting', building: 'warRoom', name: 'Scouting report', ranks: 1, perRank: 1, baseCost: 400, gate: 1, describe: (r) => t(r ? 'guildTracks.scoutingOn' : 'guildTracks.scoutingOff') },
  { id: 'partySlot', building: 'warRoom', name: 'Extra party slot', ranks: 1, perRank: 1, baseCost: 3000, milestone: true, gate: 3, describe: (r) => t('guildTracks.partySlot', { count: 3 + r }) },
  // Treasury
  { id: 'gold', building: 'treasury', name: 'Gold', ranks: 4, perRank: 0.1, baseCost: 100, describe: (r) => t('guildTracks.gold', { percent: pct(r * 0.1) }) },
  { id: 'mainRewards', building: 'treasury', name: 'Main rewards', ranks: 3, perRank: 0.1, baseCost: 50, describe: (r) => t('guildTracks.mainRewards', { percent: pct(r * 0.1) }) },
  { id: 'shards', building: 'treasury', name: 'Shards', ranks: 3, perRank: 1, baseCost: 200, gate: 1, describe: (r) => t('guildTracks.shards', { count: r }) },
  { id: 'stepChests', building: 'treasury', name: 'Step chests', ranks: 3, perRank: 1, baseCost: 100, describe: (r) => t('guildTracks.stepChests', { count: r }) },
  { id: 'sigilCap', building: 'treasury', name: 'Sigil cap', ranks: 1, perRank: 1, baseCost: 2500, milestone: true, gate: 3, describe: (r) => t('guildTracks.sigilCap', { count: 3 + r }) },
  // Barracks
  { id: 'tavernDiscount', building: 'barracks', name: 'Tavern discount', ranks: 3, perRank: 0.1, baseCost: 120, describe: (r) => t('guildTracks.tavernDiscount', { percent: pct(r * 0.1) }) },
  { id: 'tavernOffer', building: 'barracks', name: 'Extra tavern offer', ranks: 1, perRank: 1, baseCost: 500, gate: 1, describe: (r) => t('guildTracks.tavernOffer', { count: 3 + r }) },
  { id: 'training', building: 'barracks', name: 'Training', ranks: 3, perRank: 2, baseCost: 250, describe: (r) => t('guildTracks.training', { count: r * 2 }) },
  { id: 'rosterSlot7', building: 'barracks', name: 'Roster slot 7', ranks: 1, perRank: 1, baseCost: 1200, milestone: true, gate: 2, describe: (r) => t('guildTracks.roster', { count: 6 + r }) },
  { id: 'rosterSlot8', building: 'barracks', name: 'Roster slot 8', ranks: 1, perRank: 1, baseCost: 4000, milestone: true, gate: 4, requires: 'rosterSlot7', describe: (r) => t('guildTracks.roster', { count: 7 + r }) },
];

export const guildRules = {
  /** The Guild Hall opens with the taverns. */
  unlockedBy: 'banditStockade',
  /** Cost of rank r = baseCost × costMultiplier^(r − 1), rounded to `roundTo` (or `roundToLarge` from 1,000). */
  costMultiplier: 1.8,
  roundTo: 10,
  roundToLarge: 50,
  /** Tier whose boss must be beaten for each rank of a ranked track (index 0 = rank 1; 0 = when the hall opens). */
  rankGates: [0, 1, 2, 3],
  /** Materials on top of gold, by rank. */
  rankMaterials: { 3: [{ materialId: 'stone', amount: 15 }], 4: [{ materialId: 'copper', amount: 10 }] } as Partial<
    Record<number, MaterialStack[]>
  >,
  charters: {
    /** Charters a milestone costs. */
    perMilestone: 1,
    /** Chance of a charter on each Sanctum win. */
    sanctumWinChance: 0.1,
  },
  /** Training credits at most this many hours per absence. */
  trainingMaxHours: 24,
};

export const guildTrackById = Object.fromEntries(guildTracks.map((t) => [t.id, t])) as Record<GuildTrackId, GuildTrack>;
