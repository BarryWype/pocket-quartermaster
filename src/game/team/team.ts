import { heroClasses, xpRules, xpToNextLevel } from '@/content/heroes';
import { affinityRules, castingPenalty, classAffinities, type Affinity } from '@/content/equipment';
import { itemById } from '@/content/lookup';
import { traitById } from '@/content/traits';
import { lootConfig } from '@/content/loot/config';

import { affixEffects, pieceKeywords } from '../gear/affixes';
import { gearStats, SCALING_KEYS } from '../gear/stats';
import { pieceEffects } from '../gear/uniques';
import { pieceDamageStat } from '../equipment/damageStat';
import { slotProblem } from '../equipment/slots';
import { rosterCap } from '../guild/guild';
import { trinketEffect } from '../loot/trinkets';
import type { SaveData } from '../save';
import type { Ability, ArmourType, ConsumableDef, DamageStat, EquipmentSlot, GearCondition, GearDef, GearType, HeroClassId, HeroState, Keyword, RelicEffect, StatKey, Stats, WeaponType } from '../types';
import { baseHeroStats } from './stats';

const STAT_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit'];

export function isOnExpedition(save: SaveData, heroId: string) {
  return save.expeditions.some((e) => e.heroIds.includes(heroId));
}

/** Whether a hero is out at all: on an expedition, a heist, or in a patrol or place fight not yet resolved. */
export function isAway(save: SaveData, heroId: string) {
  return (
    isOnExpedition(save, heroId) ||
    save.patrolFights.some((f) => f.heroIds.includes(heroId)) ||
    save.placeFights.some((f) => f.heroIds.includes(heroId)) ||
    save.heists.some((h) => h.heroId === heroId)
  );
}

/** Whether the hero is working a guild job (see game/jobs/jobs.ts). */
export const isWorking = (save: SaveData, heroId: string) => save.heroes.some((h) => h.id === heroId && h.job !== null);

/** Whether a hero is away or working: not free for anything that sends heroes out. */
export const isBusy = (save: SaveData, heroId: string) => isAway(save, heroId) || isWorking(save, heroId);

export function equippedGear(save: SaveData, hero: HeroState) {
  return (['weapon', 'armor', 'offhand', 'trinket'] as const)
    .map((slot) => save.gear.find((g) => g.uid === hero.equipment[slot]))
    .filter((g) => g !== undefined);
}

/** A gear keyword: magic pieces marked, strong when doubled, `when` for a relic's situational one. */
export type GearKeywordEntry = { keyword: Keyword; magic: boolean; when?: GearCondition; strong?: true };

/**
 * The keywords of the hero's weapon, armour and off-hand; magic pieces marked.
 * An affix's keyword doubles the piece's own keyword (strong), or adds one
 * more entry; a unique's keyword works the same, or rides behind its `when`.
 */
export function gearKeywordsOf(save: SaveData, hero: HeroState): GearKeywordEntry[] {
  return (['weapon', 'armor', 'offhand'] as const).flatMap((slot) => {
    const gear = save.gear.find((g) => g.uid === hero.equipment[slot]);
    if (!gear) return [];
    const item = itemById[gear.itemId] as GearDef;
    const magic = pieceDamageStat(item, hero.classId) === 'magic';
    const keywords: GearKeywordEntry[] = item.keywords.map((keyword) => ({
      keyword,
      magic,
    }));
    const add = (keyword: Keyword) => {
      const own = keywords.find((k) => k.keyword === keyword);
      if (own) own.strong = true;
      else keywords.push({ keyword, magic });
    };
    for (const keyword of pieceKeywords(gear)) add(keyword);
    for (const relicEffect of pieceEffects(gear)) {
      if (relicEffect.kind !== 'keyword') continue;
      if (relicEffect.when) {
        keywords.push({
          keyword: relicEffect.keyword,
          magic,
          when: relicEffect.when,
          ...(item.keywords.includes(relicEffect.keyword) ? { strong: true } : {}),
        });
        continue;
      }
      add(relicEffect.keyword);
    }
    return keywords;
  });
}

/** A relic effect on the hero's equipped piece, with the piece's magic mark and the relic it came from. */
export type WornRelicEffect = { effect: RelicEffect; magic: boolean; relicId: string };

/**
 * The non-keyword effects of the relics restored into the hero's weapon,
 * armour and off-hand, including a non-relic Legendary's unique.
 */
export function relicEffectsOf(save: SaveData, hero: HeroState): WornRelicEffect[] {
  return (['weapon', 'armor', 'offhand'] as const).flatMap((slot) => {
    const gear = save.gear.find((g) => g.uid === hero.equipment[slot]);
    if (!gear || (!gear.relicId && !gear.unique)) return [];
    const item = itemById[gear.itemId] as GearDef;
    return pieceEffects(gear)
      .filter((effect) => effect.kind !== 'keyword')
      .map((effect) => ({ effect, magic: pieceDamageStat(item, hero.classId) === 'magic', relicId: gear.relicId ?? gear.unique! }));
  });
}

/** The hero's class abilities and the effects of their personal trait. */
export const heroAbilities = (hero: HeroState): Ability[] => [
  ...heroClasses[hero.classId].abilities,
  ...(traitById[hero.trait]?.effects ?? []),
];

/** A healing consumable by id, or null: only these go in the Alchemist's second slot. */
export function healingPotion(itemId: string): ConsumableDef | null {
  const item = itemById[itemId];
  return item?.slot === 'consumable' && item.when === 'lowHp' && item.heal !== undefined ? item : null;
}

/** Whether the hero's class has the second, potion-only slot (the Alchemist). */
export const hasPotionSlot = (hero: HeroState) => heroClasses[hero.classId].abilities.some((a) => a.kind === 'potionSlot');

/** Favoured, usable or unfit: weapons and armour by class, off-hands and trinkets always usable. */
export function affinityOf(classId: HeroState['classId'], gearType: GearType | undefined): Affinity {
  if (!gearType) return 'usable';
  const table = classAffinities[classId] as Partial<Record<WeaponType | ArmourType, Affinity>>;
  return table[gearType as WeaponType | ArmourType] ?? 'usable';
}

/** What a hero's equipped gear adds to their approaches: a lute +1 Presence, a tome +1 Wits. */
export { gearApproachBonus } from './stats';

/**
 * Base stats (class, level, roll) + gear: the dice factor and affinity
 * multiply the scaling stats only, the extras stay flat; mail and plate cast a
 * penalty on Magic unless favoured. Then affix stats and traits.
 */
export function heroStats(save: SaveData, hero: HeroState): Stats {
  const stats = baseHeroStats(hero.classId, hero.level, hero.roll);
  let penalty = 0;
  const worn = equippedGear(save, hero);

  for (const gear of worn) {
    const item = itemById[gear.itemId] as GearDef;
    if (item.slot === 'trinket') {
      for (const [key, value] of Object.entries(trinketEffect(item, gear).stats) as [keyof Stats, number][]) {
        stats[key] += value;
      }
      continue;
    }
    const affinity = affinityOf(hero.classId, item.gearType);
    const values = gearStats(gear);
    // A flask's Power counts as the wielder's class damage stat.
    const wielderStat = item.damageStat === 'wielder' ? heroClasses[hero.classId].damageStat : null;
    for (const key of STAT_KEYS) {
      const value = values[key];
      if (!value) continue;
      const target = wielderStat && key === 'power' ? wielderStat : key;
      stats[target] += SCALING_KEYS.includes(key) ? value * affinityRules[affinity] : value;
    }
    if (values.luck) stats.luck += values.luck;
    if (item.slot === 'armor' && affinityOf(hero.classId, item.gearType) !== 'favoured') {
      penalty = Math.max(penalty, castingPenalty[item.gearType as ArmourType] ?? 0);
    }
  }
  stats.magic *= 1 - penalty;

  // Affix stats: Speed and Evasion from their affixes, Luck counts per point.
  const sums = affixEffects(worn);
  stats.speed += (sums.swift ?? 0) + (sums.fleet ?? 0);
  stats.evasion += (sums.light ?? 0) + (sums.silken ?? 0);
  stats.luck += sums.lucky ?? 0;

  for (const effect of heroAbilities(hero)) {
    if (effect.kind === 'statMultiplier') stats[effect.stat] *= effect.multiplier;
  }
  for (const key of [...STAT_KEYS, 'luck'] as const) stats[key] = Math.round(stats[key]);
  return stats;
}

/**
 * Where a stat's current value comes from: the class base, the level growth,
 * what gear and class abilities add, and the worn affix stats.
 */
export function statSources(save: SaveData, hero: HeroState, stat: keyof Stats) {
  const base = Math.round(baseHeroStats(hero.classId, 1, hero.roll)[stat]);
  const levels = Math.round(baseHeroStats(hero.classId, hero.level, hero.roll)[stat]) - base;
  const sums = affixEffects(equippedGear(save, hero));
  const affixes =
    stat === 'speed'
      ? (sums.swift ?? 0) + (sums.fleet ?? 0)
      : stat === 'evasion'
        ? (sums.light ?? 0) + (sums.silken ?? 0)
        : stat === 'luck'
          ? sums.lucky ?? 0
          : 0;
  const total = heroStats(save, hero)[stat];
  return { base, levels, gear: total - base - levels - affixes, affixes, total };
}

/** The stat the hero's hits roll with: the weapon's, or the class's when unarmed. */
export function heroDamageStat(save: SaveData, hero: HeroState): DamageStat {
  const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
  const item = weapon ? (itemById[weapon.itemId] as GearDef) : null;
  // An unarmed Gambler rolls with Magic when Magic is their third primary.
  if (!item && hero.roll?.primary === 'magic') return 'magic';
  return (item ? pieceDamageStat(item, hero.classId) : undefined) ?? heroClasses[hero.classId].damageStat;
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
  if (slot !== 'consumable' && slot !== 'potion') return keepingHp(save, next, heroId);
  return { ...next, consumables: { ...next.consumables, [current]: (next.consumables[current] ?? 0) + 1 } };
}

/**
 * Equips a gear piece (by uid) or a consumable (by item id). Gear worn by
 * another hero at home moves over; consumables come out of the stock.
 */
export function equip(save: SaveData, heroId: string, slot: EquipmentSlot, id: string): SaveData {
  if (isAway(save, heroId)) throw new Error('Hero is away');
  let next = unequip(save, heroId, slot);

  if (slot === 'consumable' || slot === 'potion') {
    if (itemById[id]?.slot !== 'consumable') throw new Error(`${id} is not a consumable`);
    if (slot === 'potion') {
      const hero = next.heroes.find((h) => h.id === heroId);
      if (!hero || !hasPotionSlot(hero) || !healingPotion(id)) throw new Error(`${id} cannot go in a potion slot`);
    }
    if ((next.consumables[id] ?? 0) < 1) throw new Error(`No ${id} left`);
    next = { ...next, consumables: { ...next.consumables, [id]: next.consumables[id] - 1 } };
  } else {
    const gear = next.gear.find((g) => g.uid === id);
    if (!gear || itemById[gear.itemId].slot !== slot) throw new Error(`Cannot equip ${id} as ${slot}`);
    const hero = next.heroes.find((h) => h.id === heroId);
    if (!hero) throw new Error(`Unknown hero ${heroId}`);
    if (slot !== 'weapon' && slotProblem(next, hero, slot, gear)) {
      throw new Error(`Cannot equip ${gear.itemId} as ${slot} for ${hero.name}`);
    }
    const holder = next.heroes.find((h) => h.id !== heroId && h.equipment[slot] === id);
    if (holder) next = unequip(next, holder.id, slot);
  }
  next = keepingHp(next, updateHero(next, heroId, (h) => ({ ...h, equipment: { ...h.equipment, [slot]: id } })), heroId);
  // A two-handed weapon takes the off-hand; a weapon change can strand one.
  if (slot === 'weapon') {
    const hero = next.heroes.find((h) => h.id === heroId)!;
    const offhandUid = hero.equipment.offhand;
    const offhand = offhandUid ? next.gear.find((g) => g.uid === offhandUid) : undefined;
    if (offhand && slotProblem(next, hero, 'offhand', offhand)) next = unequip(next, heroId, 'offhand');
  }
  return next;
}

/** What equipping a piece would do to the hero's stats, or null if it cannot go in. */
export function equipPreview(
  save: SaveData,
  heroId: string,
  slot: EquipmentSlot,
  uid: string,
): { before: Stats; after: Stats } | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return null;
  const before = heroStats(save, hero);
  try {
    const next = equip(save, heroId, slot, uid);
    return { before, after: heroStats(next, next.heroes.find((h) => h.id === heroId)!) };
  } catch {
    return null;
  }
}

/**
 * ▲ or ▼ for a piece, judged on the stats the hero's class cares about (its
 * damage stat and primary stats): up when none drops and one rises, down the
 * other way round, nothing for a trade-off.
 */
export function upgradeMark(hero: HeroState, preview: { before: Stats; after: Stats } | null): 'up' | 'down' | undefined {
  if (!preview) return undefined;
  const heroClass = heroClasses[hero.classId];
  const keys = new Set<StatKey>([heroClass.damageStat, ...heroClass.primary, ...(hero.roll?.primary ? [hero.roll.primary] : [])]);
  const deltas = [...keys].map((key) => preview.after[key] - preview.before[key]);
  const rises = deltas.some((d) => d > 0);
  const drops = deltas.some((d) => d < 0);
  if (rises && !drops) return 'up';
  if (drops && !rises) return 'down';
  return undefined;
}

/** Heroes can be dismissed at home, keeping at least one; their gear and consumable go back to the stock. */
export function canDismiss(save: SaveData, heroId: string) {
  return save.heroes.length > 1 && save.heroes.some((h) => h.id === heroId) && !isAway(save, heroId);
}

export function dismissHero(save: SaveData, heroId: string): SaveData {
  if (!canDismiss(save, heroId)) throw new Error(`Cannot dismiss ${heroId}`);
  let next = save;
  for (const slot of ['weapon', 'armor', 'offhand', 'trinket', 'consumable', 'potion'] as const) next = unequip(next, heroId, slot);
  return {
    ...next,
    heroes: next.heroes.filter((h) => h.id !== heroId),
    // The escort hero is gone: the background task stands down.
    escort: next.escort && next.escort.heroId === heroId ? null : next.escort,
  };
}

/** Adds classes to the ones the player has met. */
export function markClassesSeen(save: SaveData, classIds: HeroClassId[]): SaveData {
  const fresh = classIds.filter((id) => !save.seenClasses.includes(id));
  return fresh.length === 0 ? save : { ...save, seenClasses: [...save.seenClasses, ...new Set(fresh)] };
}

export const rosterFull = (save: SaveData) => save.heroes.length >= rosterCap(save);

export function addXp(hero: HeroState, amount: number, playerTier?: number): HeroState {
  // At the cap no XP is gained at all.
  if (hero.level >= xpRules.maxLevel) return hero;
  // Above the player's tier band top plus the margin, a hero earns the soft-cap share.
  const aboveBand =
    playerTier !== undefined && hero.level >= lootConfig.manuals.topLevelByTier[playerTier - 1] + xpRules.aboveBandMargin;
  let { level, xp } = hero;
  xp += Math.round(amount * (aboveBand ? xpRules.aboveBandShare : 1));
  while (level < xpRules.maxLevel) {
    const need = xpToNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  if (level >= xpRules.maxLevel) xp = 0;
  return { ...hero, level, xp };
}
