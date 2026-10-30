import { gearLuckRules } from '@/content/equipment';
import { masteryRules } from '@/content/forging';
import { itemById, recipeById } from '@/content/lookup';

import { highestUnlockedTier } from '../dungeons/unlock';
import { ELEMENTS, shardId, type Element } from '../elements';
import { gainMastery, masteryOf, masteryTypeOf, startingMastery } from '../forging/mastery';
import { qualityOdds, rollQuality } from '../forging/quality';
import { rollStatFactor } from '../forging/roll';
import { createRng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import { tierRecipes } from './recipeUnlocks';
import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, MasteryState, MasteryType, MaterialStack, Quality, RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  // Part recipes need their parts seen as well as their tier.
  if (recipe.unlockedBy) return save.partRecipes.includes(recipe.id) && highestUnlockedTier(save) >= (recipe.availableFromTier ?? 1);
  // Kit recipes come with the tiers alone: known once the player reaches their tier.
  if (recipe.availableFromTier !== undefined) return highestUnlockedTier(save) >= recipe.availableFromTier;
  return save.knownRecipes.includes(recipe.id);
}

/** Tools are crafted once; afterwards their recipe has nothing left to make. */
export function ownsTool(save: SaveData, recipe: RecipeDef) {
  return 'itemId' in recipe.output && save.tools.includes(recipe.output.itemId);
}

const valuableTier = (key: string) => Number(key.split(':')[1]);

/** The element a recipe's `anyShards` takes: the one held most, if there are enough. */
export function shardElementFor(save: SaveData, recipe: RecipeDef): Element | null {
  if (!recipe.anyShards) return null;
  const element = [...ELEMENTS].sort((a, b) => (save.materials[shardId(b)] ?? 0) - (save.materials[shardId(a)] ?? 0))[0];
  return (save.materials[shardId(element)] ?? 0) >= recipe.anyShards ? element : null;
}

/** What one craft spends: materials (shards included) and valuables, lowest tier first; null when short. */
export function recipeCost(save: SaveData, recipe: RecipeDef): { materials: MaterialStack[]; valuables: Record<string, number> } | null {
  const materials = [...recipe.inputs];
  if (recipe.anyShards) {
    const element = shardElementFor(save, recipe);
    if (!element) return null;
    materials.push({ materialId: shardId(element), amount: recipe.anyShards });
  }
  if (!hasMaterials(save.materials, materials)) return null;
  const valuables = { ...save.valuables };
  for (const { valuableId, amount } of recipe.valuables ?? []) {
    let left = amount;
    const keys = Object.keys(valuables)
      .filter((key) => key.startsWith(`${valuableId}:`))
      .sort((a, b) => valuableTier(a) - valuableTier(b));
    for (const key of keys) {
      const take = Math.min(left, valuables[key]);
      valuables[key] -= take;
      left -= take;
      if (valuables[key] === 0) delete valuables[key];
    }
    if (left > 0) return null;
  }
  return { materials, valuables };
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return isKnown(save, recipe) && !ownsTool(save, recipe) && recipeCost(save, recipe) !== null;
}

/** The gear a recipe forges, if it makes a weapon, armour or off-hand piece. */
export function forgedItem(recipe: RecipeDef) {
  if (!('itemId' in recipe.output)) return null;
  const item = itemById[recipe.output.itemId];
  return item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'offhand' ? item : null;
}

/** Learns a recipe; a weapon type met for the first time gets its starting mastery. */
export function unlockRecipe(save: SaveData, recipeId: string): SaveData {
  if (save.knownRecipes.includes(recipeId)) return save;
  const next = { ...save, knownRecipes: [...save.knownRecipes, recipeId] };
  const item = forgedItem(recipeById[recipeId]);
  if (!item || next.mastery[masteryTypeOf(item)]) return next;
  return { ...next, mastery: { ...next.mastery, [masteryTypeOf(item)]: startingMastery(item.tier) } };
}

/** Removes a recipe from the known list, mastery untouched (debug). */
export function forgetRecipe(save: SaveData, recipeId: string): SaveData {
  return { ...save, knownRecipes: save.knownRecipes.filter((id) => id !== recipeId) };
}

/** Teaches every gear blueprint of a tier (debug). */
export const learnTier = (save: SaveData, tier: number): SaveData => tierRecipes(tier).reduce(unlockRecipe, save);

/** Teaches every recipe, each new type starting its mastery as `unlockRecipe` does (debug). */
export function learnAllRecipes(save: SaveData): SaveData {
  return Object.keys(recipeById).reduce<SaveData>((next, id) => unlockRecipe(next, id), save);
}

/**
 * The gear branch of a forge: a new piece with its quality rolled from
 * `oddsOf` (seeded by its uid, so it can't be rerolled), a Legendary luck
 * roll, a stat roll that climbs with mastery, and the mastery gained.
 * `extra` rides along on the piece.
 */
export function forgeGearPiece(
  next: SaveData,
  recipe: RecipeDef,
  gearItem: GearDef,
  oddsOf: (masteryLevel: number) => Record<Quality, number>,
  extra: Partial<GearInstance> = {},
  forceQuality?: Quality,
): SaveData {
  const uid = `g${next.nextUid}`;
  const type = masteryTypeOf(gearItem);
  const mastery = masteryOf(next, type);
  const quality = forceQuality ?? rollQuality(oddsOf(mastery.level), createRng(`${uid}|${recipe.id}`));
  // A Legendary forge also rolls +1 Luck, seeded by the piece's uid.
  const luck = quality === 'legendary' && createRng(`${uid}|luck`).chance(gearLuckRules.chance) ? 1 : undefined;
  return {
    ...next,
    gear: [
      ...next.gear,
      { uid, itemId: gearItem.id, quality, roll: rollStatFactor(uid, mastery.level, gearItem.tier), ...(luck ? { luck } : {}), ...extra },
    ],
    mastery: { ...next.mastery, [type]: gainMastery(mastery, gearItem.tier, masteryRules, 1 + guildBonus(next, 'mastery')) },
    nextUid: next.nextUid + 1,
  };
}

/**
 * Consumes the inputs and adds the output: a material, a consumable, a tool or
 * a new gear piece. Gear rolls its quality from the player's mastery (seeded by
 * its uid, so it can't be rerolled) and raises that mastery. Also teaches the
 * recipes this one unlocks.
 */
export function craft(save: SaveData, recipe: RecipeDef, forceQuality?: Quality): SaveData {
  const cost = canCraft(save, recipe) ? recipeCost(save, recipe) : null;
  if (!cost) throw new Error(`Cannot craft ${recipe.id}`);
  let next: SaveData = { ...save, materials: removeMaterials(save.materials, cost.materials), valuables: cost.valuables };

  const gearItem = forgedItem(recipe);
  if ('materialId' in recipe.output) {
    next = { ...next, materials: addMaterials(next.materials, [recipe.output]) };
  } else if (gearItem) {
    next = forgeGearPiece(next, recipe, gearItem, (level) => qualityOdds(level, gearItem.tier), {}, forceQuality);
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
    ...(recipe.valuables ?? []).map(({ valuableId, amount }) => {
      const held = Object.entries(save.valuables).reduce((sum, [key, n]) => (key.startsWith(`${valuableId}:`) ? sum + n : sum), 0);
      return Math.floor(held / amount);
    }),
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

export type ForgeResult = { gear: GearInstance; type: MasteryType; mastery: MasteryState; levelUp: boolean };

/** What a forge made, from the saves before and after it, for the result banner. */
export function forgeResult(before: SaveData, after: SaveData): ForgeResult | null {
  const gear = after.gear.find((g) => !before.gear.some((b) => b.uid === g.uid));
  if (!gear) return null;
  const item = itemById[gear.itemId];
  if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'offhand') return null;
  const type = masteryTypeOf(item);
  const mastery = masteryOf(after, type);
  return { gear, type, mastery, levelUp: mastery.level > masteryOf(before, type).level };
}
