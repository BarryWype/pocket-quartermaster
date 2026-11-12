import { gearRules } from '@/content/gear';
import { gearName, itemById, materialById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import type { Loot } from '@/game/loot/types';
import { t, tr } from '@/i18n';

import { goldLabel } from './Price';

/** A gains sentence with its `{gains}` placeholder emptied: the words that stay beside the gains list. */
export const gainsPrefix = (sentence: string) => sentence.replace(/[\s:·.!]+$/g, '');

/** What a place, patrol or activity paid, in a short wrapping line. */
export const lootText = (loot: Loot) => lootLabels(loot).join(', ');

/** One gain of a loot list; looted gear carries its rarity colour. */
export type LootGain = { text: string; color?: string };

/** Everything a loot roll gave, one entry each: gold first, then the rarer finds, then materials. */
export function lootGains(loot: Loot): LootGain[] {
  const rarity = (r: Loot['manuals'][number]) => t(`expeditions.rarity.${r}`);
  const gains: (LootGain | null)[] = [
    loot.gold > 0 ? { text: goldLabel(loot.gold, '+') } : null,
    ...loot.gear.map((g) => ({ text: `${itemById[g.itemId].emoji} ${gearName(g)}`, color: gearRules.colors[g.rarity] })),
    ...loot.recipeIds.map((id) => ({ text: t('expeditions.newBlueprint', { name: tr(recipeOutput(recipeById[id]).name) }) })),
    ...loot.treasureMaps.map((m) => ({ text: t('expeditions.treasureMap', { rarity: rarity(m.rarity) }) })),
    ...loot.manuals.map((m) => ({ text: t('expeditions.manual', { rarity: rarity(m) }) })),
    ...loot.relics.map((id) => ({ text: `🏺 ${tr(relicById[id].name)}` })),
    loot.keyFragments > 0 ? { text: t('places.keyFragments', { count: loot.keyFragments }) } : null,
    ...loot.consumables.map((c) => ({ text: `${itemById[c.itemId].emoji} ×${c.amount}` })),
    ...Array.from({ length: loot.lures }, () => ({ text: t('expeditions.lure') })),
    ...loot.materials.map((m) => ({ text: `${materialById[m.materialId].emoji} ${m.amount}` })),
  ];
  return gains.filter((gain): gain is LootGain => gain !== null);
}

/** The same gains as plain labels, for a wrapping line of text. */
export function lootLabels(loot: Loot): string[] {
  return lootGains(loot).map((gain) => gain.text);
}
