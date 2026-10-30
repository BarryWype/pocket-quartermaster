import { guildTracks, type GuildTrackId } from '@/content/guild';

import { rankCost, rankGate } from '../guild/guild';

/** Gold per day by source while each tier was the highest, as the simulator measures it. */
export type IncomeByTier = Record<number, Record<string, number>>;

export type Payback = { track: GuildTrackId; rank: number; cost: number; tier: number; days: number | null };

/** The gold per day each economic track scales; a rank adds its `perRank` share of it. Sigils and lures aren't counted. */
const scaledGold: Partial<Record<GuildTrackId, (income: Record<string, number>) => number>> = {
  gold: (i) => (i.dungeon ?? 0) + (i.pouch ?? 0) + (i.mapGold ?? 0),
};

/**
 * Days for each rank of an economic track to earn back its cost, at the tier
 * where it can first be bought (the hall opens with tier 2), from measured income.
 */
export function paybacks(income: IncomeByTier): Payback[] {
  return guildTracks.flatMap((track) => {
    const scaled = scaledGold[track.id];
    if (!scaled) return [];
    return Array.from({ length: track.ranks }, (_, i) => {
      const rank = i + 1;
      const tier = Math.min(5, Math.max(1, rankGate(track, rank)) + 1);
      const cost = rankCost(track, rank);
      const daily = income[tier] ? scaled(income[tier]) * track.perRank : 0;
      return { track: track.id, rank, cost, tier, days: daily > 0 ? Math.round((cost / daily) * 10) / 10 : null };
    });
  });
}
