import { lootMatrix } from '@/content/loot/matrix';

import { dedupeModifiers } from './chances';
import { LOOT_CATEGORIES, type LootModifier, type LootSourceId } from './types';

/** The loot trinkets a party wears, as loot modifiers: the same trinket counts once. */
export const partyLootModifiers = (party: { loot?: LootModifier }[]): LootModifier[] =>
  dedupeModifiers(party.flatMap((member) => (member.loot ? [member.loot] : [])));

/**
 * Whether a loot trinket can do anything at a source: its category (gold, XP
 * or gear for those trinkets) can drop there. Luck works wherever a chance
 * can be raised.
 */
export function lootModifierApplies(modifier: LootModifier, source: LootSourceId): boolean {
  const marks = lootMatrix[source].marks;
  switch (modifier.kind) {
    case 'chance':
      return marks[modifier.category] !== '—';
    case 'gold':
      return marks.gold !== '—';
    case 'xp':
      return marks.xp !== '—';
    case 'rarity':
      return marks.gear !== '—';
    case 'luck':
      return marks.gold !== '—' || LOOT_CATEGORIES.some((category) => marks[category] !== '—' && marks[category] !== 'A');
  }
}
