import { gearId, gearRecipes } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import { QUALITIES } from '@/content/forging';
import type { GearInstance, GearType, Quality } from '@/game/types';

import { statRollFromDice } from '../forging/roll';
import type { Rng } from '../generation/rng';
import { dedupeModifiers, partyLuck } from './chances';
import type { LootRequest } from './roll';
import type { LootSourceId, MapRarity } from './types';

/** Dungeon-tiered sources give the source's tier; others the player's, or one below. */
export function lootGearTier(source: LootSourceId, sourceTier: number, playerTier: number, rng: Rng): number {
  if (lootConfig.dungeonSources.includes(source)) return sourceTier;
  if (rng.next() < lootConfig.gearTier.playerTierShare) return playerTier;
  return Math.max(1, playerTier - 1);
}

/**
 * d20 + bonus through the source's ladder, then lifted to the source's floor,
 * then `steps` qualities up (quality charms), never past the ladder's best.
 */
export function lootGearQuality(source: LootSourceId, rng: Rng, bonus: number, mapRarity?: MapRarity, steps = 0): Quality {
  const { ladders, ladderBySource, floors } = lootConfig.gearQuality;
  const ladder =
    mapRarity === 'rare' || mapRarity === 'legendary' ? ladders.big : ladders[ladderBySource[source] ?? 'basic'];
  const roll = rng.int(1, 20) + bonus;
  let quality = ladder[ladder.length - 1][1];
  for (const [ceiling, ladderQuality] of ladder) {
    if (roll <= ceiling) {
      quality = ladderQuality;
      break;
    }
  }
  const floor = floors[source];
  if (floor && QUALITIES.indexOf(floor) > QUALITIES.indexOf(quality)) quality = floor;
  const best = Math.max(QUALITIES.indexOf(ladder[ladder.length - 1][1]), floor ? QUALITIES.indexOf(floor) : 0);
  const lifted = Math.min(QUALITIES.indexOf(quality) + steps, best);
  return lifted > QUALITIES.indexOf(quality) ? QUALITIES[lifted] : quality;
}

/** A random looted piece: uid '' until the save grants it. */
export function rollLootGear(req: LootRequest): GearInstance {
  const tier = lootGearTier(req.source, req.tier, req.context.playerTier, req.rng);
  const types = (Object.keys(gearRecipes) as GearType[]).filter((type) => gearRecipes[type][tier - 1].length > 0);
  const type = types[req.rng.int(0, types.length - 1)];
  const quality = lootGearQuality(req.source, req.rng, qualityBonus(req), req.mapRarity, qualitySteps(req));
  return { uid: '', itemId: gearId(type, tier), quality, roll: statRollFromDice(req.rng, 0) };
}

/** Every 10 Luck adds 1 to the ladder roll. */
export function qualityBonus(req: Pick<LootRequest, 'luck' | 'modifiers'>): number {
  return Math.floor(partyLuck(req.luck, req.modifiers) / lootConfig.luck.pointsPerQualityStep);
}

/** Quality charms: whole steps up after the roll. */
export const qualitySteps = (req: Pick<LootRequest, 'modifiers'>): number =>
  dedupeModifiers(req.modifiers).reduce((sum, mod) => (mod.kind === 'quality' ? sum + mod.steps : sum), 0);
