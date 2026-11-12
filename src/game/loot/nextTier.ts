import { dungeons } from '@/content/dungeons';
import { classAffinities, gearId, gearProfiles } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import { recipeById } from '@/content/lookup';
import { dungeonThreats } from '@/content/threats';
import { stoneId } from '@/game/elements';
import type { GearType } from '@/game/types';

import type { Rng } from '../generation/rng';
import type { SaveData } from '../save';
import { lootGearRarity } from './gear';
import { emptyLoot, type Loot } from './types';

/**
 * What a tier boss's first clear adds for the next tier, so it doesn't open as
 * a wall: every armour and helmet blueprint of it not yet known, and one piece
 * of it, of a type a roster hero favours, on the first clear's rarity ladder,
 * and from the tiers in `lootConfig.bossStones` an elemental stone of the next
 * tier's first elemental dungeon. Nothing after the last tier.
 */
export function nextTierReward(save: SaveData, tier: number, rng: Rng): Loot {
  const next = tier + 1;
  const types = (Object.keys(gearProfiles) as GearType[]).filter((type) => recipeById[gearId(type, next)]);
  if (types.length === 0) return emptyLoot();
  const recipeIds = types
    .filter((type) => gearProfiles[type].slot === 'armor' || gearProfiles[type].slot === 'helmet')
    .map((type) => gearId(type, next))
    .filter((id) => !save.knownRecipes.includes(id));
  const favoured = types.filter((type) =>
    save.heroes.some((hero) => (classAffinities[hero.classId] as Partial<Record<GearType, string>>)[type] === 'favoured'),
  );
  const pool = favoured.length > 0 ? favoured : types;
  const type = pool[rng.int(0, pool.length - 1)];
  const element = lootConfig.bossStones.includes(tier)
    ? dungeons
        .filter((d) => d.tier === next && d.chainIndex !== undefined && !d.isBoss)
        .sort((a, b) => a.chainIndex! - b.chainIndex!)
        .map((d) => dungeonThreats[d.id]?.element)
        .find((e) => e !== undefined)
    : undefined;
  return {
    ...emptyLoot(),
    recipeIds,
    gear: [{ uid: '', itemId: gearId(type, next), rarity: lootGearRarity('firstTierClear', rng, 0) }],
    materials: element ? [{ materialId: stoneId(element), amount: 1 }] : [],
    dropped: [...(recipeIds.length > 0 ? (['blueprints'] as const) : []), 'gear', ...(element ? (['trophies'] as const) : [])],
  };
}
