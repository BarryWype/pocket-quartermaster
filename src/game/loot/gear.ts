import { gearId, gearRecipes } from '@/content/equipment';
import { difficultyRules } from '@/content/difficulty';
import { lootConfig } from '@/content/loot/config';
import { RARITIES, type Rarity } from '@/content/gear';
import type { GearType } from '@/game/types';

import type { Rng } from '../generation/rng';
import { dedupeModifiers, partyLuck } from './chances';
import type { LootRequest } from './roll';
import type { LootSourceId, MapRarity, RolledGear } from './types';

/** Dungeon-tiered sources give the source's tier; others the player's, or one below. */
export function lootGearTier(source: LootSourceId, sourceTier: number, playerTier: number, rng: Rng): number {
  if (lootConfig.dungeonSources.includes(source)) return sourceTier;
  if (rng.next() < lootConfig.gearTier.playerTierShare) return playerTier;
  return Math.max(1, playerTier - 1);
}

/**
 * d20 + bonus through the source's ladder, then lifted to the source's floor,
 * then `steps` rarities up (Hard, the Tinker's lodestone, Plunder), never past
 * the ladder's best nor past Rare: a Legendary only comes from a ladder's own
 * roll. A ladder with an upgrade roll then may lift the piece to Rare or
 * Legendary on its own small chances, which no step raises.
 */
export function lootGearRarity(source: LootSourceId, rng: Rng, bonus: number, mapRarity?: MapRarity, steps = 0): Rarity {
  const { ladders, ladderBySource, floors } = lootConfig.gearRarity;
  const key = mapRarity === 'rare' || mapRarity === 'legendary' ? 'big' : (ladderBySource[source] ?? 'basic');
  const ladder = ladders[key];
  const roll = rng.int(1, 20) + bonus;
  let rarity = ladder[ladder.length - 1][1];
  for (const [ceiling, rung] of ladder) {
    if (roll <= ceiling) {
      rarity = rung;
      break;
    }
  }
  const floor = floors[source];
  if (floor && RARITIES.indexOf(floor) > RARITIES.indexOf(rarity)) rarity = floor;
  const best = Math.min(Math.max(RARITIES.indexOf(ladder[ladder.length - 1][1]), floor ? RARITIES.indexOf(floor) : 0), RARITIES.indexOf('rare'));
  const lifted = Math.min(RARITIES.indexOf(rarity) + steps, best);
  if (lifted > RARITIES.indexOf(rarity)) rarity = RARITIES[lifted];
  const upgrade = lootConfig.gearRarity.upgrades[key];
  if (!upgrade) return rarity;
  const chance = rng.next();
  if (chance < upgrade.legendary) return 'legendary';
  if (chance < upgrade.legendary + upgrade.rare && RARITIES.indexOf(rarity) < RARITIES.indexOf('rare')) return 'rare';
  return rarity;
}

/** A random looted piece, its type now and then one of the context's useful types: uid '' until the save grants it, when its rolls are made. */
export function rollLootGear(req: LootRequest): RolledGear {
  const tier = lootGearTier(req.source, req.tier, req.context.playerTier, req.rng);
  const types = (Object.keys(gearRecipes) as GearType[]).filter((type) => gearRecipes[type][tier - 1].length > 0);
  const useful = types.filter((type) => req.context.usefulTypes?.includes(type));
  const pool = useful.length > 0 && req.rng.next() < lootConfig.usefulDrops.share ? useful : types;
  const type = pool[req.rng.int(0, pool.length - 1)];
  const rarity = lootGearRarity(req.source, req.rng, rarityBonus(req), req.mapRarity, raritySteps(req));
  return { uid: '', itemId: gearId(type, tier), rarity };
}

/** Every 10 Luck adds 1 to the ladder roll. */
export function rarityBonus(req: Pick<LootRequest, 'luck' | 'modifiers'>): number {
  return Math.floor(partyLuck(req.luck, req.modifiers) / lootConfig.luck.pointsPerRarityStep);
}

/** Rarity charms: whole steps up after the roll; a harder source and the party's family add their own (see difficultyRules.rewards). */
export const raritySteps = (req: Pick<LootRequest, 'modifiers' | 'difficulty' | 'familySteps'>): number =>
  dedupeModifiers(req.modifiers).reduce((sum, mod) => (mod.kind === 'rarity' ? sum + mod.steps : sum), 0) +
  (req.difficulty ? difficultyRules.rewards[req.difficulty].raritySteps : 0) +
  (req.familySteps ?? 0);
