import { itemById } from '@/content/lookup';
import { charms } from '@/content/loot/charms';
import { weaknessByBoss } from '@/content/weaknesses';

import { charmApplies } from '../../loot/charms';
import type { LootSourceId } from '../../loot/types';
import type { SaveData } from '../../save';
import { equip, unequip } from '../../team/team';
import { briefingCoverage, kitAnswers } from '../../threats/coverage';
import type { Briefing, ConsumableDef, DungeonDef } from '../../types';

// The bot's loadout before a run: kits for the threats it can answer, the
// boss's weakness item, a charm only when the odds are already high, a potion
// otherwise. Pure: each rule takes a save and returns the save with the
// party's consumable slots filled.

export const isKit = (itemId: string | null | undefined) => !!itemId && !!(itemById[itemId] as ConsumableDef | undefined)?.kit;

const consumableOf = (save: SaveData, heroId: string) => save.heroes.find((h) => h.id === heroId)?.equipment.consumable ?? null;

/** The threat points a party still misses on a briefing: each threat's shortfall, summed. */
export const uncovered = (save: SaveData, heroIds: string[], briefing: Briefing) =>
  briefingCoverage(save, heroIds, briefing).threats.reduce((sum, t) => sum + Math.max(0, t.needed - t.have), 0);

/** Puts back into the stock every consumable these heroes carry. */
export function emptySlots(save: SaveData, heroIds: string[]): SaveData {
  return heroIds.reduce((next, id) => (consumableOf(next, id) ? unequip(next, id, 'consumable') : next), save);
}

/** The same party without kits for the threats: the kit slots left empty. */
export function unprepared(save: SaveData, heroIds: string[]): SaveData {
  return heroIds.reduce((next, id) => (isKit(consumableOf(next, id)) ? unequip(next, id, 'consumable') : next), save);
}

/**
 * Kits from the stock, one at a time: the kit that removes the most missing
 * threat points goes to the hero without a consumable it helps most, until no
 * kit removes any.
 */
export function pickKits(save: SaveData, heroIds: string[], briefing: Briefing): SaveData {
  let next = save;
  for (;;) {
    const missing = uncovered(next, heroIds, briefing);
    if (missing === 0) return next;
    let best: { save: SaveData; points: number } | null = null;
    for (const id of heroIds.filter((h) => !consumableOf(next, h))) {
      for (const [itemId, count] of Object.entries(next.consumables)) {
        if (count < 1 || !isKit(itemId) || !kitAnswers(itemId, briefing)) continue;
        const tried = equip(next, id, 'consumable', itemId);
        const points = missing - uncovered(tried, heroIds, briefing);
        if (points > 0 && (!best || points > best.points)) best = { save: tried, points };
      }
    }
    if (!best) return next;
    next = best.save;
  }
}

/** The boss's weakness item, when held, on the first hero without a consumable. */
export function pickWeakness(save: SaveData, heroIds: string[], dungeon: DungeonDef): SaveData {
  const itemId = dungeon.isBoss ? weaknessByBoss[dungeon.boss.id]?.itemId : undefined;
  const free = heroIds.find((id) => !consumableOf(save, id));
  if (!itemId || !free || (save.consumables[itemId] ?? 0) < 1) return save;
  return equip(save, free, 'consumable', itemId);
}

/** The charm held most of that raises what this source finds; the same charm never stacks, so one per party. */
export function pickCharm(save: SaveData, source: LootSourceId): string | null {
  const held = charms.filter((c) => (save.consumables[c.id] ?? 0) > 0 && charmApplies(c.modifier, source));
  return held.sort((a, b) => (save.consumables[b.id] ?? 0) - (save.consumables[a.id] ?? 0))[0]?.id ?? null;
}

/** Swaps one hero's potion (or empty slot) for the charm, never a kit or weakness item. */
export function withCharm(save: SaveData, heroIds: string[], charmId: string): SaveData {
  const carrier = heroIds.find((id) => !consumableOf(save, id) || consumableOf(save, id) === 'healingPotion');
  if (!carrier || (save.consumables[charmId] ?? 0) < 1) return save;
  return equip(save, carrier, 'consumable', charmId);
}

/** Every hero still without a consumable takes a healing potion while the stock lasts. */
export function fillPotions(save: SaveData, heroIds: string[]): SaveData {
  return heroIds.reduce(
    (next, id) => (!consumableOf(next, id) && (next.consumables.healingPotion ?? 0) > 0 ? equip(next, id, 'consumable', 'healingPotion') : next),
    save,
  );
}
