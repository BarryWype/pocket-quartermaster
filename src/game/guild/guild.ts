import { dungeons } from '@/content/dungeons';
import { guildRules, guildTrackById, type GuildTrack, type GuildTrackId } from '@/content/guild';
import { lootConfig } from '@/content/loot/config';
import { tierMaterials } from '@/content/materials';
import { questRules } from '@/content/quests';
import { recruitRules, rosterRules } from '@/content/roster';

import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { MaterialStack } from '../types';

type Rules = typeof guildRules;

/** Gold for a rank: the track's own cost list, or baseCost × multiplier^(rank − 1) rounded to a clean number. */
export function rankCost(track: GuildTrack, rank: number, rules: Rules = guildRules) {
  if (track.costs) return track.costs[rank - 1];
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

export const sigilCap = (save: SaveData) => lootConfig.sigils.cap + guildBonus(save, 'sigilCap');
export const rosterCap = (save: SaveData) =>
  rosterRules.rosterCap + guildBonus(save, 'rosterSlot7') + guildBonus(save, 'rosterSlot8');
export const tavernOfferCount = (save: SaveData) => recruitRules.offersPerTavern + guildBonus(save, 'tavernOffer');
export const questCap = (save: SaveData) => questRules.cap + guildBonus(save, 'questCap');

export const isGuildUnlocked = (save: SaveData, rules: Rules = guildRules) => save.clearedDungeons.includes(rules.unlockedBy);

/** The boss dungeon of a tier. */
export const tierBoss = (tier: number) => dungeons.find((d) => d.tier === tier && d.isBoss)!;

export const bossBeaten = (save: SaveData, tier: number) => tier <= 0 || save.clearedDungeons.includes(tierBoss(tier).id);

/** Tier whose boss must be beaten before a rank can be bought (0 = as soon as the hall opens). */
export const rankGate = (track: GuildTrack, rank: number) => track.gates[rank - 1];

export type RankPrice = { gold: number; materials: MaterialStack[] };

/** Gold, plus on high ranks the main material of the rank's gate tier (wood for a gate of 0). */
export function rankPrice(track: GuildTrack, rank: number, rules: Rules = guildRules): RankPrice {
  const amount = rules.rankMaterials[rank];
  const materialId = tierMaterials[Math.max(1, rankGate(track, rank)) - 1];
  return { gold: rankCost(track, rank, rules), materials: amount ? [{ materialId, amount }] : [] };
}

export type RankProblem =
  | { kind: 'hallLocked' }
  | { kind: 'maxed' }
  | { kind: 'gate'; tier: number; boss: string }
  | { kind: 'requires'; track: GuildTrackId }
  | { kind: 'missing'; gold: number; materials: MaterialStack[] };

/** Why the next rank of a track can't be bought now, or null. `ignoreGates` is the debug unlock. */
export function rankProblem(save: SaveData, id: GuildTrackId, rules: Rules = guildRules, ignoreGates = false): RankProblem | null {
  const track = guildTrackById[id];
  const rank = guildRank(save, id) + 1;
  if (!isGuildUnlocked(save, rules)) return { kind: 'hallLocked' };
  if (rank > track.ranks) return { kind: 'maxed' };
  const gate = rankGate(track, rank);
  if (!ignoreGates && !bossBeaten(save, gate)) return { kind: 'gate', tier: gate, boss: tierBoss(gate).name };
  if (track.requires && guildRank(save, track.requires) < guildTrackById[track.requires].ranks) {
    return { kind: 'requires', track: track.requires };
  }
  const price = rankPrice(track, rank, rules);
  const missingMaterials = price.materials
    .map(({ materialId, amount }) => ({ materialId, amount: amount - (save.materials[materialId] ?? 0) }))
    .filter((m) => m.amount > 0);
  const missing = { gold: Math.max(0, price.gold - save.gold), materials: missingMaterials };
  if (missing.gold || missing.materials.length) return { kind: 'missing', ...missing };
  return null;
}

/** Buys the next rank: pays gold and materials. Permanent. */
export function buyRank(save: SaveData, id: GuildTrackId, rules: Rules = guildRules, ignoreGates = false): SaveData {
  const problem = rankProblem(save, id, rules, ignoreGates);
  if (problem) throw new Error(`Cannot buy ${id}: ${problem.kind}`);
  const rank = guildRank(save, id) + 1;
  const price = rankPrice(guildTrackById[id], rank, rules);
  if (!hasMaterials(save.materials, price.materials)) throw new Error('Not enough materials');
  return {
    ...save,
    gold: save.gold - price.gold,
    materials: removeMaterials(save.materials, price.materials),
    guild: { ...save.guild, [id]: rank },
  };
}
