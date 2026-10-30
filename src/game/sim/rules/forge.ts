import { components } from '@/content/loot/components';
import { gearId } from '@/content/equipment';
import { itemById, recipeById, relicById } from '@/content/lookup';
import { recipes } from '@/content/recipes';

import { forgedItem, isKnown } from '../../crafting/crafting';
import { canForgeWithComponent, componentFits, forgeWithComponent } from '../../forging/components';
import { masteryCap, masteryOf, masteryTypeOf } from '../../forging/mastery';
import { rollToScale } from '../../forging/roll';
import { canRestore, restoreRelic } from '../../forging/relics';
import type { SaveData } from '../../save';
import { affinityOf, equip } from '../../team/team';
import type { GearDef, HeroState, OffhandType } from '../../types';
import { QUALITY_ORDER, act, homeHeroes, mark, type CraftRow, type Sim } from '../bot';

type Slot = 'weapon' | 'armor' | 'offhand';
const SLOTS: Slot[] = ['weapon', 'armor', 'offhand'];

const gearOf = (save: SaveData, uid: string | null) => save.gear.find((g) => g.uid === uid);

/** The heroes the ids name, in order. */
const heroesOf = (save: SaveData, heroIds: string[]) =>
  heroIds.map((id) => save.heroes.find((h) => h.id === id)).filter((h): h is HeroState => h !== undefined);

/** The off-hand that fits the hero's weapon: quiver for a bow, focus for a Magic weapon, shield for a one-handed Power weapon. */
function offhandTypeFor(save: SaveData, hero: HeroState): OffhandType | null {
  const weapon = gearOf(save, hero.equipment.weapon);
  const item = weapon ? (itemById[weapon.itemId] as GearDef) : null;
  if (!item || item.twoHanded) return null;
  if (item.gearType === 'bow') return 'quiver';
  return item.damageStat === 'magic' ? 'focus' : 'shield';
}

/** Whether the hero can use the gear type: not unfit, and an off-hand that matches their weapon. */
function usableBy(save: SaveData, hero: HeroState, slot: Slot, gearType: NonNullable<GearDef['gearType']>) {
  if (slot === 'offhand') return offhandTypeFor(save, hero) === gearType;
  return affinityOf(hero.classId, gearType) !== 'unfit';
}

/** The tier and quality a hero wears in a slot; an empty slot ranks weakest. */
const wornRank = (save: SaveData, hero: HeroState, slot: Slot): [number, number] => {
  const worn = gearOf(save, hero.equipment[slot]);
  if (!worn) return [-1, -1];
  return [(itemById[worn.itemId] as GearDef).tier, QUALITY_ORDER.indexOf(worn.quality)];
};

/** The best component forge on the table: highest tier, then the weakest worn piece it replaces, never one of a higher tier. */
export function pickComponentForge(save: SaveData, heroIds: string[]): { recipeId: string; componentId: string; heroId: string; slot: Slot } | null {
  let best: { recipeId: string; componentId: string; heroId: string; slot: Slot; tier: number; worn: [number, number] } | null = null;
  for (const component of components) {
    if ((save.materials[component.id] ?? 0) <= 0) continue;
    for (const hero of heroesOf(save, heroIds)) {
      for (const slot of SLOTS) {
        const recipe = recipes
          .filter((r) => {
            const item = forgedItem(r);
            return !!item?.gearType && item.slot === slot && isKnown(save, r) && componentFits(component.id, item.gearType) && usableBy(save, hero, slot, item.gearType);
          })
          .sort((a, b) => {
            const mine = forgedItem(a)!;
            const other = forgedItem(b)!;
            return (
              other.tier - mine.tier ||
              Number(affinityOf(hero.classId, other.gearType) === 'favoured') - Number(affinityOf(hero.classId, mine.gearType) === 'favoured')
            );
          })[0];
        if (!recipe || !canForgeWithComponent(save, recipe, component.id)) continue;
        const tier = forgedItem(recipe)!.tier;
        const worn = wornRank(save, hero, slot);
        if (worn[0] > tier) continue;
        if (!best || tier > best.tier || (tier === best.tier && (worn[0] < best.worn[0] || (worn[0] === best.worn[0] && worn[1] < best.worn[1])))) {
          best = { recipeId: recipe.id, componentId: component.id, heroId: hero.id, slot, tier, worn };
        }
      }
    }
  }
  return best ? { recipeId: best.recipeId, componentId: best.componentId, heroId: best.heroId, slot: best.slot } : null;
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
  const type = masteryTypeOf(item);
  const row: CraftRow = {
    day: sim.day,
    kind,
    itemId: item.id,
    tier: item.tier,
    quality: gear.quality,
    roll: rollToScale(gear.roll ?? 1),
    mastery: masteryOf(sim.save, type).level,
    maxed: masteryOf(before, type).level >= masteryCap(item.tier),
    materials,
  };
  sim.log.crafts.push(row);
  return gear;
}

/** Forges held components onto the best fitting pieces and equips them, until nothing fits. */
export function forgeComponents(sim: Sim) {
  const cap = Object.values(sim.save.materials).reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; i < cap; i++) {
    const heroIds = homeHeroes(sim.save).map((h) => h.id);
    const pick = pickComponentForge(sim.save, heroIds);
    if (!pick) return;
    const before = sim.save;
    const materials = act(sim, 'forge', (save) => forgeWithComponent(save, recipeById[pick.recipeId], pick.componentId));
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
    const before = sim.save;
    const materials = act(sim, 'forge', (save) => restoreRelic(save, pick.relicUid));
    const gear = logCraft(sim, 'relic', before, materials);
    if (!gear) return;
    act(sim, 'equip', (save) => equip(save, pick.heroId, pick.slot, gear.uid));
    mark(sim, 'relicRestored');
  }
}
