import { itemById, recipeById } from '@/content/lookup';
import type { Rarity } from '@/content/gear';

import { highestUnlockedTier } from '../dungeons/unlock';
import { ELEMENTS, shardId, type Element } from '../elements';
import { makeGearPiece, type GearPieceOptions } from '../gear/make';
import { tierRecipes } from './recipeUnlocks';
import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, MaterialStack, RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  // Part recipes need their parts seen as well as their tier.
  if (recipe.unlockedBy) return save.partRecipes.includes(recipe.id) && highestUnlockedTier(save) >= (recipe.availableFromTier ?? 1);
  // Tier recipes come with the tiers alone: known once the player reaches their tier.
  if (recipe.availableFromTier !== undefined) return highestUnlockedTier(save) >= recipe.availableFromTier;
  return save.knownRecipes.includes(recipe.id);
}

/** Tools are crafted once; afterwards their recipe has nothing left to make. */
export function ownsTool(save: SaveData, recipe: RecipeDef) {
  return 'itemId' in recipe.output && save.tools.includes(recipe.output.itemId);
}

/** The element a recipe's `anyShards` takes: the one held most, if there are enough. */
export function shardElementFor(save: SaveData, recipe: RecipeDef): Element | null {
  if (!recipe.anyShards) return null;
  const element = [...ELEMENTS].sort((a, b) => (save.materials[shardId(b)] ?? 0) - (save.materials[shardId(a)] ?? 0))[0];
  return (save.materials[shardId(element)] ?? 0) >= recipe.anyShards ? element : null;
}

/** What one craft spends: materials (shards included) and gold; null when short. */
export function recipeCost(save: SaveData, recipe: RecipeDef): { materials: MaterialStack[]; gold: number } | null {
  const materials = [...recipe.inputs];
  if (recipe.anyShards) {
    const element = shardElementFor(save, recipe);
    if (!element) return null;
    materials.push({ materialId: shardId(element), amount: recipe.anyShards });
  }
  if (!hasMaterials(save.materials, materials)) return null;
  const gold = recipe.gold ?? 0;
  if (save.gold < gold) return null;
  return { materials, gold };
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return isKnown(save, recipe) && !ownsTool(save, recipe) && recipeCost(save, recipe) !== null;
}

/** The gear a recipe forges, if it makes a weapon, armour, helmet or off-hand piece. */
export function forgedItem(recipe: RecipeDef) {
  if (!('itemId' in recipe.output)) return null;
  const item = itemById[recipe.output.itemId];
  return item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'helmet' || item.slot === 'offhand' ? item : null;
}

/** Learns a recipe. */
export function unlockRecipe(save: SaveData, recipeId: string): SaveData {
  if (save.knownRecipes.includes(recipeId)) return save;
  return { ...save, knownRecipes: [...save.knownRecipes, recipeId] };
}

/** Removes a recipe from the known list (debug). */
export function forgetRecipe(save: SaveData, recipeId: string): SaveData {
  return { ...save, knownRecipes: save.knownRecipes.filter((id) => id !== recipeId) };
}

/** Teaches every gear blueprint of a tier (debug). */
export const learnTier = (save: SaveData, tier: number): SaveData => tierRecipes(tier).reduce(unlockRecipe, save);

/** Teaches every recipe (debug). */
export function learnAllRecipes(save: SaveData): SaveData {
  return Object.keys(recipeById).reduce<SaveData>((next, id) => unlockRecipe(next, id), save);
}

/**
 * The gear branch of a forge: a new piece made with `makeGearPiece`, seeded by
 * its uid so it can't be rerolled by reopening. Forced affixes ride along.
 */
export function forgeGearPiece(next: SaveData, gearItem: GearDef, rarity: Rarity, opts?: GearPieceOptions): SaveData {
  const uid = `g${next.nextUid}`;
  return {
    ...next,
    gear: [...next.gear, makeGearPiece(uid, gearItem.id, rarity, undefined, opts)],
    nextUid: next.nextUid + 1,
  };
}

/**
 * Consumes the inputs and adds the output: a material, a consumable, a tool or
 * a new gear piece, forged Common with its stats rolled on the dice. Also
 * teaches the recipes this one unlocks.
 */
export function craft(save: SaveData, recipe: RecipeDef, forceRarity?: Rarity): SaveData {
  const cost = canCraft(save, recipe) ? recipeCost(save, recipe) : null;
  if (!cost) throw new Error(`Cannot craft ${recipe.id}`);
  let next: SaveData = { ...save, materials: removeMaterials(save.materials, cost.materials), gold: save.gold - cost.gold };

  const gearItem = forgedItem(recipe);
  if ('materialId' in recipe.output) {
    next = { ...next, materials: addMaterials(next.materials, [recipe.output]) };
  } else if (gearItem) {
    next = forgeGearPiece(next, gearItem, forceRarity ?? 'common');
  } else {
    const item = itemById[recipe.output.itemId];
    if (item.slot === 'consumable' || item.slot === 'provision' || item.slot === 'utility') {
      next = { ...next, consumables: { ...next.consumables, [item.id]: (next.consumables[item.id] ?? 0) + 1 } };
    } else if (item.slot === 'tool') {
      next = { ...next, tools: [...next.tools, item.id] };
    }
  }
  return (recipe.unlocks ?? []).reduce(unlockRecipe, next);
}

/** How many of a recipe the materials cover right now. */
export function craftableCount(save: SaveData, recipe: RecipeDef) {
  if (!canCraft(save, recipe)) return 0;
  const { anyShards } = recipe;
  return Math.min(
    ...recipe.inputs.map((input) => Math.floor((save.materials[input.materialId] ?? 0) / input.amount)),
    ...(recipe.gold ? [Math.floor(save.gold / recipe.gold)] : []),
    // Each craft takes the element held most, so every element's shards count.
    ...(anyShards ? [ELEMENTS.reduce((sum, element) => sum + Math.floor((save.materials[shardId(element)] ?? 0) / anyShards), 0)] : []),
  );
}

/** Crafts a Provisions recipe `count` times in one go. */
export function craftMany(save: SaveData, recipe: RecipeDef, count: number): SaveData {
  if (recipe.station !== 'provisions') throw new Error(`${recipe.id} can't be batch crafted`);
  if (craftableCount(save, recipe) < count) throw new Error(`Cannot craft ${count} ${recipe.id}`);
  let next = save;
  for (let i = 0; i < count; i++) next = craft(next, recipe);
  return next;
}

export type ForgeResult = { gear: GearInstance };

/** What a forge made, from the saves before and after it, for the result banner. */
export function forgeResult(before: SaveData, after: SaveData): ForgeResult | null {
  const gear = after.gear.find((g) => !before.gear.some((b) => b.uid === g.uid));
  if (!gear) return null;
  const item = itemById[gear.itemId];
  if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'helmet' && item.slot !== 'offhand') return null;
  return { gear };
}
