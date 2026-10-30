import { charms } from '@/content/loot/charms';
import { xpRules } from '@/content/heroes';
import { relicById } from '@/content/lookup';
import { recipes } from '@/content/recipes';

import { canCraft, craftableCount, craftMany, isKnown } from '../../crafting/crafting';
import { highestUnlockedTier } from '../../dungeons/unlock';
import { relicRecipe } from '../../forging/relics';
import { distanceMeters } from '../../generation/geo';
import { manualXp, readManual } from '../../loot/manuals';
import type { ManualRarity } from '../../loot/types';
import { placesWithin } from '../../places/generate';
import { sellValuable, sellValuableProblem } from '../../places/shops';
import type { SaveData } from '../../save';
import type { RecipeDef } from '../../types';
import { act, homeHeroes, mark, type Sim } from '../bot';

/** A recipe whose output is an item, with the output narrowed to its itemId. */
type ItemRecipe = RecipeDef & { output: { itemId: string } };

const charmIds = new Set(charms.map((c) => c.id));
const charmRecipes: ItemRecipe[] = recipes.filter((r): r is ItemRecipe => 'itemId' in r.output && charmIds.has(r.output.itemId));

/** Every valuable held, minus the gems the held relics need to be restored and one craft of each known charm recipe; only lines with count > 0. */
export function valuablesToSell(save: SaveData): { key: string; count: number }[] {
  const held = { ...save.valuables };
  const reserve = (valuableId: string, amount: number) => {
    let left = amount;
    const keys = Object.keys(held)
      .filter((key) => key.startsWith(`${valuableId}:`))
      .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]));
    for (const key of keys) {
      const take = Math.min(left, held[key]);
      held[key] -= take;
      left -= take;
      if (held[key] === 0) delete held[key];
    }
  };
  for (const { relicId } of save.relics) {
    for (const { valuableId, amount } of relicRecipe(relicById[relicId]).valuables ?? []) reserve(valuableId, amount);
  }
  for (const recipe of charmRecipes.filter((r) => isKnown(save, r))) {
    for (const { valuableId, amount } of recipe.valuables ?? []) reserve(valuableId, amount);
  }
  return Object.entries(held)
    .map(([key, count]) => ({ key, count }))
    .filter((line) => line.count > 0);
}

/** Sells everything from `valuablesToSell` at the nearest market within 1500 m, the collector included through the market's price. */
export function sellValuables(sim: Sim) {
  const market = placesWithin(sim.location, 1500, sim.now)
    .filter((spawn) => spawn.kind === 'market' && spawn.startsAt <= sim.now && spawn.expiresAt > sim.now)
    .sort((a, b) => distanceMeters(sim.location, a.position) - distanceMeters(sim.location, b.position))[0];
  if (!market) return;
  for (const { key, count } of valuablesToSell(sim.save)) {
    if (sellValuableProblem(sim.save, market, key, count, market.position, sim.now) !== null) continue;
    act(sim, 'valuables', (save) => sellValuable(save, market, key, count, market.position, sim.now));
  }
}

/** A known part recipe that makes this item and can be crafted now (parts held), else null. */
export function partRecipeFor(save: SaveData, itemId: string): RecipeDef | null {
  return (
    recipes.find(
      (r): r is ItemRecipe => !!r.unlockedBy && 'itemId' in r.output && r.output.itemId === itemId && !charmIds.has(r.output.itemId) && canCraft(save, r),
    ) ?? null
  );
}

/** Crafts every known charm recipe up to the charms-per-kind stock. */
export function craftCharms(sim: Sim) {
  for (const recipe of charmRecipes.filter((r) => isKnown(sim.save, r))) {
    const missing = sim.config.provisions.charms - (sim.save.consumables[recipe.output.itemId] ?? 0);
    const n = Math.min(missing, craftableCount(sim.save, recipe));
    if (n <= 0) continue;
    act(sim, 'alchemy', (save) => craftMany(save, recipe, n));
    for (let i = 0; i < n; i++) {
      sim.log.crafts.push({ day: sim.day, kind: 'consumable', itemId: recipe.output.itemId, tier: 0, quality: null, roll: null, mastery: null, materials: {} });
    }
    mark(sim, 'charmCrafted');
  }
}

/** Reads every training manual held to the home hero with the lowest level below the max level. */
export function readManuals(sim: Sim) {
  const tier = highestUnlockedTier(sim.save);
  for (const rarity of ['common', 'rare', 'legendary'] as ManualRarity[]) {
    for (let left = sim.save.manuals[rarity] ?? 0; left > 0; left--) {
      const hero = homeHeroes(sim.save)
        .filter((h) => h.level < xpRules.maxLevel)
        .sort((a, b) => a.level - b.level)[0];
      if (!hero || manualXp(hero, rarity, tier) <= 0) break;
      act(sim, 'manual', (save) => readManual(save, hero.id, rarity));
    }
  }
}
