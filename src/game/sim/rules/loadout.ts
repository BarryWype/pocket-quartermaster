import { shopRules } from '@/content/shops';
import { items } from '@/content/items';
import { weaknessByBoss } from '@/content/weaknesses';

import { infusedElement } from '../../gear/affixes';
import type { SaveData } from '../../save';
import { equip, unequip } from '../../team/team';
import type { ConsumableDef, DungeonDef } from '../../types';

// The bot's loadout before a run: the boss's weakness item, a potion
// otherwise. Pure: each rule takes a save and returns the save with the
// party's consumable slots filled.

const consumableOf = (save: SaveData, heroId: string) => save.heroes.find((h) => h.id === heroId)?.equipment.consumable ?? null;

/** Puts back into the stock every consumable these heroes carry. */
export function emptySlots(save: SaveData, heroIds: string[]): SaveData {
  return heroIds.reduce((next, id) => (consumableOf(next, id) ? unequip(next, id, 'consumable') : next), save);
}

/** The boss's weakness item, when held, on the first hero without a consumable. */
export function pickWeakness(save: SaveData, heroIds: string[], dungeon: DungeonDef): SaveData {
  const itemId = dungeon.isBoss ? weaknessByBoss[dungeon.boss.id]?.itemId : undefined;
  const free = heroIds.find((id) => !consumableOf(save, id));
  if (!itemId || !free || (save.consumables[itemId] ?? 0) < 1) return save;
  return equip(save, free, 'consumable', itemId);
}

/** The healing potions, weakest first (a stock line naming any of them sells the strongest the player can brew). */
export const healingPotionIds = shopRules.potions.ladder;

/** The elemental oils, which infuse a plain weapon with their element for one run. */
export const oilIds = items.filter((i): i is ConsumableDef => i.slot === 'consumable' && (i as ConsumableDef).elixir?.kind === 'oil').map((i) => i.id);

export const isHealingPotion = (itemId: string | null | undefined) => !!itemId && healingPotionIds.includes(itemId);

/** The strongest healing potion held, or null when none is. */
export const heldPotion = (save: SaveData): string | null => [...healingPotionIds].reverse().find((id) => (save.consumables[id] ?? 0) > 0) ?? null;

/** The six stat potions: they take a healing potion's slot when the prepared odds are low. */
export const statPotionIds = ['strengthDraught', 'arcaneTonic', 'ironskinBrew', 'nullrootTincture', 'quicksilver', 'viperOil'];

/** Swaps the hero's healing potion (or empty consumable slot) for this held stat potion; never a weakness item. */
export function withStatPotion(save: SaveData, heroId: string, itemId: string): SaveData {
  const hero = save.heroes.find((h) => h.id === heroId);
  const slot = hero?.equipment.consumable;
  if (!hero || !statPotionIds.includes(itemId) || (slot !== null && !isHealingPotion(slot)) || (save.consumables[itemId] ?? 0) < 1) return save;
  return equip(save, heroId, 'consumable', itemId);
}

/** Swaps the hero's healing potion (or empty consumable slot) for this held elemental oil; only a plain weapon takes one. */
export function withOil(save: SaveData, heroId: string, itemId: string): SaveData {
  const hero = save.heroes.find((h) => h.id === heroId);
  const slot = hero?.equipment.consumable;
  const weapon = hero?.equipment.weapon ? save.gear.find((g) => g.uid === hero.equipment.weapon) : undefined;
  if (!hero || !oilIds.includes(itemId) || (slot !== null && !isHealingPotion(slot)) || !weapon || infusedElement(weapon) || (save.consumables[itemId] ?? 0) < 1)
    return save;
  return equip(save, heroId, 'consumable', itemId);
}

/**
 * Puts a held consumable on the first party hero whose slot is free or holds a
 * healing potion; never the weakness item.
 */
export function withElixir(save: SaveData, heroIds: string[], itemId: string): SaveData {
  const carrier = heroIds.find((id) => {
    const slot = save.heroes.find((h) => h.id === id)?.equipment.consumable ?? null;
    return slot === null || isHealingPotion(slot);
  });
  if (!carrier || (save.consumables[itemId] ?? 0) < 1) return save;
  return equip(save, carrier, 'consumable', itemId);
}

/** Every hero still without a consumable takes the strongest healing potion held while the stock lasts. */
export function fillPotions(save: SaveData, heroIds: string[]): SaveData {
  return heroIds.reduce((next, id) => {
    const potion = heldPotion(next);
    return !consumableOf(next, id) && potion ? equip(next, id, 'consumable', potion) : next;
  }, save);
}
