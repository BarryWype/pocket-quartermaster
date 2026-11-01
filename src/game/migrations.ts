import { todaysCollector } from './loot/valuables';
import type { SaveData } from './save';
import { sellGoodsAmount } from './quests/unlocks';
import type { Quest } from './quests/types';

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

/** Applies the migration steps in order, from the save's own version on. */
export function migrateSave(save: SaveData, fromVersion: number, now: number): SaveData {
  let next = save;
  if (fromVersion < 31) next = toV31(next, now);
  return next;
}
