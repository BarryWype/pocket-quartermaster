import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { traitById } from '@/content/traits';

import { gearStats } from '../forging/quality';
import { rosterCap } from '../guild/guild';
import type { SaveData } from '../save';
import type { Ability, EquipmentSlot, HeroState, ItemDef, Stats } from '../types';

const STAT_KEYS: (keyof Stats)[] = ['attack', 'defense', 'magic', 'hp'];

export function isOnExpedition(save: SaveData, heroId: string) {
  return save.expeditions.some((e) => e.heroIds.includes(heroId));
}

export function equippedGear(save: SaveData, hero: HeroState) {
  return (['weapon', 'armor'] as const)
    .map((slot) => save.gear.find((g) => g.uid === hero.equipment[slot]))
    .filter((g) => g !== undefined);
}

/** The hero's class abilities and the effects of their personal trait. */
export const heroAbilities = (hero: HeroState): Ability[] => [
  ...heroClasses[hero.classId].abilities,
  ...(traitById[hero.trait]?.effects ?? []),
];

/** Classes only wield their own weapon types; armour and anything else is open to all. */
export const canWield = (hero: HeroState, item: ItemDef) =>
  item.slot !== 'weapon' || !item.weaponType || item.weaponType in heroClasses[hero.classId].affinities;

/** Base stats + level growth + gear (after quality), with class affinity boosting weapon stats, then traits. */
export function heroStats(save: SaveData, hero: HeroState): Stats {
  const heroClass = heroClasses[hero.classId];
  const stats = { ...heroClass.baseStats };
  for (const key of STAT_KEYS) stats[key] += heroClass.growth[key] * (hero.level - 1);

  for (const gear of equippedGear(save, hero)) {
    const item = itemById[gear.itemId];
    if (item.slot !== 'weapon' && item.slot !== 'armor') continue;
    const affinity = item.weaponType ? (heroClass.affinities[item.weaponType] ?? 1) : 1;
    const itemStats = gearStats(item, gear);
    for (const key of STAT_KEYS) stats[key] += (itemStats[key] ?? 0) * affinity;
  }
  for (const effect of heroAbilities(hero)) {
    if (effect.kind === 'statMultiplier') stats[effect.stat] *= effect.multiplier;
  }
  for (const key of STAT_KEYS) stats[key] = Math.round(stats[key]);
  return stats;
}

function updateHero(save: SaveData, heroId: string, update: (hero: HeroState) => HeroState): SaveData {
  return { ...save, heroes: save.heroes.map((h) => (h.id === heroId ? update(h) : h)) };
}

export function unequip(save: SaveData, heroId: string, slot: EquipmentSlot): SaveData {
  if (isOnExpedition(save, heroId)) throw new Error('Hero is on an expedition');
  const hero = save.heroes.find((h) => h.id === heroId);
  const current = hero?.equipment[slot];
  if (!hero || !current) return save;

  const next = updateHero(save, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: null } }));
  if (slot !== 'consumable') return next;
  return { ...next, consumables: { ...next.consumables, [current]: (next.consumables[current] ?? 0) + 1 } };
}

/**
 * Equips a gear piece (by uid) or a consumable (by item id). Gear worn by
 * another hero at home moves over; consumables come out of the stock.
 */
export function equip(save: SaveData, heroId: string, slot: EquipmentSlot, id: string): SaveData {
  if (isOnExpedition(save, heroId)) throw new Error('Hero is on an expedition');
  let next = unequip(save, heroId, slot);

  if (slot === 'consumable') {
    if ((next.consumables[id] ?? 0) < 1) throw new Error(`No ${id} left`);
    next = { ...next, consumables: { ...next.consumables, [id]: next.consumables[id] - 1 } };
  } else {
    const gear = next.gear.find((g) => g.uid === id);
    if (!gear || itemById[gear.itemId].slot !== slot) throw new Error(`Cannot equip ${id} as ${slot}`);
    const hero = next.heroes.find((h) => h.id === heroId);
    if (hero && !canWield(hero, itemById[gear.itemId])) throw new Error(`${hero.name} cannot use ${gear.itemId}`);
    const holder = next.heroes.find((h) => h.id !== heroId && h.equipment[slot] === id);
    if (holder) next = unequip(next, holder.id, slot);
  }
  return updateHero(next, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: id } }));
}

/** Heroes can be dismissed at home, keeping at least one; their gear and consumable go back to the stock. */
export function canDismiss(save: SaveData, heroId: string) {
  return save.heroes.length > 1 && save.heroes.some((h) => h.id === heroId) && !isOnExpedition(save, heroId);
}

export function dismissHero(save: SaveData, heroId: string): SaveData {
  if (!canDismiss(save, heroId)) throw new Error(`Cannot dismiss ${heroId}`);
  let next = save;
  for (const slot of ['weapon', 'armor', 'consumable'] as const) next = unequip(next, heroId, slot);
  return { ...next, heroes: next.heroes.filter((h) => h.id !== heroId) };
}

export const rosterFull = (save: SaveData) => save.heroes.length >= rosterCap(save);

export function addXp(hero: HeroState, amount: number): HeroState {
  let { level, xp } = hero;
  xp += amount;
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
  }
  return { ...hero, level, xp };
}
