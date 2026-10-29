import { gearLuckRules } from '@/content/equipment';
import { itemById, recipeById } from '@/content/lookup';

import { highestUnlockedTier } from '../dungeons/unlock';
import { gainMastery, masteryOf, masteryTypeOf, startingMastery } from '../forging/mastery';
import { qualityOdds, rollQuality } from '../forging/quality';
import { rollStatFactor } from '../forging/roll';
import { createRng } from '../generation/rng';
import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearInstance, MasteryState, MasteryType, Quality, RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  // Kit recipes come with the tiers: known once the player reaches their tier.
  return (
    save.knownRecipes.includes(recipe.id) ||
    (recipe.availableFromTier !== undefined && highestUnlockedTier(save) >= recipe.availableFromTier)
  );
}

/** Tools are crafted once; afterwards their recipe has nothing left to make. */
export function ownsTool(save: SaveData, recipe: RecipeDef) {
  return 'itemId' in recipe.output && save.tools.includes(recipe.output.itemId);
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return isKnown(save, recipe) && !ownsTool(save, recipe) && hasMaterials(save.materials, recipe.inputs);
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

/** Teaches every recipe, each new type starting its mastery as `unlockRecipe` does (debug). */
export function learnAllRecipes(save: SaveData): SaveData {
  return Object.keys(recipeById).reduce<SaveData>((next, id) => unlockRecipe(next, id), save);
}

/**
 * Consumes the inputs and adds the output: a material, a consumable, a tool or
 * a new gear piece. Gear rolls its quality from the player's mastery (seeded by
 * its uid, so it can't be rerolled) and raises that mastery. Also teaches the
 * recipes this one unlocks.
 */
export function craft(save: SaveData, recipe: RecipeDef, forceQuality?: Quality): SaveData {
  if (!canCraft(save, recipe)) throw new Error(`Cannot craft ${recipe.id}`);
  let next: SaveData = { ...save, materials: removeMaterials(save.materials, recipe.inputs) };

  const gearItem = forgedItem(recipe);
  if ('materialId' in recipe.output) {
    next = { ...next, materials: addMaterials(next.materials, [recipe.output]) };
  } else if (gearItem) {
    const uid = `g${next.nextUid}`;
    const type = masteryTypeOf(gearItem);
    const mastery = masteryOf(next, type);
    const quality =
      forceQuality ?? rollQuality(qualityOdds(mastery.level, gearItem.tier), createRng(`${uid}|${recipe.id}`));
    // A Legendary forge also rolls +1 Luck, seeded by the piece's uid.
    const luck = quality === 'legendary' && createRng(`${uid}|luck`).chance(gearLuckRules.chance) ? 1 : undefined;
    next = {
      ...next,
      gear: [
        ...next.gear,
        { uid, itemId: gearItem.id, quality, roll: rollStatFactor(uid, mastery.level, gearItem.tier), ...(luck ? { luck } : {}) },
      ],
      mastery: { ...next.mastery, [type]: gainMastery(mastery, gearItem.tier) },
      nextUid: next.nextUid + 1,
    };
  } else {
    const item = itemById[recipe.output.itemId];
    if (item.slot === 'consumable' || item.slot === 'provision') {
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
  return Math.min(...recipe.inputs.map((input) => Math.floor((save.materials[input.materialId] ?? 0) / input.amount)));
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
