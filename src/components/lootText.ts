import { gearName, itemById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import type { Loot } from '@/game/loot/types';
import { t, tr } from '@/i18n';

/** Everything a loot roll gave, one short label each: gold first, then the rarer finds, then materials. */
export function lootLabels(loot: Loot): string[] {
  const rarity = (r: Loot['manuals'][number]) => t(`expeditions.rarity.${r}`);
  return [
    loot.gold > 0 ? `🪙 +${loot.gold}` : null,
    ...loot.gear.map((g) => `${itemById[g.itemId].emoji} ${gearName(g)}`),
    ...loot.recipeIds.map((id) => `📜 ${tr(recipeOutput(recipeById[id]).name)}`),
    ...loot.treasureMaps.map((m) => t('expeditions.treasureMap', { rarity: rarity(m.rarity) })),
    ...loot.manuals.map((m) => t('expeditions.manual', { rarity: rarity(m) })),
    loot.keyFragments > 0 ? t('places.keyFragments', { count: loot.keyFragments }) : null,
    ...loot.consumables.map((c) => `${itemById[c.itemId].emoji} ×${c.amount}`),
    ...Array.from({ length: loot.lures }, () => t('expeditions.lure')),
    ...loot.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
  ].filter((label): label is string => label !== null);
}
