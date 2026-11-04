import { todaysCollector } from './loot/valuables';
import type { SaveData } from './save';
import { sellGoodsAmount } from './quests/unlocks';
import type { Quest } from './quests/types';
import { rolledSpecial } from './team/specials';

/**
 * Version 31: the collector quest now names the valuable it wants, chosen from
 * those held when it arrives. Open collector quests keep their objective when
 * the market's wanted valuable is held (its id becomes their `itemId`); the
 * rest become a sellGoods quest, which needs no item and no target.
 */
export function toV31(save: SaveData, now: number): SaveData {
  const list = save.quests.list.map((quest): Quest => {
    if (quest.objective !== 'collector' || quest.doneAt !== null || quest.itemId !== undefined) return quest;
    if (quest.target) {
      const wanted = todaysCollector(save, quest.target.placeId, now);
      const held = Object.entries(save.valuables).some(
        ([key, count]) => key.slice(0, key.lastIndexOf(':')) === wanted && count > 0,
      );
      if (held) return { ...quest, itemId: wanted };
    }
    return {
      ...quest,
      objective: 'sellGoods',
      amount: sellGoodsAmount(save),
      progress: 0,
      target: null,
      itemId: undefined,
    };
  });
  if (list.every((quest, i) => quest === save.quests.list[i])) return save;
  return { ...save, quests: { ...save.quests, list } };
}

/** Version 32: the personal tavern check (see taverns/personal.ts) starts unset. */
export function toV32(save: SaveData): SaveData {
  if (save.personalTavern !== undefined) return save;
  return { ...save, personalTavern: null };
}

/**
 * Version 33: every hero now has a special (see game/team/specials.ts).
 * Heroes without one roll it from their own id, so it never changes.
 */
export function toV33(save: SaveData): SaveData {
  const heroes = save.heroes.map((hero) => (hero.special ? hero : { ...hero, special: rolledSpecial(hero.id, hero.classId) }));
  if (heroes.every((hero, i) => hero === save.heroes[i])) return save;
  return { ...save, heroes };
}

/**
 * Version 35: jobs (see game/jobs/jobs.ts). Every hero starts free, at full
 * energy, and no job holds any output yet.
 */
export function toV35(save: SaveData, now: number): SaveData {
  const heroes = save.heroes.map((hero) => (hero.energy ? hero : { ...hero, job: null, energy: { value: 100, at: now } }));
  const unchanged = heroes.every((hero, i) => hero === save.heroes[i]);
  if (unchanged && save.jobOutput) return save;
  return { ...save, heroes, jobOutput: save.jobOutput ?? {} };
}

/** Applies the migration steps in order, from the save's own version on. */
export function migrateSave(save: SaveData, fromVersion: number, now: number): SaveData {
  let next = save;
  if (fromVersion < 31) next = toV31(next, now);
  if (fromVersion < 32) next = toV32(next);
  // Version 34 runs the special roll again: builds of other branches stamped saves 33 without giving heroes a special.
  if (fromVersion < 34) next = toV33(next);
  if (fromVersion < 35) next = toV35(next, now);
  return next;
}
