import { items } from '@/content/items';
import { componentById, monsterPartById, relicById, valuableById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import type { Purpose } from '@/content/loot/purposes';
import { PURPOSES } from '@/content/loot/purposes';
import { recipes } from '@/content/recipes';
import { isKnown } from '@/game/crafting/crafting';
import { ELEMENTS, shardId, stoneId } from '@/game/elements';
import { relicRecipe } from '@/game/forging/relics';
import type { ConsumableDef, MaterialStack, RecipeDef } from '@/game/types';
import type { SaveData } from '@/game/save';

import { valuablePrice } from './catalogue';

export type BaseItemRef =
  | { kind: 'material'; id: string } // materials, shards, stones, monster parts, components
  | { kind: 'valuable'; id: string; tier?: number }
  | { kind: 'relic'; id: string }
  | { kind: 'weakness'; id: string } // boss weakness items (items with `weakness`)
  | { kind: 'keyFragment' }
  | { kind: 'mysteriousKey' }
  | { kind: 'treasureMap' }
  | { kind: 'manual' }
  | { kind: 'blueprint'; id: string };

/** Ids any recipe (or infusion) takes as an input; gear recipes are in `recipes`. */
export function ingredientIds(recipeList: RecipeDef[] = recipes): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipeList) {
    for (const input of recipe.inputs) ids.add(input.materialId);
  }
  // Infusions use one stone per element; shards merge into stones.
  for (const element of ELEMENTS) {
    ids.add(stoneId(element));
    ids.add(shardId(element));
  }
  return ids;
}

/** True when an id counts as an ingredient, never mind what holds it. */
function isIngredient(id: string, ingredients: Set<string>): boolean {
  return (
    ingredients.has(id) ||
    // Parts and gems with a listed use, and every component (forged into an item).
    !!monsterPartById[id]?.uses ||
    !!valuableById[id]?.uses ||
    !!componentById[id]
  );
}

/** The purpose tags of a base item, in `PURPOSES` order. */
export function purposesOf(ref: BaseItemRef, recipeList: RecipeDef[] = recipes): Purpose[] {
  const ingredients = ingredientIds(recipeList);
  const purposes: Purpose[] = [];
  const add = (purpose: Purpose) => purposes.push(purpose);

  switch (ref.kind) {
    case 'material':
      if (isIngredient(ref.id, ingredients)) add('ingredient');
      break;
    case 'valuable':
      if (isIngredient(ref.id, ingredients)) add('ingredient');
      add('good');
      break;
    case 'relic':
      add('restore');
      break;
    case 'weakness':
      add('quest');
      break;
    case 'keyFragment':
      add('collect');
      break;
    case 'mysteriousKey':
    case 'treasureMap':
    case 'manual':
    case 'blueprint':
      add('use');
      break;
  }
  return purposes.sort((a, b) => PURPOSES.indexOf(a) - PURPOSES.indexOf(b));
}

export type NextStep =
  | { kind: 'recipes'; known: string[]; unknown: boolean } // recipe ids using it that the save knows; unknown = some recipe uses it that isn't known (or none known)
  | { kind: 'sell'; place: 'market'; price: number }
  | { kind: 'boss'; bossId: string }
  | { kind: 'set'; have: number; need: number }
  | { kind: 'restore'; cost: MaterialStack[] } // the relic's restore cost: its type's recipe at its tier ×1.5 rounded up, plus the tier's gem
  | { kind: 'action'; action: 'read' | 'open' | 'learn' };

/** What tapping the item shows, one step per purpose. */
export function nextSteps(save: SaveData, ref: BaseItemRef, recipeList: RecipeDef[] = recipes): NextStep[] {
  const id = 'id' in ref ? ref.id : null;
  return purposesOf(ref, recipeList).map((purpose): NextStep => {
    switch (purpose) {
      case 'ingredient': {
        const using = recipeList.filter((r) => r.inputs.some((input) => input.materialId === id));
        const known = using.filter((r) => isKnown(save, r)).map((r) => r.id);
        return { kind: 'recipes', known, unknown: known.length === 0 || using.some((r) => !isKnown(save, r)) };
      }
      case 'good':
        return { kind: 'sell', place: 'market', price: valuablePrice(id!, ref.kind === 'valuable' ? ref.tier ?? 1 : 1) };
      case 'quest':
        return { kind: 'boss', bossId: bossByWeaknessItem.get(id!) ?? '' };
      case 'collect':
        return { kind: 'set', have: save.keyFragments, need: lootConfig.keyFragmentsPerKey };
      case 'restore': {
        const relic = relicById[id!];
        const recipe = relicRecipe(relic);
        return {
          kind: 'restore',
          cost: [...recipe.inputs, { materialId: recipe.valuables![0].valuableId, amount: 1 }],
        };
      }
      case 'use':
        return {
          kind: 'action',
          action: ref.kind === 'mysteriousKey' ? 'open' : ref.kind === 'blueprint' ? 'learn' : 'read',
        };
    }
  });
}

/** Every boss weakness item, for walking the catalogue in tests and later UI. */
export const weaknessItems = items.filter((item): item is ConsumableDef => 'weakness' in item);

const bossByWeaknessItem = new Map<string, string>();
for (const item of weaknessItems) {
  if (item.weakness) bossByWeaknessItem.set(item.id, item.weakness);
}
