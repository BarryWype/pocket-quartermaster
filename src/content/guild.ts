import { formatPercent, t } from '@/i18n';

export type GuildBuildingId = 'warRoom' | 'treasury' | 'barracks' | 'questBoard' | 'workshop';

export type GuildTrackId =
  | 'heroXp'
  | 'fasterExpeditions'
  | 'betterRetreats'
  | 'gold'
  | 'shards'
  | 'sigilCap'
  | 'collector'
  | 'tavernDiscount'
  | 'tavernOffer'
  | 'training'
  | 'rosterSlot7'
  | 'rosterSlot8'
  | 'questCap'
  | 'questReroll'
  | 'stepChests'
  | 'relicRestore'
  | 'salvage'
  | 'mastery';

export type GuildTrack = {
  id: GuildTrackId;
  building: GuildBuildingId;
  name: string;
  /** Tier whose boss must be beaten for each rank (index 0 = rank 1; 0 = when the hall opens). Its length is the rank count. */
  gates: number[];
  ranks: number;
  /** The effect at a rank, e.g. 0.1 per rank for +10%. See `game/guild/guild.ts` for how each is used. */
  perRank: number;
  /** Rank 1 cost; each rank after costs `rules.costMultiplier` times more. */
  baseCost: number;
  /** Gold per rank instead of the multiplier, for a track whose ranks don't follow income that way. */
  costs?: number[];
  /** A track that must be maxed first. */
  requires?: GuildTrackId;
  /** "+20% XP", for rank 0 → max. */
  describe: (rank: number) => string;
};

export const guildBuildings: Record<GuildBuildingId, { name: string; emoji: string }> = {
  warRoom: { name: 'War room', emoji: '🗺️' },
  treasury: { name: 'Treasury', emoji: '💰' },
  barracks: { name: 'Barracks', emoji: '🛏️' },
  questBoard: { name: 'Quest board', emoji: '📋' },
  workshop: { name: 'Workshop', emoji: '🔨' },
};

const pct = formatPercent;
const track = (def: Omit<GuildTrack, 'ranks'>): GuildTrack => ({ ...def, ranks: def.gates.length });

// doc/design/guild/tracks.csv
export const guildTracks: GuildTrack[] = [
  // War room
  track({ id: 'heroXp', building: 'warRoom', name: 'Hero XP', gates: [0, 1, 2, 3], perRank: 0.1, baseCost: 150, describe: (r) => t('guildTracks.heroXp', { percent: pct(r * 0.1) }) }),
  track({ id: 'fasterExpeditions', building: 'warRoom', name: 'Faster expeditions', gates: [1, 2, 3], perRank: 0.1, baseCost: 250, describe: (r) => t('guildTracks.fasterExpeditions', { percent: pct(r * 0.1) }) }),
  track({ id: 'betterRetreats', building: 'warRoom', name: 'Better retreats', gates: [0, 1, 2], perRank: 0.15, baseCost: 80, describe: (r) => t('guildTracks.betterRetreats', { percent: pct(r * 0.15) }) }),
  // Treasury
  track({ id: 'gold', building: 'treasury', name: 'Gold', gates: [0, 1, 2, 3], perRank: 0.1, baseCost: 50, costs: [50, 60, 85, 240], describe: (r) => t('guildTracks.gold', { percent: pct(r * 0.1) }) }),
  track({ id: 'shards', building: 'treasury', name: 'Shards', gates: [1, 2, 3], perRank: 1, baseCost: 200, describe: (r) => t('guildTracks.shards', { count: r }) }),
  track({ id: 'sigilCap', building: 'treasury', name: 'Sigil cap', gates: [3], perRank: 1, baseCost: 2500, describe: (r) => t('guildTracks.sigilCap', { count: 3 + r }) }),
  track({ id: 'collector', building: 'treasury', name: 'Collector’s contacts', gates: [1, 2, 3], perRank: 0.1, baseCost: 150, describe: (r) => t('guildTracks.collector', { percent: pct(r * 0.1) }) }),
  // Barracks
  track({ id: 'tavernDiscount', building: 'barracks', name: 'Tavern discount', gates: [0, 1, 2], perRank: 0.1, baseCost: 120, describe: (r) => t('guildTracks.tavernDiscount', { percent: pct(r * 0.1) }) }),
  track({ id: 'tavernOffer', building: 'barracks', name: 'Extra tavern offer', gates: [1], perRank: 1, baseCost: 500, describe: (r) => t('guildTracks.tavernOffer', { count: 3 + r }) }),
  track({ id: 'training', building: 'barracks', name: 'Training', gates: [0, 1, 2], perRank: 2, baseCost: 250, describe: (r) => t('guildTracks.training', { count: r * 2 }) }),
  track({ id: 'rosterSlot7', building: 'barracks', name: 'Roster slot 7', gates: [2], perRank: 1, baseCost: 1200, describe: (r) => t('guildTracks.roster', { count: 6 + r }) }),
  track({ id: 'rosterSlot8', building: 'barracks', name: 'Roster slot 8', gates: [4], perRank: 1, baseCost: 4000, requires: 'rosterSlot7', describe: (r) => t('guildTracks.roster', { count: 7 + r }) }),
  // Quest board
  track({ id: 'questCap', building: 'questBoard', name: 'Quest cap', gates: [1, 3], perRank: 1, baseCost: 200, describe: (r) => t('guildTracks.questCap', { count: 6 + r }) }),
  track({ id: 'questReroll', building: 'questBoard', name: 'Extra reroll', gates: [2], perRank: 1, baseCost: 300, describe: (r) => t('guildTracks.questReroll', { count: 1 + r }) }),
  track({ id: 'stepChests', building: 'questBoard', name: 'Step chests', gates: [0, 1, 2], perRank: 1, baseCost: 100, describe: (r) => t('guildTracks.stepChests', { count: r }) }),
  // Workshop
  track({ id: 'relicRestore', building: 'workshop', name: 'Relic restoring', gates: [2, 3, 4], perRank: 0.15, baseCost: 300, describe: (r) => t('guildTracks.relicRestore', { percent: pct(r * 0.15) }) }),
  track({ id: 'salvage', building: 'workshop', name: 'Salvage', gates: [1, 2, 3], perRank: 0.15, baseCost: 150, describe: (r) => t('guildTracks.salvage', { percent: pct(r * 0.15) }) }),
  track({ id: 'mastery', building: 'workshop', name: 'Mastery', gates: [0, 2, 4], perRank: 0.2, baseCost: 200, describe: (r) => t('guildTracks.mastery', { percent: pct(r * 0.2) }) }),
];

export const guildRules = {
  /** The Guild Hall opens with the taverns. */
  unlockedBy: 'banditStockade',
  /** Cost of rank r = baseCost × costMultiplier^(r − 1), rounded to `roundTo` (or `roundToLarge` from 1,000). */
  costMultiplier: 1.8,
  roundTo: 10,
  roundToLarge: 50,
  /** Amount of the rank's gate tier main material on top of gold, by rank. */
  rankMaterials: { 3: 15, 4: 10 } as Partial<Record<number, number>>,
  /** Training credits at most this many hours per absence. */
  trainingMaxHours: 24,
};

export const guildTrackById = Object.fromEntries(guildTracks.map((t) => [t.id, t])) as Record<GuildTrackId, GuildTrack>;
