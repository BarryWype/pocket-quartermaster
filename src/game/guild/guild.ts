import { dungeons } from '@/content/dungeons';
import { guildRules, guildTrackById, type GuildTrack, type GuildTrackId } from '@/content/guild';
import { mainRewardRules } from '@/content/mainRewards';
import { recruitRules, rosterRules } from '@/content/roster';

import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { MaterialStack } from '../types';

type Rules = typeof guildRules;

/** Gold for a rank: baseCost × multiplier^(rank − 1), rounded to a clean number. */
export function rankCost(track: GuildTrack, rank: number, rules: Rules = guildRules) {
  const raw = track.baseCost * rules.costMultiplier ** (rank - 1);
  const step = raw >= 1000 ? rules.roundToLarge : rules.roundTo;
  return Math.round(raw / step) * step;
}

export const guildRank = (save: SaveData, id: GuildTrackId) => save.guild[id] ?? 0;

/**
 * A track's effect at its current rank: ranks × its per-rank value (0.1 for
 * +10%, 1 for +1 shard…). The one place the rest of the game asks about the Guild Hall.
 */
export const guildBonus = (save: SaveData, id: GuildTrackId) => guildRank(save, id) * guildTrackById[id].perRank;

export const sigilCap = (save: SaveData) => mainRewardRules.sigilCap + guildBonus(save, 'sigilCap');
export const partySize = (save: SaveData) => rosterRules.partySize + guildBonus(save, 'partySlot');
export const rosterCap = (save: SaveData) =>
  rosterRules.rosterCap + guildBonus(save, 'rosterSlot7') + guildBonus(save, 'rosterSlot8');
export const tavernOfferCount = (save: SaveData) => recruitRules.offersPerTavern + guildBonus(save, 'tavernOffer');

export const isGuildUnlocked = (save: SaveData, rules: Rules = guildRules) => save.clearedDungeons.includes(rules.unlockedBy);

/** The boss dungeon of a tier. */
export const tierBoss = (tier: number) => dungeons.find((d) => d.tier === tier && d.isBoss)!;

const bossBeaten = (save: SaveData, tier: number) => tier <= 0 || save.clearedDungeons.includes(tierBoss(tier).id);

/** Tier whose boss must be beaten before a rank can be bought (0 = as soon as the hall opens). */
export function rankGate(track: GuildTrack, rank: number, rules: Rules = guildRules) {
  return track.ranks === 1 ? (track.gate ?? 0) : rules.rankGates[rank - 1];
}

export type RankPrice = { gold: number; materials: MaterialStack[]; charters: number };

export function rankPrice(track: GuildTrack, rank: number, rules: Rules = guildRules): RankPrice {
  return {
    gold: rankCost(track, rank, rules),
    materials: rules.rankMaterials[rank] ?? [],
    charters: track.milestone ? rules.charters.perMilestone : 0,
  };
}

export type RankProblem =
  | { kind: 'hallLocked' }
  | { kind: 'maxed' }
  | { kind: 'gate'; tier: number; boss: string }
  | { kind: 'requires'; track: GuildTrackId }
  | { kind: 'missing'; gold: number; materials: MaterialStack[]; charters: number };

/** Why the next rank of a track can't be bought now, or null. */
export function rankProblem(save: SaveData, id: GuildTrackId, rules: Rules = guildRules): RankProblem | null {
  const track = guildTrackById[id];
  const rank = guildRank(save, id) + 1;
  if (!isGuildUnlocked(save, rules)) return { kind: 'hallLocked' };
  if (rank > track.ranks) return { kind: 'maxed' };
  const gate = rankGate(track, rank, rules);
  if (!bossBeaten(save, gate)) return { kind: 'gate', tier: gate, boss: tierBoss(gate).name };
  if (track.requires && guildRank(save, track.requires) < guildTrackById[track.requires].ranks) {
    return { kind: 'requires', track: track.requires };
  }
  const price = rankPrice(track, rank, rules);
  const missingMaterials = price.materials
    .map(({ materialId, amount }) => ({ materialId, amount: amount - (save.materials[materialId] ?? 0) }))
    .filter((m) => m.amount > 0);
  const missing = {
    gold: Math.max(0, price.gold - save.gold),
    materials: missingMaterials,
    charters: Math.max(0, price.charters - save.charters),
  };
  if (missing.gold || missing.materials.length || missing.charters) return { kind: 'missing', ...missing };
  return null;
}

/** Buys the next rank: pays gold, materials and charters. Permanent. */
export function buyRank(save: SaveData, id: GuildTrackId, rules: Rules = guildRules): SaveData {
  const problem = rankProblem(save, id, rules);
  if (problem) throw new Error(`Cannot buy ${id}: ${problem.kind}`);
  const rank = guildRank(save, id) + 1;
  const price = rankPrice(guildTrackById[id], rank, rules);
  if (!hasMaterials(save.materials, price.materials)) throw new Error('Not enough materials');
  return {
    ...save,
    gold: save.gold - price.gold,
    materials: removeMaterials(save.materials, price.materials),
    charters: save.charters - price.charters,
    guild: { ...save.guild, [id]: rank },
  };
}
