import { dungeons } from '@/content/dungeons';
import { MASTERY_TYPES } from '@/content/forging';
import { lootConfig } from '@/content/loot/config';

import { highestUnlockedTier } from '../dungeons/unlock';
import { pickaxeTier } from '../gathering/gathering';
import type { Rng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import type { SaveData } from '../save';
import { affinityOf } from '../team/team';
import { rollSourceLoot, type LootContext, type LootRequest } from './roll';
import type { Loot, LootSourceId } from './types';

/** What the generators read from the save: tiers, known blueprints and the types the roster favours. */
export function lootContextOf(save: SaveData): LootContext {
  return {
    playerTier: highestUnlockedTier(save),
    pickaxeTier: pickaxeTier(save),
    knownRecipes: save.knownRecipes,
    favouredTypes: MASTERY_TYPES.filter((type) => save.heroes.some((h) => affinityOf(h.classId, type) === 'favoured')),
  };
}

const shortDungeon = (tier: number) => dungeons.find((d) => d.tier === tier && d.slot === 'short')!;

/** A source's gold and XP at a tier, as shares of the tier's short dungeon (see `lootConfig.amounts`). */
export function sourceAmounts(source: LootSourceId, tier: number): { gold: number; xp: number } {
  const share = lootConfig.amounts[source] ?? { gold: 0, xp: 0 };
  const short = shortDungeon(tier);
  return { gold: Math.round(((short.gold[0] + short.gold[1]) / 2) * share.gold), xp: Math.round(short.xp * share.xp) };
}

/**
 * A source's loot at the player's tier: its gold (with the Guild Hall gold
 * bonus) and XP from `sourceAmounts`, no Luck or charms unless given.
 */
export function rollForSave(save: SaveData, source: LootSourceId, rng: Rng, options: Partial<LootRequest> = {}): Loot {
  const tier = highestUnlockedTier(save);
  const amounts = sourceAmounts(source, tier);
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
