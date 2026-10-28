import type { ClassRarity, HeroClassId } from '@/game/types';

export const rosterRules = {
  /** Heroes per expedition. */
  partySize: 3,
  /** Heroes the player can have at once. */
  rosterCap: 6,
};

/** Recruits offered at taverns. Price = base × level factor × roster factor × trait factor. */
export const recruitRules = {
  offersPerTavern: 3,
  rarityWeights: { common: 0.6, uncommon: 0.4 } satisfies Record<ClassRarity, number>,
  /** Chance an offer has a positive trait rather than a negative one. */
  positiveTraitChance: 0.6,
  /** Offers are this many levels below the roster's average level (at least level 1). */
  levelsBelowAverage: 1,
  price: {
    /** Higher than the old 80/180: the forge fee's removal left more gold for recruits. */
    base: { common: 100, uncommon: 220 } satisfies Record<ClassRarity, number>,
    /** +25% per level above 1. */
    perLevel: 0.25,
    /** The roster factor counts heroes beyond this many. */
    freeHeroes: 3,
    /** +45% per hero beyond `freeHeroes`; raised from 35% when the forge fee went, so the 6th hero stays a save-up. */
    perExtraHero: 0.45,
    trait: { positive: 1.15, negative: 0.75 },
    /** × this per tier above 1 (highest unlocked tier), so recruits keep pace with income. */
    perTier: 1.5,
  },
};

/** Recruit names by class. */
export const heroNames: Record<HeroClassId, string[]> = {
  warrior: ['Garrick', 'Hilde', 'Tormund', 'Brenna', 'Osric', 'Ysolde'],
  ranger: ['Fenn', 'Willa', 'Corin', 'Sable', 'Ashe', 'Rowan'],
  fireMage: ['Ember', 'Pyra', 'Cinder', 'Ignatius', 'Flint', 'Sorcha'],
  frostMage: ['Isolde', 'Rime', 'Boreas', 'Sleet', 'Frey', 'Neve'],
  thief: ['Nim', 'Slink', 'Vesper', 'Pip', 'Wren', 'Magpie'],
  barbarian: ['Krag', 'Ulfra', 'Thrain', 'Gudrun', 'Bjorn', 'Rask'],
  cleric: ['Anselm', 'Mercy', 'Tobias', 'Clement', 'Hester', 'Benedict'],
  paladin: ['Aldric', 'Seraphine', 'Galen', 'Roland', 'Elowen', 'Cassian'],
  druid: ['Bramble', 'Fern', 'Oakley', 'Moss', 'Linden', 'Hazel'],
  troubadour: ['Lark', 'Melody', 'Jasper', 'Cadence', 'Finch', 'Sonnet'],
  sorcerer: ['Morwen', 'Thalos', 'Vex', 'Zara', 'Orrin', 'Lucan'],
};
