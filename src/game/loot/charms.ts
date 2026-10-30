import { lootMatrix } from '@/content/loot/matrix';

import type { ConsumableDef } from '../types';
import { dedupeModifiers } from './chances';
import { LOOT_CATEGORIES, type LootModifier, type LootSourceId } from './types';

/** The charms in a party's consumable slots, as loot modifiers: the same charm counts once. */
export const partyCharms = (party: { consumable: ConsumableDef | null }[]): LootModifier[] =>
  dedupeModifiers(party.flatMap((member) => (member.consumable?.charm ? [member.consumable.charm] : [])));

/**
 * Whether a charm can do anything at a source: its category (gold, XP or gear
 * for those charms) can drop there. Luck works wherever a chance can be raised.
 */
export function charmApplies(modifier: LootModifier, source: LootSourceId): boolean {
  const marks = lootMatrix[source].marks;
  switch (modifier.kind) {
    case 'chance':
      return marks[modifier.category] !== '—';
    case 'gold':
      return marks.gold !== '—';
    case 'xp':
      return marks.xp !== '—';
    case 'quality':
      return marks.gear !== '—';
    case 'luck':
      return marks.gold !== '—' || LOOT_CATEGORIES.some((category) => marks[category] !== '—' && marks[category] !== 'A');
  }
}

