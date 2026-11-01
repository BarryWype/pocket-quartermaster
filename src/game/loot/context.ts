import { dungeons } from '@/content/dungeons';
import { difficultyRules, type Difficulty } from '@/content/difficulty';
import { MASTERY_TYPES } from '@/content/forging';
import { lootConfig } from '@/content/loot/config';

import { highestUnlockedTier } from '../dungeons/unlock';
import { pickaxeTier } from '../gathering/gathering';
import type { Rng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import type { MasteryType } from '../types';
import type { SaveData } from '../save';
import { affinityOf } from '../team/team';
import { rollSourceLoot, type LootContext, type LootRequest } from './roll';
import type { Loot, LootSourceId } from './types';

/** What the generators read from the save: tiers, known blueprints, the types the roster favours and the mastery. */
export function lootContextOf(save: SaveData): LootContext {
  const favourCounts: Partial<Record<MasteryType, number>> = {};
  for (const type of MASTERY_TYPES) {
    const count = save.heroes.filter((h) => affinityOf(h.classId, type) === 'favoured').length;
    if (count > 0) favourCounts[type] = count;
  }
  return {
    playerTier: highestUnlockedTier(save),
    pickaxeTier: pickaxeTier(save),
    knownRecipes: save.knownRecipes,
    favourCounts,
    mastery: save.mastery,
  };
}

const shortDungeon = (tier: number) => dungeons.find((d) => d.tier === tier && d.chainIndex === 0)!;

/**
 * A source's gold and XP at a tier, as shares of the tier's short dungeon (see
 * `lootConfig.amounts`). The difficulty's `goldXp` applies here; dungeon runs
 * and the bonus rows pay their dungeon's own gold and XP, which already
 * include it.
 */
export function sourceAmounts(source: LootSourceId, tier: number, difficulty?: Difficulty): { gold: number; xp: number } {
  const share = lootConfig.amounts[source] ?? { gold: 0, xp: 0 };
  const goldXp = difficulty ? difficultyRules.rewards[difficulty].goldXp : 1;
  const short = shortDungeon(tier);
  return {
    gold: Math.round(((short.gold[0] + short.gold[1]) / 2) * share.gold * goldXp),
    xp: Math.round(short.xp * share.xp * goldXp),
  };
}

/**
 * A source's loot at the player's tier: its gold (with the Guild Hall gold
 * bonus) and XP from `sourceAmounts`, no Luck or charms unless given.
 */
export function rollForSave(save: SaveData, source: LootSourceId, rng: Rng, options: Partial<LootRequest> = {}): Loot {
  const tier = highestUnlockedTier(save);
  const amounts = sourceAmounts(source, tier, options.difficulty);
  return rollSourceLoot({
    source,
    tier,
    luck: 0,
    modifiers: [],
    enemies: [],
    base: { gold: Math.round(amounts.gold * (1 + guildBonus(save, 'gold'))), xp: amounts.xp },
    context: lootContextOf(save),
    rng,
    ...options,
  });
}
