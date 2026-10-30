import { lootConfig } from '@/content/loot/config';
import { masteryRules } from '@/content/forging';
import { traitById } from '@/content/traits';

import { unlockRecipe } from '../crafting/crafting';
import { seeParts } from '../crafting/partRecipes';
import { convertShards } from '../elements';
import { gainMastery, masteryOf } from '../forging/mastery';
import { guildBonus } from '../guild/guild';
import { highestUnlockedTier } from '../dungeons/unlock';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { addXp } from '../team/team';
import type { TreasureMap } from '../types';
import type { Loot } from './types';

/**
 * Pays a roll's loot: gold, XP per hero who took part (trait and Guild Hall
 * bonuses on top), materials, consumables, lures, gear (given fresh uids),
 * blueprints, key fragments, treasure maps (found `now`), manuals, valuables,
 * relics and mastery progress. Parts and gems found unlock their recipes.
 * Pure: returns a new save.
 */
export function grantLoot(save: SaveData, heroIds: string[], loot: Loot, now: number): SaveData {
  const guildXp = 1 + guildBonus(save, 'heroXp');
  const playerTier = highestUnlockedTier(save);
  const consumables = { ...save.consumables };
  for (const { itemId, amount } of loot.consumables) consumables[itemId] = (consumables[itemId] ?? 0) + amount;
  const valuables = { ...save.valuables };
  for (const { valuableId, tier, amount } of loot.valuables) {
    const key = `${valuableId}:${tier}`;
    valuables[key] = (valuables[key] ?? 0) + amount;
  }
  const manuals = { ...save.manuals };
  for (const rarity of loot.manuals) manuals[rarity] = (manuals[rarity] ?? 0) + 1;

  let uid = save.nextUid;
  const gear = loot.gear.map((piece) => ({ ...piece, uid: `g${uid++}` }));
  const maps = loot.treasureMaps.map(
    ({ rarity, tier }): TreasureMap => ({ id: `map${uid++}`, tier, rarity, expiresAt: now + lootConfig.treasureMapHours * 3_600_000, location: null }),
  );
  const relics = loot.relics.map((relicId) => ({ uid: `r${uid++}`, relicId }));
  const heroes = save.heroes.map((hero) => {
    if (!heroIds.includes(hero.id) || loot.xp <= 0) return hero;
    const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
    return addXp(hero, Math.round(loot.xp * xpBonus * guildXp), playerTier);
  });
  let next: SaveData = {
    ...save,
    gold: save.gold + loot.gold,
    materials: convertShards(addMaterials(save.materials, loot.materials)),
    consumables,
    lures: save.lures + loot.lures,
    gear: [...save.gear, ...gear],
    heroes,
    keyFragments: save.keyFragments + loot.keyFragments,
    treasureMaps: [...save.treasureMaps, ...maps],
    manuals,
    valuables,
    relics: [...save.relics, ...relics],
    nextUid: uid,
  };
  for (const recipeId of loot.recipeIds) next = unlockRecipe(next, recipeId);
  next = seeParts(next, [...loot.materials.map((stack) => stack.materialId), ...loot.valuables.map((v) => v.valuableId)]);
  for (const { type, tier, forges } of loot.mastery) {
    let state = masteryOf(next, type);
    for (let i = 0; i < forges; i++) state = gainMastery(state, tier, masteryRules, 1 + guildBonus(save, 'mastery'));
    next = { ...next, mastery: { ...next.mastery, [type]: state } };
  }
  return next;
}
