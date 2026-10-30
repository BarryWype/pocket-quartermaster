import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';

import { categoryChance } from '../loot/chances';
import { CATEGORY_COLUMNS } from '../loot/matrixCsv';
import { LOOT_CATEGORIES, LOOT_SOURCES, type LootCategory, type LootSourceId, type MapRarity } from '../loot/types';

/** Fixed extras that aren't a mark: the ruins give a relic every 5th dig. */
const EXTRAS: Partial<Record<LootSourceId, Partial<Record<LootCategory, number>>>> = {
  ruinsDig: { relics: 1 / 5 },
};

/** A source's chance with no Luck or charms; a treasure spot's averages its map rarities by how often each drops. */
function sourceChance(source: LootSourceId, category: LootCategory): number {
  if (source !== 'treasureSpot') return categoryChance(category, { source, luck: 0, modifiers: [] });
  const weights = lootConfig.treasureMaps.rarityWeights;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return (Object.keys(weights) as MapRarity[]).reduce(
    (sum, mapRarity) => sum + (weights[mapRarity] / total) * categoryChance(category, { source, luck: 0, modifiers: [], mapRarity }),
    0,
  );
}

export type PacingRow = { category: LootCategory; column: string; perWeek: number; mostly: string[] };

/**
 * Weekly drops per category for the regular player: each source's final
 * chance (config multipliers and map rarity included, no Luck, charms or run length) times
 * its visits per day, as doc/design/loot/tools/pacing.py works it out.
 */
export function lootPacing(): PacingRow[] {
  const columns = Object.fromEntries(Object.entries(CATEGORY_COLUMNS).map(([column, category]) => [category, column]));
  return LOOT_CATEGORIES.map((category) => {
    const bySource = LOOT_SOURCES.map((source) => {
      const chance = sourceChance(source, category) + (EXTRAS[source]?.[category] ?? 0);
      return { source, perDay: chance * lootMatrix[source].visitsPerDay };
    }).filter((s) => s.perDay > 0);
    return {
      category,
      column: columns[category],
      perWeek: bySource.reduce((sum, s) => sum + s.perDay, 0) * 7,
      mostly: [...bySource].sort((a, b) => b.perDay - a.perDay).slice(0, 3).map((s) => lootMatrix[s.source].name),
    };
  });
}

/** The report's lines, in pacing.py's format. */
export const pacingLines = () =>
  lootPacing().map((row) => `${row.column.padEnd(15)} ${row.perWeek.toFixed(1).padStart(6)} per week   mostly: ${row.mostly.join(', ')}`);
