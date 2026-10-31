import { masteryTypeNames } from '@/content/forging';
import { gearName, itemById, materialById, recipeById, recipeOutput, relicById, valuableById } from '@/content/lookup';
import type { Loot } from '@/game/loot/types';
import { t, tr } from '@/i18n';

/** A gains sentence with its `{gains}` placeholder emptied: the words that stay beside the gains list. */
export const gainsPrefix = (sentence: string) => sentence.replace(/[\s:·.!]+$/g, '');

/** What a place, patrol or activity paid, in a short wrapping line. */
export const lootText = (loot: Loot) => lootLabels(loot).join(', ');

/** Everything a loot roll gave, one short label each: gold first, then the rarer finds, then materials. */
export function lootLabels(loot: Loot): string[] {
  const rarity = (r: Loot['manuals'][number]) => t(`expeditions.rarity.${r}`);
  return [
    loot.gold > 0 ? `🪙 +${loot.gold}` : null,
    ...loot.gear.map((g) => `${itemById[g.itemId].emoji} ${gearName(g)}`),
    ...loot.recipeIds.map((id) => t('expeditions.newBlueprint', { name: tr(recipeOutput(recipeById[id]).name) })),
    ...loot.mastery.map((m) => t('expeditions.tierComplete', { tier: m.tier, forges: m.forges, types: tr(masteryTypeNames[m.type].plural) })),
    ...loot.treasureMaps.map((m) => t('expeditions.treasureMap', { rarity: rarity(m.rarity) })),
    ...loot.manuals.map((m) => t('expeditions.manual', { rarity: rarity(m) })),
    ...loot.valuables.map((v) => `${valuableById[v.valuableId].emoji} ${t('inventory.valuable', { name: tr(valuableById[v.valuableId].name), tier: v.tier })}${v.amount > 1 ? ` ×${v.amount}` : ''}`),
    ...loot.relics.map((id) => `🏺 ${tr(relicById[id].name)}`),
    loot.keyFragments > 0 ? t('places.keyFragments', { count: loot.keyFragments }) : null,
    ...loot.consumables.map((c) => `${itemById[c.itemId].emoji} ×${c.amount}`),
    ...Array.from({ length: loot.lures }, () => t('expeditions.lure')),
    ...loot.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
  ].filter((label): label is string => label !== null);
}
