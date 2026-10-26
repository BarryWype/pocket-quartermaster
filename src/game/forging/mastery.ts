import { masteryRules } from '@/content/forging';

import type { SaveData } from '../save';
import type { GearDef, MasteryState, MasteryType } from '../types';

type Rules = typeof masteryRules;

export const masteryTypeOf = (item: GearDef): MasteryType => item.weaponType ?? 'armour';

/** Highest mastery level a material tier allows. */
export const masteryCap = (tier: number, rules: Rules = masteryRules) => rules.cap.base + rules.cap.perTier * tier;

export function masteryOf(save: SaveData, type: MasteryType): MasteryState {
  return save.mastery[type] ?? { level: 1, progress: 0 };
}

/** Forges needed to go from `level` to the next, or null past the last band. */
export function forgesForNextLevel(level: number, rules: Rules = masteryRules) {
  return rules.bands.find((band) => level < band.upTo)?.forges ?? null;
}

/** One forge of an item of `itemTier`: progress only counts while below that tier's cap. */
export function gainMastery(state: MasteryState, itemTier: number, rules: Rules = masteryRules): MasteryState {
  const needed = forgesForNextLevel(state.level, rules);
  if (state.level >= masteryCap(itemTier, rules) || needed === null) return state;
  const progress = state.progress + 1;
  return progress >= needed ? { level: state.level + 1, progress: 0 } : { level: state.level, progress };
}

/** A weapon type first met through a later blueprint starts at the cap of the tier before it. */
export const startingMastery = (blueprintTier: number, rules: Rules = masteryRules): MasteryState => ({
  level: blueprintTier > 1 ? masteryCap(blueprintTier - 1, rules) : 1,
  progress: 0,
});
