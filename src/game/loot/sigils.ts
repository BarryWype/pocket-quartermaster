import { lootConfig } from '@/content/loot/config';

import { convertShards, ELEMENTS, shardId, type Element } from '../elements';
import type { Rng } from '../generation/rng';
import { sigilCap } from '../guild/guild';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { DungeonDef } from '../types';

export type SigilDrop = { sigil?: number; sigilShards?: { element: Element; amount: number } };

/**
 * Sanctum Sigils sit outside the loot matrix: a won dungeon rolls its slot's
 * chance; the first tier 1 boss win and the pity counter guarantee one. A
 * Sigil over the cap crumbles into shards of a random element.
 */
export function rollSigil(save: SaveData, dungeon: DungeonDef, rng: Rng): { save: SaveData; drop: SigilDrop } {
  const rules = lootConfig.sigils;
  const slot = dungeon.isBoss ? 'boss' : (dungeon.slot ?? 'short');
  const rolled = rng.chance(rules.chanceBySlot[slot]);
  const firstSigil = !save.firstSigilGiven && dungeon.tier === 1 && !!dungeon.isBoss;
  const pityDue = save.sigilPity >= rules.pityAfter;
  if (!rolled && !firstSigil && !pityDue) return { save: { ...save, sigilPity: save.sigilPity + 1 }, drop: {} };

  const reset = { ...save, sigilPity: 0, firstSigilGiven: true };
  if (save.sigils.length < sigilCap(save)) {
    return { save: { ...reset, sigils: [...save.sigils, dungeon.tier] }, drop: { sigil: dungeon.tier } };
  }
  const element = ELEMENTS[rng.int(0, ELEMENTS.length - 1)];
  const amount = rules.capShardsPerTier * dungeon.tier;
  return {
    save: { ...reset, materials: convertShards(addMaterials(save.materials, [{ materialId: shardId(element), amount }])) },
    drop: { sigilShards: { element, amount } },
  };
}
