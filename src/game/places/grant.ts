import { traitById } from '@/content/traits';

import { unlockRecipe } from '../crafting/crafting';
import { convertShards } from '../elements';
import { guildBonus } from '../guild/guild';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { addXp } from '../team/team';
import type { PlaceReward } from '../types';

/**
 * Pays a place reward: gold, materials, consumables, gear pieces (given fresh
 * uids), a recipe, key fragments and XP per hero who took part, with the
 * trait and Guild Hall XP bonuses. Pure: returns a new save.
 */
export function grantPlaceReward(save: SaveData, heroIds: string[], reward: PlaceReward): SaveData {
  const guildXp = 1 + guildBonus(save, 'heroXp');
  const consumables = { ...save.consumables };
  for (const { itemId, amount } of reward.consumables) {
    consumables[itemId] = (consumables[itemId] ?? 0) + amount;
  }
  // Placeholder uids on the reward's gear are replaced with fresh ones here.
  const gear = reward.gear.map((piece, i) => ({ ...piece, uid: `g${save.nextUid + i}` }));
  const heroes = save.heroes.map((hero) => {
    if (!heroIds.includes(hero.id)) return hero;
    const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
    return addXp(hero, Math.round(reward.xp * xpBonus * guildXp));
  });
  let next: SaveData = {
    ...save,
    gold: save.gold + reward.gold,
    materials: convertShards(addMaterials(save.materials, reward.materials)),
    consumables,
    gear: [...save.gear, ...gear],
    heroes,
    keyFragments: save.keyFragments + reward.keyFragments,
    nextUid: save.nextUid + reward.gear.length,
  };
  if (reward.recipeId) next = unlockRecipe(next, reward.recipeId);
  return next;
}
