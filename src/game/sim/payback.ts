import { chests } from '@/content/chests';
import { dungeons } from '@/content/dungeons';
import { guildTracks, type GuildTrack, type GuildTrackId } from '@/content/guild';
import { mainRewardPool, mainRewardRules } from '@/content/mainRewards';
import { treasureRules, treasureTiers } from '@/content/treasure';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { rankCost } from '../guild/guild';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { DungeonDef } from '../types';

// A rough, deterministic model of a player's gold: income per tier from
// simulated expeditions with a reference team, and when Guild Hall upgrades pay
// for themselves. The balance lab reports it next to the payback it measures.

export const economyConfig = {
  /** Expeditions per day, by slot. */
  perDay: { short: 4, long: 3, boss: 1 },
  /** Days spent in each tier before its boss falls (tier 1 includes the tutorial). */
  daysPerTier: [2, 4, 5, 6, 8],
  /** Hero level while playing each tier, as in the balance tests. */
  levels: [1, 3, 5, 7, 9],
  /** Both step chests on most days. */
  chestGoldPerDay: chests.reduce((sum, c) => sum + (c.gold[0] + c.gold[1]) / 2, 0) * 0.7,
  runsPerDungeon: 40,
};

type Config = typeof economyConfig;
const MATERIALS = ['wood', 'stone', 'copper', 'iron', 'steel'];

/** The tier's full kit, Normal quality, at the expected level. */
export function tierTeam(tier: number, config: Config = economyConfig): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    clearedDungeons: dungeons.filter((d) => d.isBoss).map((d) => d.id),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: config.levels[tier - 1] })),
    consumables: { fireResistanceElixir: 2 },
  };
  const pieces = ['Sword', 'Bow', 'Wand', 'Armour', 'Armour', 'Armour'];
  save = { ...save, gear: pieces.map((p, i) => ({ uid: `g${i}`, itemId: MATERIALS[tier - 1] + p, quality: 'normal' as const })) };
  ['bram', 'lyra', 'mira'].forEach((id, i) => {
    save = equip(equip(save, id, 'weapon', `g${i}`), id, 'armor', `g${i + 3}`);
  });
  return save;
}

export type DungeonYield = {
  /** Dungeon gold per run: base roll, caches and gold pouches. */
  gold: number;
  /** Gold-equivalent per main reward roll that hits: a pouch, or a treasure map's expected gold. */
  rewardValue: number;
  success: number;
  xp: number;
};

/** Average yield of a dungeon for the tier's team, from real expedition resolutions. */
export function dungeonYield(dungeon: DungeonDef, config: Config = economyConfig): DungeonYield {
  const team = tierTeam(dungeon.tier, config);
  let gold = 0;
  let wins = 0;
  let xp = 0;
  for (let i = 0; i < config.runsPerDungeon; i++) {
    const started = startExpedition({ ...team, nextUid: 1000 + i }, dungeon.id, ['bram', 'lyra', 'mira'], 0);
    const { report } = resolveExpedition({ ...started, firstClears: [dungeon.id] }, started.expeditions[0]);
    gold += report.gold + report.mainRewards.reduce((s, r) => s + (r.kind === 'goldPouch' ? r.gold : 0), 0);
    wins += report.success ? 1 : 0;
    xp += report.xp;
  }
  const weight = (kind: string) =>
    (mainRewardPool.find((p) => p.kind === kind)?.weight ?? 0) / mainRewardPool.reduce((s, p) => s + p.weight, 0);
  const roll = (dungeon.gold[0] + dungeon.gold[1]) / 2;
  const [pouchMin, pouchMax] = mainRewardRules.goldPouchMultiplier;
  const treasure = treasureTiers[dungeon.tier - 1].gold;
  const mapGold = ((treasure[0] + treasure[1]) / 2) * (1 + treasureRules.specialChance * 0.5 * (treasureRules.jackpotMultiplier - 1));
  return {
    gold: gold / config.runsPerDungeon,
    rewardValue: weight('goldPouch') * roll * ((pouchMin + pouchMax) / 2) + weight('treasureMap') * mapGold,
    success: wins / config.runsPerDungeon,
    xp: xp / config.runsPerDungeon,
  };
}

export type TierIncome = {
  tier: number;
  /** Dungeon gold per day (base rolls, caches, pouches). */
  dungeonGold: number;
  /** Extra gold-equivalent per day per +10% main reward chance. */
  mainRewardsPerRank: number;
  xpPerHero: number;
};

/** A day's play at a tier: the slots' average dungeons, `config.perDay` times. */
export function tierIncome(tier: number, config: Config = economyConfig): TierIncome {
  const inTier = dungeons.filter((d) => d.tier === tier);
  const slots = { short: inTier.filter((d) => d.slot === 'short'), long: inTier.filter((d) => d.slot === 'long'), boss: inTier.filter((d) => d.isBoss) };
  let dungeonGold = 0;
  let mainRewardsPerRank = 0;
  let xpPerHero = 0;
  for (const [slot, pool] of Object.entries(slots) as [keyof typeof slots, DungeonDef[]][]) {
    const yields = pool.map((d) => ({ d, y: dungeonYield(d, config) }));
    const average = (f: (x: { d: DungeonDef; y: DungeonYield }) => number) => yields.reduce((s, x) => s + f(x), 0) / yields.length;
    const runs = config.perDay[slot];
    dungeonGold += runs * average(({ y }) => y.gold);
    xpPerHero += runs * average(({ y }) => y.xp);
    // +10% relative chance on each roll, capped at 100%.
    mainRewardsPerRank +=
      runs *
      average(({ d, y }) => {
        const extra = (chance = 0) => Math.min(1, chance * 1.1) - chance;
        return y.success * y.rewardValue * (extra(d.mainRewardChance) + extra(d.mainRewardExtraRollChance));
      });
  }
  return { tier, dungeonGold, mainRewardsPerRank, xpPerHero };
}

/** The tier being played on each day, from `config.daysPerTier`. */
export function tierOnDay(day: number, config: Config = economyConfig) {
  let end = 0;
  for (let i = 0; i < config.daysPerTier.length; i++) {
    end += config.daysPerTier[i];
    if (day < end) return i + 1;
  }
  return config.daysPerTier.length;
}

/** The first day a tier's boss is beaten (the day the next tier starts). */
export const bossBeatenOn = (tier: number, config: Config = economyConfig) =>
  tier <= 0 ? config.daysPerTier[0] : config.daysPerTier.slice(0, tier).reduce((s, d) => s + d, 0);

/** The day a rank can first be bought: its tier gate (rank 1 opens with the Guild Hall, after the tier 1 boss). */
export function rankUnlockDay(track: GuildTrack, rank: number, gates: number[], config: Config = economyConfig) {
  const gate = track.ranks === 1 ? (track.gate ?? 1) : Math.max(1, gates[rank - 1]);
  return bossBeatenOn(gate, config);
}

export type Payback = { track: GuildTrackId; rank: number; cost: number; boughtOn: number; days: number };

/**
 * Days for a rank of an economic track to earn back its cost, bought the day it
 * unlocks, with income growing as tiers advance.
 */
export function paybacks(incomes: TierIncome[], gates: number[], config: Config = economyConfig): Payback[] {
  const gain: Partial<Record<GuildTrackId, (income: TierIncome) => number>> = {
    gold: (income) => income.dungeonGold * 0.1,
    mainRewards: (income) => income.mainRewardsPerRank,
  };
  return guildTracks.flatMap((track) => {
    const perDay = gain[track.id];
    if (!perDay) return [];
    return Array.from({ length: track.ranks }, (_, i) => {
      const rank = i + 1;
      const cost = rankCost(track, rank);
      const boughtOn = rankUnlockDay(track, rank, gates, config);
      let earned = 0;
      let days = 0;
      while (earned < cost && days < 365) {
        earned += perDay(incomes[tierOnDay(boughtOn + days, config) - 1]);
        days++;
      }
      return { track: track.id, rank, cost, boughtOn, days };
    });
  });
}

/** Total gold to max each building. */
export const buildingCosts = () =>
  Object.fromEntries(
    (['warRoom', 'treasury', 'barracks'] as const).map((b) => [
      b,
      guildTracks
        .filter((t) => t.building === b)
        .reduce((sum, t) => sum + Array.from({ length: t.ranks }, (_, i) => rankCost(t, i + 1)).reduce((s, c) => s + c, 0), 0),
    ]),
  );
