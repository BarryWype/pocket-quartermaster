import { salvageRules } from '@/content/forging';
import type { Rarity } from '@/content/gear';
import { itemById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { shopRules } from '@/content/shops';

import { guildBonus } from '../guild/guild';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, HeroState, MaterialStack } from '../types';

/** Why a piece deserves a red warning line before it is destroyed. */
export type SalvageWarning = 'equipped' | 'rareOrBetter' | 'relic' | 'affixes';

export type SalvageDialogContent = {
  rarity: Rarity;
  returns: { materials: MaterialStack[]; gold: number };
  warnings: SalvageWarning[];
};

type Rules = typeof salvageRules;

/** Gear uid -> the hero wearing it, over the same slots `wornBy` checks. */
export function wearers(save: SaveData): Map<string, HeroState> {
  const map = new Map<string, HeroState>();
  for (const hero of save.heroes) {
    for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
      const uid = hero.equipment[slot];
      if (uid) map.set(uid, hero);
    }
  }
  return map;
}

export const wornBy = (save: SaveData, gearUid: string) => wearers(save).get(gearUid);

/** Equipped items first, then spare, each group keeping the input order. */
export function equippedFirst<T>(items: T[], uidOf: (item: T) => string, save: SaveData): T[] {
  const worn = wearers(save);
  const equipped = items.filter((item) => worn.has(uidOf(item)));
  const spare = items.filter((item) => !worn.has(uidOf(item)));
  return [...equipped, ...spare];
}

/** Worn gear (including gear away on an expedition) has to be taken off first. */
export function canSalvage(save: SaveData, gearUid: string) {
  return save.gear.some((g) => g.uid === gearUid) && !wornBy(save, gearUid);
}

/**
 * What salvaging a piece gives back: a share of its recipe by rarity (at
 * least 1 of the first input). `bonus` raises the share (Guild Hall).
 */
export function salvageReturns(gear: GearInstance, rules: Rules = salvageRules, bonus = 0): MaterialStack[] {
  const recipe = recipes.find((r) => 'itemId' in r.output && r.output.itemId === gear.itemId);
  const share = rules.returned[gear.rarity];
  const all = (recipe?.inputs ?? []).map(({ materialId, amount }, i) => ({
    materialId,
    amount: Math.max(i === 0 ? 1 : 0, Math.floor(amount * share * (1 + bonus))),
  }));
  // Merged, so a many-input recipe shows one line per material.
  return Object.entries(addMaterials({}, all))
    .filter(([, amount]) => amount > 0)
    .map(([materialId, amount]) => ({ materialId, amount }));
}

/** Gold for a piece without a recipe (trinkets): what a smithy would pay for it. */
export function salvageGold(gear: GearInstance): number {
  const item = itemById[gear.itemId] as GearDef;
  if (recipes.some((r) => 'itemId' in r.output && r.output.itemId === gear.itemId)) return 0;
  return Math.round(shopRules.gearPrice[item.tier - 1] * shopRules.rarityPrice[gear.rarity] * shopRules.gearSellShare);
}

/**
 * Everything the salvage confirmation dialog shows: the piece's rarity, what
 * destroying it gives back (with the Guild Hall Salvage bonus, so the numbers
 * match the store's `salvage`), and one warning tag per reason to think twice.
 * Pure — the component translates the tags.
 */
export function salvageDialog(save: SaveData, gear: GearInstance): SalvageDialogContent {
  return {
    rarity: gear.rarity,
    returns: {
      materials: salvageReturns(gear, salvageRules, guildBonus(save, 'salvage')),
      gold: salvageGold(gear),
    },
    warnings: [
      wornBy(save, gear.uid) ? 'equipped' : null,
      gear.rarity === 'rare' || gear.rarity === 'legendary' ? 'rareOrBetter' : null,
      gear.relicId ? 'relic' : null,
      gear.affixes.length > 0 ? 'affixes' : null,
    ].filter((warning): warning is SalvageWarning => warning !== null),
  };
}

/** Destroys a gear piece and gives back `salvageReturns` and `salvageGold`. */
export function salvage(save: SaveData, gearUid: string): SaveData {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear || !canSalvage(save, gearUid)) throw new Error(`Cannot salvage ${gearUid}`);
  return {
    ...save,
    gold: save.gold + salvageGold(gear),
    materials: addMaterials(save.materials, salvageReturns(gear, salvageRules, guildBonus(save, 'salvage'))),
    gear: save.gear.filter((g) => g.uid !== gearUid),
  };
}
