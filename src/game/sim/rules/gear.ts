import { affixById } from '@/content/affixes';
import { mobById } from '@/content/enemies';
import { dungeons } from '@/content/dungeons';
import { itemById, threatById } from '@/content/lookup';

import { applyStone, canApplyStone } from '../../crafting/infusion';
import { briefingFor, type Rotation } from '../../dungeons/rotation';
import { beats, ELEMENTS, stoneId, type Element } from '../../elements';
import { isDungeonAvailable, highestUnlockedTier } from '../../expeditions/expeditions';
import { canReroll, reroll, rerollCost } from '../../forging/reroll';
import type { SaveData } from '../../save';
import type { Keyword, Tag } from '../../types';
import { act, homeHeroes, type Sim } from '../bot';

const SLOTS = ['weapon', 'armor', 'offhand'] as const;

/**
 * What the dungeons the bot is about to run call for: the tags of their
 * enemies, the keywords that answer their briefings' threats, and their most
 * common enemy element (fights weighted by mob count, the boss by 3).
 */
export type GearPlan = {
  tags: Tag[];
  keywords: Keyword[];
  element: Element | null;
};

/** The day's planned dungeons: the open ones of the top two tiers. */
function plannedDungeons(save: SaveData, rotation: Rotation) {
  const top = highestUnlockedTier(save);
  return dungeons.filter((d) => d.tier >= top - 1 && isDungeonAvailable(save, d, rotation));
}

/** Reads the plan off the planned dungeons' enemies and today's briefings. */
export function planGear(save: SaveData, rotation: Rotation): GearPlan {
  const tags: Tag[] = [];
  const keywords: Keyword[] = [];
  const elements: Partial<Record<Element, number>> = {};
  const count = (element: Element | undefined, weight: number) => {
    if (element) elements[element] = (elements[element] ?? 0) + weight;
  };
  const take = (list: Tag[]) => {
    for (const tag of list) if (!tags.includes(tag)) tags.push(tag);
  };
  for (const dungeon of plannedDungeons(save, rotation)) {
    take(dungeon.boss.tags);
    count(dungeon.boss.element, 3);
    for (const threat of briefingFor(rotation, dungeon).threats) {
      const answer = threatById[threat.id].answer;
      if (answer.kind === 'keyword' && !keywords.includes(answer.keyword)) keywords.push(answer.keyword);
    }
    for (const encounter of dungeon.encounters) {
      if (encounter.type !== 'fight') continue;
      for (const group of encounter.mobs) {
        take(mobById[group.mobId].tags);
        count(mobById[group.mobId].element, group.count * encounter.weight);
      }
    }
  }
  const element = (Object.entries(elements) as [Element, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { tags, keywords, element };
}

/**
 * Whether an affix helps against the planned dungeons: bonus damage dealt to
 * or taken from their enemies, or a keyword that answers one of their threats.
 */
export function affixFits(plan: GearPlan, affixId: string): boolean {
  const effect = affixById[affixId]?.effect;
  if (!effect) return false;
  if (effect.kind === 'damageVs' || effect.kind === 'damageFrom') return effect.tags.some((tag) => plan.tags.includes(tag));
  if (effect.kind === 'keyword') return plan.keywords.includes(effect.keyword);
  return false;
}

/**
 * The stone a Common piece takes, null for any other or empty slot: a weapon
 * an element that beats the plan's element when one is held, else any held
 * stone; armour and off-hands the warding of the plan's element.
 */
export function stoneFor(save: SaveData, gearUid: string, plan: GearPlan): Element | null {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const item = gear ? (itemById[gear.itemId] as { slot: string }) : undefined;
  if (!gear || !item || gear.rarity !== 'common') return null;
  const held = ELEMENTS.filter((element) => (save.materials[stoneId(element)] ?? 0) > 0);
  const target = plan.element;
  if (item.slot === 'weapon') {
    if (!held.length) return null;
    return (target ? held.find((element) => beats(element, target)) : undefined) ?? held[0];
  }
  if ((item.slot === 'armor' || item.slot === 'offhand') && target && held.includes(target)) return target;
  return null;
}

/** A worn Rare or Legendary piece whose affixes fit nothing in the plan. */
export function rerollWanted(save: SaveData, gearUid: string, plan: GearPlan): boolean {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear || (gear.rarity !== 'rare' && gear.rarity !== 'legendary')) return false;
  return !gear.affixes.some((affix) => affixFits(plan, affix.id));
}

/** Applies held stones to every home hero's worn Common pieces. */
export function applyStones(sim: Sim) {
  const plan = planGear(sim.save, sim.rotation);
  for (const hero of homeHeroes(sim.save)) {
    for (const slot of SLOTS) {
      const uid = hero.equipment[slot];
      const element = uid ? stoneFor(sim.save, uid, plan) : null;
      if (!uid || !element || !canApplyStone(sim.save, uid, element)) continue;
      act(sim, 'infuse', (save) => applyStone(save, uid, element));
      sim.log.stones.push(sim.day);
    }
  }
}

/** Rerolls each home hero's worn pieces nothing fits, keeping the gold at 2× a reroll's cost; one reroll per piece a day. */
export function rerollGear(sim: Sim) {
  const plan = planGear(sim.save, sim.rotation);
  for (const hero of homeHeroes(sim.save)) {
    for (const slot of SLOTS) {
      const uid = hero.equipment[slot];
      if (!uid || sim.rerolled.has(uid) || !rerollWanted(sim.save, uid, plan) || !canReroll(sim.save, uid)) continue;
      const cost = rerollCost(sim.save.gear.find((g) => g.uid === uid)!);
      if (sim.save.gold - cost.gold < 2 * cost.gold) continue;
      sim.rerolled.add(uid);
      act(sim, 'reroll', (save) => reroll(save, uid));
      sim.log.rerolls.push({ day: sim.day, gold: cost.gold, materials: Object.fromEntries(cost.materials.map((m) => [m.materialId, -m.amount])) });
    }
  }
}
