import { sanctumGuardian, sanctumMinionId } from '@/content/enemies';
import { frLogTemplates } from '@/content/fr/logTemplates';
import { logTemplates } from '@/content/logTemplates';
import { fill, localized, tr } from '@/i18n';
import { guildRules } from '@/content/guild';
import { sanctumRules, sanctums } from '@/content/sanctums';

import { convertShards, shardId, stoneId } from '../elements';
import { buildLog } from '../expeditions/log';
import { estimateOdds, ODDS_RUNS } from '../expeditions/odds';
import { prepareParty, simulateRun } from '../expeditions/simulate';
import { distanceMeters } from '../generation/geo';
import { guildBonus } from '../guild/guild';
import { createRng } from '../generation/rng';
import { randomPointInTile, tilesAround } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { isOnExpedition } from '../team/team';
import type { DungeonDef, SanctumDef } from '../types';

type Rules = typeof sanctumRules;

export type SanctumSpawn = {
  id: string;
  sanctumId: string;
  position: LatLng;
  expiresAt: number;
};

export type SanctumReward = { element: SanctumDef['element']; shards: number; stones: number; charter: boolean };

export type SanctumResult = {
  win: boolean;
  log: string[];
  reward: SanctumReward;
};

export const sanctumById = Object.fromEntries(sanctums.map((s) => [s.id, s]));

/** Every Sanctum in the tiles around a position, the same for every player in a window. */
export function generateSanctumsAround(position: LatLng, timeMs: number, rules: Rules = sanctumRules): SanctumSpawn[] {
  const window = windowIndex(timeMs, rules.windowMinutes);
  const { end } = windowRange(window, rules.windowMinutes);
  return tilesAround(position, rules.precision).flatMap((tile) => {
    const rng = createRng(`sanctum|${tile}|${window}`);
    return Array.from({ length: rng.int(rules.perTile[0], rules.perTile[1]) }, (_, i) => {
      const sanctum = sanctums[rng.int(0, sanctums.length - 1)];
      return {
        id: `sanctum:${sanctum.id}:${tile}:${window}:${i}`,
        sanctumId: sanctum.id,
        position: randomPointInTile(tile, rng),
        expiresAt: end,
      };
    });
  });
}

/** The Sanctum as a short dungeon for the combat engine: minion fights, then the guardian. */
export function sanctumDungeon(sanctum: SanctumDef, tier: number, rules: Rules = sanctumRules): DungeonDef {
  const weak = sanctumMinionId(sanctum.id, 'weak', tier);
  const strong = sanctumMinionId(sanctum.id, 'strong', tier);
  return {
    id: `sanctum:${sanctum.id}:${tier}`,
    name: sanctum.name,
    emoji: sanctum.emoji,
    tier,
    durationMinutes: 0,
    encounterCount: rules.encounterCount,
    encounters: [
      { type: 'fight', weight: 1, mobs: [{ mobId: weak, count: 3 }] },
      { type: 'fight', weight: 1, mobs: [{ mobId: weak, count: 1 }, { mobId: strong, count: 2 }] },
    ],
    boss: sanctumGuardian(sanctum, tier),
    gold: [0, 0],
    xp: 0,
    loot: [],
    recipeDrops: [],
    mainRewardChance: 0,
  };
}

export const availableHeroes = (save: SaveData) => save.heroes.filter((h) => !isOnExpedition(save, h.id));

export function sanctumOdds(save: SaveData, heroIds: string[], sanctum: SanctumDef, tier: number, runs = ODDS_RUNS) {
  return estimateOdds(save, heroIds, sanctumDungeon(sanctum, tier), runs);
}

export type ChallengeProblem = 'used' | 'expired' | 'noSigil' | 'tooFar' | 'noHeroes' | 'heroAway';

/** Why a challenge can't go ahead, or null when it can. */
export function challengeProblem(
  save: SaveData,
  spawn: SanctumSpawn,
  tier: number,
  heroIds: string[],
  player: LatLng,
  now: number,
  rules: Rules = sanctumRules,
): ChallengeProblem | null {
  if (spawn.id in save.usedSanctums) return 'used';
  if (spawn.expiresAt <= now) return 'expired';
  if (!save.sigils.includes(tier)) return 'noSigil';
  if (distanceMeters(player, spawn.position) > rules.interactionMeters) return 'tooFar';
  if (heroIds.length === 0) return 'noHeroes';
  if (heroIds.some((id) => isOnExpedition(save, id))) return 'heroAway';
  return null;
}

/**
 * Spends a Sigil of `tier` to fight the Sanctum once, instantly. Win or lose,
 * the Sanctum is used up for this player until it refreshes.
 */
export function challengeSanctum(
  save: SaveData,
  spawn: SanctumSpawn,
  tier: number,
  heroIds: string[],
  player: LatLng,
  now: number,
  rules: Rules = sanctumRules,
): { save: SaveData; result: SanctumResult } {
  const problem = challengeProblem(save, spawn, tier, heroIds, player, now, rules);
  if (problem) throw new Error(`Cannot challenge ${spawn.id}: ${problem}`);

  const sanctum = sanctumById[spawn.sanctumId];
  const dungeon = sanctumDungeon(sanctum, tier, rules);
  const seed = `${spawn.id}|${save.nextUid}`;
  const party = prepareParty(save, heroIds);
  const run = simulateRun(party, dungeon, seed);
  const win = run.bossDefeated;
  const amounts = rules.rewards[tier - 1][win ? 'win' : 'loss'];
  // Wins also get the Guild Hall's extra shards, and sometimes a charter.
  const reward = {
    element: sanctum.element,
    shards: amounts.shards + (win ? guildBonus(save, 'shards') : 0),
    stones: amounts.stones,
    charter: win && createRng(`${seed}|charter`).chance(guildRules.charters.sanctumWinChance),
  };

  const log = buildLog(
    {
      dungeon,
      party,
      run,
      gold: 0,
      recipeItemName: null,
      mainRewards: [],
      summary: fill(localized({ en: logTemplates, fr: frLogTemplates })[win ? 'sanctumWon' : 'sanctumLost'][0], {
        guardian: tr(dungeon.boss.name),
      }),
    },
    createRng(`${seed}|log`),
  );

  const sigilIndex = save.sigils.indexOf(tier);
  return {
    result: { win, log, reward },
    save: {
      ...save,
      sigils: save.sigils.filter((_, i) => i !== sigilIndex),
      charters: save.charters + (reward.charter ? 1 : 0),
      materials: convertShards(
        addMaterials(
          save.materials,
          [
            { materialId: shardId(sanctum.element), amount: reward.shards },
            { materialId: stoneId(sanctum.element), amount: reward.stones },
          ].filter((stack) => stack.amount > 0),
        ),
      ),
      usedSanctums: { ...save.usedSanctums, [spawn.id]: spawn.expiresAt },
      nextUid: save.nextUid + 1,
    },
  };
}
