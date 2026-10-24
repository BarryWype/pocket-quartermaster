import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { itemById } from '@/content/lookup';

import type { SaveData } from '../save';
import type { EquipmentSlot, HeroState, Stats } from '../types';

const STAT_KEYS: (keyof Stats)[] = ['attack', 'defense', 'magic', 'hp'];

export function isOnExpedition(save: SaveData, heroId: string) {
  return save.expeditions.some((e) => e.heroIds.includes(heroId));
}

export function equippedGear(save: SaveData, hero: HeroState) {
  return (['weapon', 'armor'] as const)
    .map((slot) => save.gear.find((g) => g.uid === hero.equipment[slot]))
    .filter((g) => g !== undefined);
}

/** Base stats + level growth + gear, with class affinity boosting weapon stats. */
export function heroStats(save: SaveData, hero: HeroState): Stats {
  const heroClass = heroClasses[hero.classId];
  const stats = { ...heroClass.baseStats };
  for (const key of STAT_KEYS) stats[key] += heroClass.growth[key] * (hero.level - 1);

  for (const gear of equippedGear(save, hero)) {
    const item = itemById[gear.itemId];
    if (item.slot === 'consumable') continue;
    const affinity = item.weaponType ? (heroClass.affinities[item.weaponType] ?? 1) : 1;
    for (const key of STAT_KEYS) stats[key] += (item.stats[key] ?? 0) * affinity;
  }
  for (const key of STAT_KEYS) stats[key] = Math.round(stats[key]);
  return stats;
}

/** A single number summarising how strong a hero is, used by expeditions. */
export function heroPower(stats: Stats) {
  return stats.attack + stats.magic + stats.defense * 0.8 + stats.hp / 5;
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
    const holder = next.heroes.find((h) => h.id !== heroId && h.equipment[slot] === id);
    if (holder) next = unequip(next, holder.id, slot);
  }
  return updateHero(next, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: id } }));
}

export function addXp(hero: HeroState, amount: number): HeroState {
  let { level, xp } = hero;
  xp += amount;
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
  }
  return { ...hero, level, xp };
}
