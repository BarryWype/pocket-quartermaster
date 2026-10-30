import { gearId, gearRecipes } from '@/content/equipment';
import { secretRules } from '@/content/secrets';

import { statRollFromDice } from '../forging/roll';
import type { Rng } from '../generation/rng';
import { randomRelic } from '../loot/generators';
import { emptyLoot, type Loot } from '../loot/types';
import type { GearType } from '../types';

/** The underwater dungeon's and the Sealed vault's prize: a relic, else Rare gear, sometimes Legendary. */
export function secretPrize(tier: number, rng: Rng): Loot {
  const loot = emptyLoot();
  if (rng.chance(secretRules.prize.relicChance)) {
    loot.relics.push(randomRelic(tier, rng));
    loot.dropped.push('relics');
    return loot;
  }
  const types = (Object.keys(gearRecipes) as GearType[]).filter((type) => gearRecipes[type][tier - 1].length > 0);
  const type = types[rng.int(0, types.length - 1)];
  const quality = rng.chance(secretRules.prize.legendaryChance) ? 'legendary' : 'rare';
  loot.gear.push({ uid: '', itemId: gearId(type, tier), quality, roll: statRollFromDice(rng, 0) });
  loot.dropped.push('gear');
  return loot;
}
