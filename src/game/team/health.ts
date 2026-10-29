import { healthRules } from '@/content/health';
import { itemById } from '@/content/lookup';

import type { SaveData } from '../save';
import type { HeroState, HomeCare } from '../types';
import { heroAbilities, heroStats, isAway } from './team';

type Rules = typeof healthRules;

const MINUTE = 60_000;

/** The hero's trait healing effect: speed at home and exhaustion length. */
function healRate(hero: HeroState) {
  const effect = heroAbilities(hero).find((a) => a.kind === 'healRate');
  return effect?.kind === 'healRate' ? effect : { multiplier: 1, exhaustion: 1 };
}

export const exhaustionMinutes = (hero: HeroState, rules: Rules = healthRules) =>
  rules.exhaustionMinutes * healRate(hero).exhaustion;

export const maxHp = (save: SaveData, hero: HeroState) => heroStats(save, hero).hp;

/**
 * HP now, worked out from the stored HP and its timestamp: heroes at home heal
 * once any exhaustion is over; heroes away keep the HP they left with.
 */
export function currentHp(save: SaveData, hero: HeroState, now: number, rules: Rules = healthRules) {
  const max = maxHp(save, hero);
  if (hero.hp === undefined) return max;
  if (isAway(save, hero.id)) return Math.min(max, hero.hp);
  const from = Math.max(hero.hpAt ?? now, hero.exhaustedUntil ?? -Infinity);
  const minutes = Math.max(0, now - from) / MINUTE;
  return Math.min(max, hero.hp + minutes * rules.healPerMinute * healRate(hero).multiplier * max);
}

export const isExhausted = (hero: HeroState, now: number) => (hero.exhaustedUntil ?? 0) > now;

/** Milliseconds until the hero is back to full HP at home (0 when full), exhaustion included. */
export function timeToFull(save: SaveData, hero: HeroState, now: number, rules: Rules = healthRules) {
  const max = maxHp(save, hero);
  const missing = max - currentHp(save, hero, now, rules);
  if (missing <= 0 || max <= 0) return 0;
  const healing = Math.ceil((missing / (rules.healPerMinute * healRate(hero).multiplier * max)) * MINUTE);
  return Math.max(0, (hero.exhaustedUntil ?? 0) - now) + healing;
}

/**
 * The hero with HP stored as of `now`: full HP is left out, finished exhaustion
 * cleared. Shared by every path that writes a hero's HP at home.
 */
export function withHp(hero: HeroState, hp: number, max: number, now: number, exhaustedUntil: number | undefined): HeroState {
  const { hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...rest } = hero;
  return {
    ...rest,
    ...(hp < max ? { hp: Math.max(0, hp), hpAt: now } : {}),
    ...(exhaustedUntil !== undefined && exhaustedUntil > now ? { exhaustedUntil } : {}),
  };
}

/** Writes every home hero's healing up to `now` into the save. */
export function settleHp(save: SaveData, now: number, rules: Rules = healthRules): SaveData {
  return {
    ...save,
    heroes: save.heroes.map((hero) =>
      hero.hp === undefined || isAway(save, hero.id)
        ? hero
        : withHp(hero, currentHp(save, hero, now, rules), maxHp(save, hero), now, hero.exhaustedUntil),
    ),
  };
}

/**
 * HP heroes came back with from a run that ended at `at`. A hero at 0 is
 * exhausted for a while.
 */
export function applyRunHp(
  save: SaveData,
  hp: { heroId: string; hp: number; maxHp: number }[],
  at: number,
  rules: Rules = healthRules,
): SaveData {
  return {
    ...save,
    heroes: save.heroes.map((hero) => {
      const end = hp.find((h) => h.heroId === hero.id);
      if (!end) return hero;
      const exhaustedUntil = end.hp <= 0 ? at + exhaustionMinutes(hero, rules) * MINUTE : undefined;
      return withHp(hero, end.hp, end.maxHp, at, exhaustedUntil);
    }),
  };
}

export type DrinkProblem = 'away' | 'noPotion' | 'full';

const POTION = 'healingPotion';

export function drinkProblem(save: SaveData, heroId: string, now: number): DrinkProblem | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero || isAway(save, heroId)) return 'away';
  if ((save.consumables[POTION] ?? 0) < 1 && hero.equipment.consumable !== POTION) return 'noPotion';
  if (currentHp(save, hero, now) >= maxHp(save, hero) && !isExhausted(hero, now)) return 'full';
  return null;
}

/**
 * Drinks a healing potion at home: +30% of max HP at once, and the end of any
 * exhaustion. Takes it from the stock, or else the one the hero carries.
 */
export function drinkPotion(save: SaveData, heroId: string, now: number, rules: Rules = healthRules): SaveData {
  const problem = drinkProblem(save, heroId, now);
  if (problem) throw new Error(`Cannot drink a potion: ${problem}`);
  const settled = settleHp(save, now, rules);
  const fromStock = (settled.consumables[POTION] ?? 0) > 0;
  return {
    ...settled,
    consumables: fromStock ? { ...settled.consumables, [POTION]: settled.consumables[POTION] - 1 } : settled.consumables,
    heroes: settled.heroes.map((hero) => {
      if (hero.id !== heroId) return hero;
      const max = maxHp(settled, hero);
      const carried = fromStock ? hero : { ...hero, equipment: { ...hero.equipment, consumable: null } };
      return withHp(carried, currentHp(settled, hero, now, rules) + rules.potionHeal.minor * max, max, now, undefined);
    }),
  };
}

export type CareProblem = 'away' | 'noItem' | 'nothingToDo';

/** The home care a utility item gives, or null when it is not one. */
function homeCareOf(itemId: string): HomeCare | null {
  const item = itemById[itemId];
  return item?.slot === 'utility' ? item.homeCare ?? null : null;
}

export function careProblem(save: SaveData, heroId: string, itemId: string, now: number): CareProblem | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  const care = homeCareOf(itemId);
  if (!hero || isAway(save, heroId)) return 'away';
  if (!care || (save.consumables[itemId] ?? 0) < 1) return 'noItem';
  const useful = care.kind === 'heal' ? currentHp(save, hero, now) < maxHp(save, hero) : isExhausted(hero, now);
  return useful ? null : 'nothingToDo';
}

/**
 * Uses a home care item on a hero: a heal adds its share of max HP (exhaustion
 * keeps pausing healing); a rest clears exhaustion, restarting healing from
 * `now`. Always taken from the stock, never the hero's slot.
 */
export function giveHomeCare(save: SaveData, heroId: string, itemId: string, now: number, rules: Rules = healthRules): SaveData {
  const problem = careProblem(save, heroId, itemId, now);
  if (problem) throw new Error(`Cannot use ${itemId}: ${problem}`);
  const care = homeCareOf(itemId)!;
  const settled = settleHp(save, now, rules);
  return {
    ...settled,
    consumables: { ...settled.consumables, [itemId]: settled.consumables[itemId] - 1 },
    heroes: settled.heroes.map((hero) => {
      if (hero.id !== heroId) return hero;
      const max = maxHp(settled, hero);
      const hp = currentHp(settled, hero, now, rules);
      return care.kind === 'heal'
        ? withHp(hero, hp + care.share * max, max, now, hero.exhaustedUntil)
        : withHp(hero, hp, max, now, undefined);
    }),
  };
}

/** Every hero back to full, exhaustion over (debug). */
export const healAll = (save: SaveData): SaveData => ({
  ...save,
  heroes: save.heroes.map(({ hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...hero }) => hero),
});

/** Sets a hero's HP share now, or clears their exhaustion (debug). */
export function setHeroHp(save: SaveData, heroId: string, share: number, now: number, exhausted = false): SaveData {
  return {
    ...save,
    heroes: save.heroes.map((hero) => {
      if (hero.id !== heroId) return hero;
      const max = maxHp(save, hero);
      return withHp(hero, share * max, max, now, exhausted ? now + exhaustionMinutes(hero) * MINUTE : undefined);
    }),
  };
}

/** Moves every stored HP timestamp back, as if `minutes` had passed (debug). */
export const fastForwardHealing = (save: SaveData, minutes: number): SaveData => ({
  ...save,
  heroes: save.heroes.map((hero) => ({
    ...hero,
    ...(hero.hpAt !== undefined ? { hpAt: hero.hpAt - minutes * MINUTE } : {}),
    ...(hero.exhaustedUntil !== undefined ? { exhaustedUntil: hero.exhaustedUntil - minutes * MINUTE } : {}),
  })),
});
