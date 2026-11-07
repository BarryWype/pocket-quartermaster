import type { ThreatId } from './types';

/**
 * The seven threats of the families rework, and what each old threat id became
 * when it was merged into them. Read by the save migration and nothing else;
 * Locals was removed outright, so it maps to nothing.
 */
export const LEGACY_THREAT_MAP: Partial<Record<string, ThreatId>> = {
  holy: 'holy',
  beasts: 'beasts',
  darkness: 'darkness',
  traps: 'traps',
  poison: 'poison',
  element: 'element',
  armoured: 'armoured',
  undead: 'holy',
  desecrated: 'holy',
  swarm: 'beasts',
  ambush: 'darkness',
  thieves: 'traps',
  rubble: 'traps',
  locked: 'traps',
  puzzle: 'traps',
  maze: 'traps',
  casters: 'element',
  underwater: 'element',
  brute: 'armoured',
};

/**
 * What every removed consumable cost to craft, copied from the recipes as
 * they were the moment the items were deleted (blessed symbols were only made
 * by a chapel, from the holy symbols recipe). Read by the save migration and
 * nothing else: held ones are refunded these materials.
 */
export const LEGACY_KIT_REFUNDS: Record<string, Record<string, number>> = {
  roguesRoll: { bone: 2, hide: 1 },
  huntersPack: { bone: 1, meat: 1, hide: 1 },
  explorersKit: { stone: 1, wood: 1, hide: 2 },
  giftBasket: { stone: 1, berries: 1, meat: 1 },
  healersSatchel: { stone: 1, herb: 1, mushroom: 1 },
  lantern: { copper: 1, wood: 1, meat: 1 },
  holyRelics: { copper: 1, herb: 1, stone: 1 },
  blessedRelics: { copper: 1, herb: 1, stone: 1 },
  emberWardSalve: { iron: 1, fireShard: 1, herb: 1 },
  tideWardSalve: { iron: 1, waterShard: 1, herb: 1 },
  stormWardSalve: { iron: 1, electricShard: 1, herb: 1 },
  stoneWardSalve: { iron: 1, stoneShard: 1, herb: 1 },
  thornWardSalve: { iron: 1, grassShard: 1, herb: 1 },
  scholarsSatchel: { coal: 1, wood: 1, berries: 1 },
};

/** The removed talisman trinkets' ids: a kind and a tier, as in `oxTalisman3`. */
export const LEGACY_TALISMAN = /^(ox|fox|owl|dove|lion)Talisman([1-5])$/;
