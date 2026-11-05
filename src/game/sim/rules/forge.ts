import { gearId } from '@/content/equipment';
import { itemById, recipeById, relicById } from '@/content/lookup';
import { recipes } from '@/content/recipes';

import { forgedItem, isKnown } from '../../crafting/crafting';
import { pieceDamageStat } from '../../equipment/damageStat';
import { canForgeWithIngredient, forgeWithIngredient, ingredientAffixId, ingredients } from '../../forging/components';
import { canRestore, restoreRelic } from '../../forging/relics';
import type { SaveData } from '../../save';
import { affinityOf, equip } from '../../team/team';
import type { GearDef, HeroState, OffhandType } from '../../types';
import { RARITY_ORDER, act, homeHeroes, mark, type CraftRow, type Sim } from '../bot';
import { affixFits, planGear } from './gear';

type Slot = 'weapon' | 'armor' | 'offhand';
const SLOTS: Slot[] = ['weapon', 'armor', 'offhand'];

const gearOf = (save: SaveData, uid: string | null) => save.gear.find((g) => g.uid === uid);

/** The heroes the ids name, in order. */
const heroesOf = (save: SaveData, heroIds: string[]) =>
  heroIds.map((id) => save.heroes.find((h) => h.id === id)).filter((h): h is HeroState => h !== undefined);

/** The off-hand that fits the hero's weapon: ammunition for a bow or crossbow, focus for a Magic weapon, shield for a one-handed Power weapon. */
function offhandTypeFor(save: SaveData, hero: HeroState): OffhandType | null {
  const weapon = gearOf(save, hero.equipment.weapon);
  const item = weapon ? (itemById[weapon.itemId] as GearDef) : null;
  if (!item || item.twoHanded) return null;
  if (item.gearType === 'bow' || item.gearType === 'crossbow') return 'quiver';
  return pieceDamageStat(item, hero.classId) === 'magic' ? 'focus' : 'shield';
}

/** Whether the hero can use the gear type: not unfit, and an off-hand that matches their weapon. */
function usableBy(save: SaveData, hero: HeroState, slot: Slot, gearType: NonNullable<GearDef['gearType']>) {
  if (slot === 'offhand') return offhandTypeFor(save, hero) === gearType;
  return affinityOf(hero.classId, gearType) !== 'unfit';
}

/** The tier and rarity a hero wears in a slot; an empty slot ranks weakest. */
const wornRank = (save: SaveData, hero: HeroState, slot: Slot): [number, number] => {
  const worn = gearOf(save, hero.equipment[slot]);
  if (!worn) return [-1, -1];
  return [(itemById[worn.itemId] as GearDef).tier, RARITY_ORDER.indexOf(worn.rarity)];
};

/**
 * The best ingredient forge on the table: highest tier, then the weakest worn
 * piece it replaces, never one of a higher tier; among equals, an ingredient
 * whose affix `fits` the day's plan (see rules/gear.ts) wins; without the
 * predicate, the first fitting ingredient in catalogue order stays.
 */
export function pickIngredientForge(save: SaveData, heroIds: string[], fits?: (affixId: string) => boolean): { recipeId: string; ingredientId: string; heroId: string; slot: Slot } | null {
  let best: { recipeId: string; ingredientId: string; heroId: string; slot: Slot; tier: number; fit: boolean; worn: [number, number] } | null = null;
  for (const ingredient of ingredients) {
    if ((save.materials[ingredient.id] ?? 0) <= 0) continue;
    for (const hero of heroesOf(save, heroIds)) {
      for (const slot of SLOTS) {
        const recipe = recipes
          .filter((r) => {
            const item = forgedItem(r);
            return !!item?.gearType && item.slot === slot && isKnown(save, r) && ingredientAffixId(ingredient.id, item.gearType) && usableBy(save, hero, slot, item.gearType);
          })
          .sort((a, b) => {
            const mine = forgedItem(a)!;
            const other = forgedItem(b)!;
            return (
              other.tier - mine.tier ||
              Number(affinityOf(hero.classId, other.gearType) === 'favoured') - Number(affinityOf(hero.classId, mine.gearType) === 'favoured')
            );
          })[0];
        if (!recipe || !canForgeWithIngredient(save, recipe, ingredient.id)) continue;
        const tier = forgedItem(recipe)!.tier;
        const worn = wornRank(save, hero, slot);
        if (worn[0] > tier) continue;
        const fit = !!fits?.(ingredientAffixId(ingredient.id, forgedItem(recipe)!.gearType!)!);
        const weakest = (other: { worn: [number, number] }) => worn[0] < other.worn[0] || (worn[0] === other.worn[0] && worn[1] < other.worn[1]);
        if (!best || tier > best.tier || (tier === best.tier && (fit !== best.fit ? fit : weakest(best)))) {
          best = { recipeId: recipe.id, ingredientId: ingredient.id, heroId: hero.id, slot, tier, fit, worn };
        }
      }
    }
  }
  return best ? { recipeId: best.recipeId, ingredientId: best.ingredientId, heroId: best.heroId, slot: best.slot } : null;
}

/** The best relic on the table: highest tier, a favoured affinity, and never below the piece it replaces. */
export function pickRelic(save: SaveData, heroIds: string[]): { relicUid: string; heroId: string; slot: Slot } | null {
  let best: { relicUid: string; heroId: string; slot: Slot; tier: number; favoured: number; worn: number } | null = null;
  for (const held of save.relics) {
    const relic = relicById[held.relicId];
    if (!relic || !canRestore(save, held.uid)) continue;
    const item = itemById[gearId(relic.gearType, relic.tier)] as GearDef;
    const slot = item.slot as Slot;
    if (!SLOTS.includes(slot)) continue;
    for (const hero of heroesOf(save, heroIds)) {
      if (!usableBy(save, hero, slot, relic.gearType)) continue;
      const worn = wornRank(save, hero, slot);
      if (worn[0] > relic.tier) continue;
      const favoured = slot !== 'offhand' && affinityOf(hero.classId, relic.gearType) === 'favoured' ? 1 : 0;
      if (!best || relic.tier > best.tier || (relic.tier === best.tier && (favoured > best.favoured || (favoured === best.favoured && worn[0] < best.worn)))) {
        best = { relicUid: held.uid, heroId: hero.id, slot, tier: relic.tier, favoured, worn: worn[0] };
      }
    }
  }
  return best ? { relicUid: best.relicUid, heroId: best.heroId, slot: best.slot } : null;
}

/** Logs the piece an action added, as recordCraft does, and returns it. */
function logCraft(sim: Sim, kind: 'component' | 'relic', before: SaveData, materials: Record<string, number>) {
  const gear = sim.save.gear.find((g) => !before.gear.some((b) => b.uid === g.uid));
  if (!gear) return null;
  const item = itemById[gear.itemId] as GearDef;
  const row: CraftRow = {
    day: sim.day,
    kind,
    itemId: item.id,
    tier: item.tier,
    rarity: gear.rarity,
    roll: gear.roll,
    materials,
  };
  sim.log.crafts.push(row);
  return gear;
}

/** Forges held ingredients (parts and components) onto the best fitting pieces and equips them, until nothing fits; a fitting affix that helps against the day's dungeons beats one that doesn't. */
export function forgeIngredients(sim: Sim) {
  const plan = planGear(sim.save, sim.rotation);
  const fits = (affixId: string) => affixFits(plan, affixId);
  const cap = Object.values(sim.save.materials).reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; i < cap; i++) {
    const heroIds = homeHeroes(sim.save).map((h) => h.id);
    const pick = pickIngredientForge(sim.save, heroIds, fits);
    if (!pick) return;
    mark(sim, 'componentFound');
    const before = sim.save;
    const materials = act(sim, 'forge', (save) => forgeWithIngredient(save, recipeById[pick.recipeId], pick.ingredientId));
    const gear = logCraft(sim, 'component', before, materials);
    if (!gear) return;
    act(sim, 'equip', (save) => equip(save, pick.heroId, pick.slot, gear.uid));
    mark(sim, 'componentForged');
  }
}

/** Restores held relics whose type fits a hero and equips them, until none is worth it. */
export function restoreRelics(sim: Sim) {
  for (let i = sim.save.relics.length; i > 0; i--) {
    const heroIds = homeHeroes(sim.save).map((h) => h.id);
    const pick = pickRelic(sim.save, heroIds);
    if (!pick) return;
    mark(sim, 'relicFound');
    const before = sim.save;
    const materials = act(sim, 'forge', (save) => restoreRelic(save, pick.relicUid));
    const gear = logCraft(sim, 'relic', before, materials);
    if (!gear) return;
    act(sim, 'equip', (save) => equip(save, pick.heroId, pick.slot, gear.uid));
    mark(sim, 'relicRestored');
  }
}
