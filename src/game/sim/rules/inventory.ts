import { charms } from '@/content/loot/charms';
import { monsterParts } from '@/content/loot/monsterParts';
import { xpRules } from '@/content/heroes';
import { itemById, recipeById, relicById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { shopRules } from '@/content/shops';

import { canCraft, craftableCount, craftMany, isKnown } from '../../crafting/crafting';
import { highestUnlockedTier } from '../../dungeons/unlock';
import { relicRecipe } from '../../forging/relics';
import { distanceMeters } from '../../generation/geo';
import { manualXp, readManual } from '../../loot/manuals';
import type { ManualRarity } from '../../loot/types';
import { placesWithin } from '../../places/generate';
import { sellMaterial, sellMaterialProblem, sellValuable, sellValuableProblem } from '../../places/shops';
import { isPlaceRevealed } from '../../reveal/reveal';
import type { SaveData } from '../../save';
import type { ConsumableDef, RecipeDef } from '../../types';
import { act, homeHeroes, mark, nextForgeRecipe, type Sim } from '../bot';
import { oilIds, statPotionIds } from './loadout';

/** A recipe whose output is an item, with the output narrowed to its itemId. */
type ItemRecipe = RecipeDef & { output: { itemId: string } };

const charmIds = new Set(charms.map((c) => c.id));
const charmRecipes: ItemRecipe[] = recipes.filter((r): r is ItemRecipe => 'itemId' in r.output && charmIds.has(r.output.itemId));
const partIds = new Set(monsterParts.map((part) => part.id));

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

/** The nearest open, revealed market within 1500 m, else null. */
export function nearestMarket(sim: Sim) {
  if (!isPlaceRevealed(sim.save, 'market')) return null;
  return (
    placesWithin(sim.location, 1500, sim.now)
      .filter((spawn) => spawn.kind === 'market' && spawn.startsAt <= sim.now && spawn.expiresAt > sim.now)
      .sort((a, b) => distanceMeters(sim.location, a.position) - distanceMeters(sim.location, b.position))[0] ?? null
  );
}

/** Sells everything from `valuablesToSell` at the nearest market within 1500 m, the collector included through the market's price. */
export function sellValuables(sim: Sim) {
  const market = nearestMarket(sim);
  if (!market) return;
  let sold = false;
  for (const { key, count } of valuablesToSell(sim.save)) {
    if (sellValuableProblem(sim.save, market, key, count, market.position, sim.now) !== null) continue;
    act(sim, 'valuables', (save) => sellValuable(save, market, key, count, market.position, sim.now));
    sold = true;
  }
  if (sold) sim.log.places.push({ day: sim.day, kind: 'market', tier: highestUnlockedTier(sim.save), odds: null, won: null });
}

/** Sells every material held above the cap, down to it, never below what the next planned forge needs. */
export function sellMaterials(sim: Sim) {
  const market = nearestMarket(sim);
  if (!market) return;
  const reserved = Object.fromEntries((nextForgeRecipe(sim.save)?.inputs ?? []).map((i) => [i.materialId, i.amount]));
  let sold = false;
  for (const [id, held] of Object.entries(sim.save.materials)) {
    const count = Math.min(held - sim.config.sellMaterialsAbove, held - (reserved[id] ?? 0));
    if (count <= 0 || sellMaterialProblem(sim.save, market, id, count, market.position, sim.now) !== null) continue;
    act(sim, 'materials', (save) => sellMaterial(save, market, id, count, market.position, sim.now));
    sold = true;
  }
  if (sold) sim.log.places.push({ day: sim.day, kind: 'market', tier: highestUnlockedTier(sim.save), odds: null, won: null });
}

/** Every monster part held above `keepAbove`, minus one craft of each known charm and potion recipe that uses it; only lines with count > 0. */
export function partsToSell(save: SaveData, keepAbove: number): { id: string; count: number }[] {
  const reserved: Record<string, number> = {};
  const partRecipes = recipes.filter((r): r is ItemRecipe => 'itemId' in r.output && (charmIds.has(r.output.itemId) || (itemById[r.output.itemId] as ConsumableDef | undefined)?.slot === 'consumable'));
  for (const recipe of partRecipes.filter((r) => isKnown(save, r))) {
    for (const { materialId, amount } of recipe.inputs) {
      if (partIds.has(materialId)) reserved[materialId] = (reserved[materialId] ?? 0) + amount;
    }
  }
  return monsterParts
    .map((part) => {
      const held = save.materials[part.id] ?? 0;
      return { id: part.id, count: Math.min(held - keepAbove, held - (reserved[part.id] ?? 0)) };
    })
    .filter((line) => line.count > 0);
}

/** The nearest live, revealed place that buys monster parts within 1500 m, else null. */
export function nearestPartBuyer(sim: Sim) {
  return (
    placesWithin(sim.location, 1500, sim.now)
      .filter((spawn) => shopRules.partBuyers.includes(spawn.kind) && isPlaceRevealed(sim.save, spawn.kind) && spawn.startsAt <= sim.now && spawn.expiresAt > sim.now)
      .sort((a, b) => distanceMeters(sim.location, a.position) - distanceMeters(sim.location, b.position))[0] ?? null
  );
}

/** Sells every monster part held above the cap at the nearest part buyer within 1500 m, keeping one craft of each known part recipe. */
export function sellParts(sim: Sim) {
  const buyer = nearestPartBuyer(sim);
  if (!buyer) return;
  let sold = false;
  for (const { id, count } of partsToSell(sim.save, sim.config.sellPartsAbove)) {
    if (sellMaterialProblem(sim.save, buyer, id, count, buyer.position, sim.now) !== null) continue;
    act(sim, 'materials', (save) => sellMaterial(save, buyer, id, count, buyer.position, sim.now));
    sold = true;
  }
  if (sold) sim.log.places.push({ day: sim.day, kind: buyer.kind, tier: highestUnlockedTier(sim.save), odds: null, won: null });
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

/** Crafts each item up to its stock (its part recipe when the parts are held, else the base recipe when known). */
function craftUpTo(sim: Sim, itemIds: string[], stock: number) {
  for (const itemId of itemIds) {
    const base = recipeById[itemId];
    const recipe = partRecipeFor(sim.save, itemId) ?? (base && isKnown(sim.save, base) ? base : null);
    if (!recipe) continue;
    const n = Math.min(stock - (sim.save.consumables[itemId] ?? 0), craftableCount(sim.save, recipe));
    if (n <= 0) continue;
    act(sim, 'alchemy', (save) => craftMany(save, recipe, n));
    for (let i = 0; i < n; i++) {
      sim.log.crafts.push({ day: sim.day, kind: 'consumable', itemId, tier: 0, quality: null, roll: null, mastery: null, materials: {} });
    }
  }
}

/** Crafts each stat potion (its part recipe when the parts are held) up to the stat-potions-per-kind stock. */
export const craftStatPotions = (sim: Sim) => craftUpTo(sim, statPotionIds, sim.config.provisions.statPotions);

/** Crafts each elemental oil (its part recipe when the parts are held) up to the oils-per-kind stock. */
export const craftOils = (sim: Sim) => craftUpTo(sim, oilIds, sim.config.provisions.oils);

/** Crafts each combat elixir (firebomb, smoke bomb, revival draught) up to the combat-elixirs stock. */
export const craftCombatElixirs = (sim: Sim) => craftUpTo(sim, ['firebomb', 'smokeBomb', 'revivalDraught'], sim.config.provisions.combatElixirs);

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
