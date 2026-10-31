import { salvageRules } from '@/content/forging';
import { itemById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { shopRules } from '@/content/shops';

import { convertShards, ELEMENTS, shardId, type Element } from '../elements';
import { createRng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, MaterialStack, Quality } from '../types';

/** Why a piece deserves a red warning line before it is destroyed. */
export type SalvageWarning = 'equipped' | 'rareOrBetter' | 'relic' | 'component' | 'infused';

export type SalvageDialogContent = {
  quality: Quality;
  returns: { materials: MaterialStack[]; gold: number };
  warnings: SalvageWarning[];
};

type Rules = typeof salvageRules;

export const wornBy = (save: SaveData, gearUid: string) =>
  save.heroes.find(
    (h) => h.equipment.weapon === gearUid || h.equipment.armor === gearUid || h.equipment.offhand === gearUid || h.equipment.trinket === gearUid,
  );

/** Worn gear (including gear away on an expedition) has to be taken off first. */
export function canSalvage(save: SaveData, gearUid: string) {
  return save.gear.some((g) => g.uid === gearUid) && !wornBy(save, gearUid);
}

/**
 * What salvaging a piece gives back: a share of its recipe by quality (at
 * least 1 of the first input), 5 shards of its element if infused, and for a
 * Legendary piece shards of an element picked from its uid, one per tier.
 * `bonus` raises the recipe share (Guild Hall).
 */
export function salvageReturns(gear: GearInstance, rules: Rules = salvageRules, bonus = 0): MaterialStack[] {
  const item = itemById[gear.itemId] as GearDef;
  const recipe = recipes.find((r) => 'itemId' in r.output && r.output.itemId === gear.itemId);
  const share = rules.returned[gear.quality];
  const returned = (recipe?.inputs ?? []).map(({ materialId, amount }, i) => ({
    materialId,
    amount: Math.max(i === 0 ? 1 : 0, Math.floor(amount * share * (1 + bonus))),
  }));

  const shards: [Element, number][] = [];
  if (gear.element) shards.push([gear.element, rules.infusedShards]);
  if (gear.quality === 'legendary') {
    const element = ELEMENTS[createRng(`${gear.uid}|salvage`).int(0, ELEMENTS.length - 1)];
    shards.push([element, rules.legendaryShardsPerTier * item.tier]);
  }
  const all = [...returned, ...shards.map(([element, amount]) => ({ materialId: shardId(element), amount }))];
  // Merged, so an infused Legendary piece shows one line per shard element.
  return Object.entries(addMaterials({}, all))
    .filter(([, amount]) => amount > 0)
    .map(([materialId, amount]) => ({ materialId, amount }));
}

/** Gold for a piece without a recipe (trinkets): what a smithy would pay for it. */
export function salvageGold(gear: GearInstance): number {
  const item = itemById[gear.itemId] as GearDef;
  if (recipes.some((r) => 'itemId' in r.output && r.output.itemId === gear.itemId)) return 0;
  return Math.round(shopRules.gearPrice[item.tier - 1] * shopRules.qualityPrice[gear.quality] * shopRules.gearSellShare);
}

/**
 * Everything the salvage confirmation dialog shows: the piece's quality, what
 * destroying it gives back (with the Guild Hall Salvage bonus, so the numbers
 * match the store's `salvage`), and one warning tag per reason to think twice.
 * Pure — the component translates the tags.
 */
export function salvageDialog(save: SaveData, gear: GearInstance): SalvageDialogContent {
  return {
    quality: gear.quality,
    returns: {
      materials: salvageReturns(gear, salvageRules, guildBonus(save, 'salvage')),
      gold: salvageGold(gear),
    },
    warnings: [
      wornBy(save, gear.uid) ? 'equipped' : null,
      gear.quality === 'rare' || gear.quality === 'legendary' ? 'rareOrBetter' : null,
      gear.relicId ? 'relic' : null,
      gear.component ? 'component' : null,
      gear.element ? 'infused' : null,
    ].filter((warning): warning is SalvageWarning => warning !== null),
  };
}

/** Destroys a gear piece and gives back `salvageReturns` and `salvageGold`; shards merge into stones as usual. */
export function salvage(save: SaveData, gearUid: string): SaveData {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear || !canSalvage(save, gearUid)) throw new Error(`Cannot salvage ${gearUid}`);
  return {
    ...save,
    gold: save.gold + salvageGold(gear),
    materials: convertShards(addMaterials(save.materials, salvageReturns(gear, salvageRules, guildBonus(save, 'salvage')))),
    gear: save.gear.filter((g) => g.uid !== gearUid),
  };
}
