import { forgeRules } from '@/content/forging';
import { itemById, recipeById } from '@/content/lookup';

import { gainMastery, masteryOf, masteryTypeOf, startingMastery } from '../forging/mastery';
import { qualityOdds, rollQuality } from '../forging/quality';
import { createRng } from '../generation/rng';
import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearInstance, MasteryState, MasteryType, Quality, RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  return save.knownRecipes.includes(recipe.id);
}

/** Tools are crafted once; afterwards their recipe has nothing left to make. */
export function ownsTool(save: SaveData, recipe: RecipeDef) {
  return 'itemId' in recipe.output && save.tools.includes(recipe.output.itemId);
}

/** Gold a recipe costs: forged weapons, armour and tools by item tier; smelting, alchemy and the tutorial are free. */
export function forgeFee(save: SaveData, recipe: RecipeDef, rules: typeof forgeRules = forgeRules) {
  if (recipe.station !== 'forge' || !('itemId' in recipe.output) || save.tutorial.step !== 'done') return 0;
  const item = itemById[recipe.output.itemId];
  return item.slot === 'consumable' ? 0 : (rules.fees[item.tier - 1] ?? 0);
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return (
    isKnown(save, recipe) &&
    !ownsTool(save, recipe) &&
    hasMaterials(save.materials, recipe.inputs) &&
    save.gold >= forgeFee(save, recipe)
  );
}

/** The gear a recipe forges, if it makes a weapon or armour piece. */
export function forgedItem(recipe: RecipeDef) {
  if (!('itemId' in recipe.output)) return null;
  const item = itemById[recipe.output.itemId];
  return item.slot === 'weapon' || item.slot === 'armor' ? item : null;
}

/** Learns a recipe; a weapon type met for the first time gets its starting mastery. */
export function unlockRecipe(save: SaveData, recipeId: string): SaveData {
  if (save.knownRecipes.includes(recipeId)) return save;
  const next = { ...save, knownRecipes: [...save.knownRecipes, recipeId] };
  const item = forgedItem(recipeById[recipeId]);
  if (!item || next.mastery[masteryTypeOf(item)]) return next;
  return { ...next, mastery: { ...next.mastery, [masteryTypeOf(item)]: startingMastery(item.tier) } };
}

/**
 * Consumes the inputs and adds the output: a material, a consumable, a tool or
 * a new gear piece. Gear rolls its quality from the player's mastery (seeded by
 * its uid, so it can't be rerolled) and raises that mastery. Also teaches the
 * recipes this one unlocks.
 */
export function craft(save: SaveData, recipe: RecipeDef, forceQuality?: Quality): SaveData {
  if (!canCraft(save, recipe)) throw new Error(`Cannot craft ${recipe.id}`);
  let next: SaveData = { ...save, gold: save.gold - forgeFee(save, recipe), materials: removeMaterials(save.materials, recipe.inputs) };

  const gearItem = forgedItem(recipe);
  if ('materialId' in recipe.output) {
    next = { ...next, materials: addMaterials(next.materials, [recipe.output]) };
  } else if (gearItem) {
    const uid = `g${next.nextUid}`;
    const type = masteryTypeOf(gearItem);
    const mastery = masteryOf(next, type);
    const quality =
      forceQuality ?? rollQuality(qualityOdds(mastery.level, gearItem.tier), createRng(`${uid}|${recipe.id}`));
    next = {
      ...next,
      gear: [...next.gear, { uid, itemId: gearItem.id, quality }],
      mastery: { ...next.mastery, [type]: gainMastery(mastery, gearItem.tier) },
      nextUid: next.nextUid + 1,
    };
  } else {
    const item = itemById[recipe.output.itemId];
    if (item.slot === 'consumable') {
      next = { ...next, consumables: { ...next.consumables, [item.id]: (next.consumables[item.id] ?? 0) + 1 } };
    } else if (item.slot === 'tool') {
      next = { ...next, tools: [...next.tools, item.id] };
    }
  }
  return (recipe.unlocks ?? []).reduce(unlockRecipe, next);
}

export type ForgeResult = { gear: GearInstance; type: MasteryType; mastery: MasteryState; levelUp: boolean };

/** What a forge made, from the saves before and after it, for the result banner. */
export function forgeResult(before: SaveData, after: SaveData): ForgeResult | null {
  const gear = after.gear.find((g) => !before.gear.some((b) => b.uid === g.uid));
  if (!gear) return null;
  const item = itemById[gear.itemId];
  if (item.slot !== 'weapon' && item.slot !== 'armor') return null;
  const type = masteryTypeOf(item);
  const mastery = masteryOf(after, type);
  return { gear, type, mastery, levelUp: mastery.level > masteryOf(before, type).level };
}
