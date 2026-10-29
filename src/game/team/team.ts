import { heroClasses, xpRules, xpToNextLevel } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { traitById } from '@/content/traits';

import { gearStats } from '../forging/quality';
import { rosterCap } from '../guild/guild';
import type { SaveData } from '../save';
import type { Ability, DamageStat, EquipmentSlot, GearDef, HeroState, ItemDef, StatKey, Stats, WeaponType } from '../types';
import { baseHeroStats } from './stats';

const STAT_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit'];

/** Weapon types that roll with Magic; every other weapon rolls with Power. */
const MAGIC_WEAPONS: WeaponType[] = ['wand', 'staff', 'instrument'];

export function isOnExpedition(save: SaveData, heroId: string) {
  return save.expeditions.some((e) => e.heroIds.includes(heroId));
}

/** Whether a hero is out at all: on an expedition, or in a patrol fight not yet resolved. */
export function isAway(save: SaveData, heroId: string) {
  return isOnExpedition(save, heroId) || save.patrolFights.some((f) => f.heroIds.includes(heroId));
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

/** Base stats (class, level, roll) + gear (after quality), with class affinity boosting weapon stats, then traits. */
export function heroStats(save: SaveData, hero: HeroState): Stats {
  const heroClass = heroClasses[hero.classId];
  const stats = baseHeroStats(hero.classId, hero.level, hero.roll);

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
  for (const key of [...STAT_KEYS, 'luck'] as const) stats[key] = Math.round(stats[key]);
  return stats;
}

/** The stat the hero's hits roll with: the weapon's, or the class's when unarmed. */
export function heroDamageStat(save: SaveData, hero: HeroState): DamageStat {
  const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
  const weaponType = weapon ? (itemById[weapon.itemId] as GearDef).weaponType : undefined;
  if (!weaponType) return heroClasses[hero.classId].damageStat;
  return MAGIC_WEAPONS.includes(weaponType) ? 'magic' : 'power';
}

function updateHero(save: SaveData, heroId: string, update: (hero: HeroState) => HeroState): SaveData {
  return { ...save, heroes: save.heroes.map((h) => (h.id === heroId ? update(h) : h)) };
}

/**
 * After a change of max HP (gear, level): a higher max keeps the same share
 * of HP, a lower one caps HP at the new max. Expects HP settled beforehand.
 */
export function keepHpShare(hero: HeroState, oldMax: number, newMax: number): HeroState {
  if (hero.hp === undefined || oldMax === newMax) return hero;
  const hp = newMax > oldMax ? (oldMax > 0 ? (hero.hp / oldMax) * newMax : newMax) : Math.min(hero.hp, newMax);
  if (hp < newMax) return { ...hero, hp };
  const { hp: _hp, hpAt: _at, ...full } = hero;
  return full;
}

/** `next` with the hero's HP adjusted to the max HP change since `before`. */
function keepingHp(before: SaveData, next: SaveData, heroId: string): SaveData {
  const old = before.heroes.find((h) => h.id === heroId);
  const hero = next.heroes.find((h) => h.id === heroId);
  if (!old || !hero || hero.hp === undefined) return next;
  return updateHero(next, heroId, (h) => keepHpShare(h, heroStats(before, old).hp, heroStats(next, hero).hp));
}

export function unequip(save: SaveData, heroId: string, slot: EquipmentSlot): SaveData {
  if (isAway(save, heroId)) throw new Error('Hero is away');
  const hero = save.heroes.find((h) => h.id === heroId);
  const current = hero?.equipment[slot];
  if (!hero || !current) return save;

  const next = updateHero(save, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: null } }));
  if (slot !== 'consumable') return keepingHp(save, next, heroId);
  return { ...next, consumables: { ...next.consumables, [current]: (next.consumables[current] ?? 0) + 1 } };
}

/**
 * Equips a gear piece (by uid) or a consumable (by item id). Gear worn by
 * another hero at home moves over; consumables come out of the stock.
 */
export function equip(save: SaveData, heroId: string, slot: EquipmentSlot, id: string): SaveData {
  if (isAway(save, heroId)) throw new Error('Hero is away');
  let next = unequip(save, heroId, slot);

  if (slot === 'consumable') {
    if (itemById[id]?.slot !== 'consumable') throw new Error(`${id} is not a consumable`);
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
  return keepingHp(next, updateHero(next, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: id } })), heroId);
}

/** Heroes can be dismissed at home, keeping at least one; their gear and consumable go back to the stock. */
export function canDismiss(save: SaveData, heroId: string) {
  return save.heroes.length > 1 && save.heroes.some((h) => h.id === heroId) && !isAway(save, heroId);
}

export function dismissHero(save: SaveData, heroId: string): SaveData {
  if (!canDismiss(save, heroId)) throw new Error(`Cannot dismiss ${heroId}`);
  let next = save;
  for (const slot of ['weapon', 'armor', 'consumable'] as const) next = unequip(next, heroId, slot);
  return {
    ...next,
    heroes: next.heroes.filter((h) => h.id !== heroId),
    // The escort hero is gone: the background task stands down.
    escort: next.escort && next.escort.heroId === heroId ? null : next.escort,
  };
}

export const rosterFull = (save: SaveData) => save.heroes.length >= rosterCap(save);

export function addXp(hero: HeroState, amount: number): HeroState {
  // At the cap no XP is gained at all.
  if (hero.level >= xpRules.maxLevel) return hero;
  let { level, xp } = hero;
  xp += amount;
  while (level < xpRules.maxLevel) {
    const need = xpToNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  if (level >= xpRules.maxLevel) xp = 0;
  return { ...hero, level, xp };
}
