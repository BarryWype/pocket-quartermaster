import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';

import type { LootCategory, LootModifier, LootSourceId, MapRarity } from './types';

export type ChanceInput = {
  source: LootSourceId;
  minutes?: number;
  luck: number;
  modifiers: LootModifier[];
  mapRarity?: MapRarity;
  chanceMultiplier?: number;
};

/** First modifier of each id: the same charm from two heroes counts once. */
export function dedupeModifiers(mods: LootModifier[]): LootModifier[] {
  const seen = new Set<string>();
  return mods.filter((mod) => {
    if (seen.has(mod.id)) return false;
    seen.add(mod.id);
    return true;
  });
}

/** Run-scaled sources multiply by minutes ÷ 45, clamped; everything else 1. */
export function runLengthMultiplier(source: LootSourceId, minutes?: number): number {
  if (minutes === undefined || !lootConfig.runLength.sources.includes(source)) return 1;
  const { baseMinutes, min, max } = lootConfig.runLength;
  return Math.min(max, Math.max(min, minutes / baseMinutes));
}

/** The party's Luck, plus flat Luck charms (deduped). */
export function partyLuck(luck: number, modifiers: LootModifier[]): number {
  return (
    luck + dedupeModifiers(modifiers).reduce((sum, mod) => (mod.kind === 'luck' ? sum + mod.add : sum), 0)
  );
}

/** The map's loot multiplier, applied at the treasure spot only. */
function mapMultiplier(input: ChanceInput): number {
  if (input.source !== 'treasureSpot' || !input.mapRarity) return 1;
  return lootConfig.treasureMaps.lootMultiplier[input.mapRarity];
}

export function categoryChance(category: LootCategory, input: ChanceInput): number {
  const mark = lootMatrix[input.source].marks[category];
  if (mark === '—') return 0;
  if (mark === 'A') return 1;
  if (
    input.source === 'treasureSpot' &&
    input.mapRarity !== 'legendary' &&
    lootConfig.treasureMaps.legendaryOnly.includes(category)
  ) {
    return 0;
  }
  const luck = partyLuck(input.luck, input.modifiers);
  const { chancePerPoint, maxChanceBonus } = lootConfig.luck;
  const charms = dedupeModifiers(input.modifiers).reduce(
    (factor, mod) => (mod.kind === 'chance' && mod.category === category ? factor * mod.multiplier : factor),
    1,
  );
  const chance =
    lootConfig.markChances[mark] *
    lootConfig.categoryMultipliers[category] *
    lootConfig.sourceMultipliers[input.source] *
    runLengthMultiplier(input.source, input.minutes) *
    (1 + Math.min(maxChanceBonus, chancePerPoint * luck)) *
    charms *
    mapMultiplier(input) *
    (input.chanceMultiplier ?? 1);
  return Math.min(lootConfig.maxChance, chance);
}

/** Every category's final drop chance, after Luck, charms, run length and caps. */
export function lootChances(input: ChanceInput): Record<LootCategory, number> {
  return Object.fromEntries(
    (Object.keys(lootMatrix[input.source].marks) as LootCategory[]).map((category) => [
      category,
      categoryChance(category, input),
    ]),
  ) as Record<LootCategory, number>;
}
