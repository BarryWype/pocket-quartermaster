import { dungeons } from '@/content/dungeons';
import { classAffinities, gearId, gearProfiles } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import { recipeById } from '@/content/lookup';
import { dungeonThreats } from '@/content/threats';
import { signatureWeapons, startingHeroes } from '@/content/heroes';
import { tierMaterials } from '@/content/materials';
import { stoneId } from '@/game/elements';

import { weaponTypeFor } from '../equipment/weaponOfChoice';
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
 *
 * The foothold: the next tier's blueprint of the signature weapon of the
 * starting-trio class the player fields most (its most levelled hero stands
 * for that: heroes level by being fielded), with that tier's main material for one
 * craft of it — the one exception to "materials only where you walk".
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
  const foothold = footholdRecipe(save, next);
  const footholdMaterial = foothold?.inputs.find((input) => input.materialId === tierMaterials[next - 1]);
  if (foothold && !save.knownRecipes.includes(foothold.id) && !recipeIds.includes(foothold.id)) recipeIds.push(foothold.id);
  return {
    ...emptyLoot(),
    recipeIds,
    gear: [{ uid: '', itemId: gearId(type, next), rarity: lootGearRarity('firstTierClear', rng, 0) }],
    materials: [
      ...(element ? [{ materialId: stoneId(element), amount: 1 }] : []),
      ...(footholdMaterial ? [{ materialId: footholdMaterial.materialId, amount: footholdMaterial.amount }] : []),
    ],
    dropped: [
      ...(recipeIds.length > 0 ? (['blueprints'] as const) : []),
      'gear',
      ...(footholdMaterial ? (['materials'] as const) : []),
      ...(element ? (['trophies'] as const) : []),
    ],
  };
}

const TRIO = startingHeroes.map((hero) => hero.classId);

/** The foothold's blueprint: the signature weapon (else the weapon of choice), at `tier`, of the class of the most levelled starting-trio-class hero (XP, then trio order, break ties). */
export function footholdRecipe(save: SaveData, tier: number) {
  const top = save.heroes
    .filter((h) => TRIO.includes(h.classId))
    .sort((a, b) => b.level - a.level || b.xp - a.xp || TRIO.indexOf(a.classId) - TRIO.indexOf(b.classId))[0];
  const classId = top?.classId ?? TRIO[0];
  const type = signatureWeapons[classId] ?? weaponTypeFor(classId);
  return type ? (recipeById[gearId(type, tier)] ?? null) : null;
}
