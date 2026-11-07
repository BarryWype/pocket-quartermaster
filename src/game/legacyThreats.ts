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
export const LEGACY_KIT_REFUNDS: Record<string, { materials: Record<string, number> } | { gold: number }> = {
  roguesRoll: { materials: { bone: 2, hide: 1 } },
  huntersPack: { materials: { bone: 1, meat: 1, hide: 1 } },
  explorersKit: { materials: { stone: 1, wood: 1, hide: 2 } },
  giftBasket: { materials: { stone: 1, berries: 1, meat: 1 } },
  healersSatchel: { materials: { stone: 1, herb: 1, mushroom: 1 } },
  lantern: { materials: { copper: 1, wood: 1, meat: 1 } },
  holyRelics: { materials: { copper: 1, herb: 1, stone: 1 } },
  blessedRelics: { materials: { copper: 1, herb: 1, stone: 1 } },
  emberWardSalve: { materials: { iron: 1, fireShard: 1, herb: 1 } },
  tideWardSalve: { materials: { iron: 1, waterShard: 1, herb: 1 } },
  stormWardSalve: { materials: { iron: 1, electricShard: 1, herb: 1 } },
  stoneWardSalve: { materials: { iron: 1, stoneShard: 1, herb: 1 } },
  thornWardSalve: { materials: { iron: 1, grassShard: 1, herb: 1 } },
  scholarsSatchel: { materials: { coal: 1, wood: 1, berries: 1 } },
};

/**
 * Every removed talisman trinket, with what a smithy paid for it at Common
 * quality (round(gearPrice × gearSellShare), the values of the day the items
 * were deleted). Read by the save migration and nothing else.
 */
export const LEGACY_TALISMAN_IDS: Record<string, number> = {
  oxTalisman1: 3, oxTalisman2: 6, oxTalisman3: 12, oxTalisman4: 24, oxTalisman5: 48,
  foxTalisman1: 3, foxTalisman2: 6, foxTalisman3: 12, foxTalisman4: 24, foxTalisman5: 48,
  owlTalisman1: 3, owlTalisman2: 6, owlTalisman3: 12, owlTalisman4: 24, owlTalisman5: 48,
  doveTalisman1: 3, doveTalisman2: 6, doveTalisman3: 12, doveTalisman4: 24, doveTalisman5: 48,
  lionTalisman1: 3, lionTalisman2: 6, lionTalisman3: 12, lionTalisman4: 24, lionTalisman5: 48,
};
