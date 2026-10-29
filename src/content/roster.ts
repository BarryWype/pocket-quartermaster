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
  rarityWeights: { common: 0.6, uncommon: 0.4, rare: 0 } satisfies Record<ClassRarity, number>,
  /** Chance an offer has a positive trait rather than a negative one. */
  positiveTraitChance: 0.6,
  /** Offers are this many levels below the roster's average level (at least level 1). */
  levelsBelowAverage: 1,
  price: {
    /** Higher than the old 80/180: the forge fee's removal left more gold for recruits. */
    base: { common: 100, uncommon: 220, rare: 600 } satisfies Record<ClassRarity, number>,
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
  /**
   * The recruit roll (see game/taverns/roll.ts): 3d6 sums per stat, a chance of
   * an approach bonus, and grades by the 16 sums' total that scale the price.
   */
  roll: {
    /** Chance of +1 on a random approach. */
    approachChance: 0.1,
    /** Grade thresholds: total of the 16 sums minus 168 (16 × the 10.5 average). */
    grade: { S: 18, A: 6, B: -6 },
    /** Price multiplier per grade, on top of today's factors. */
    gradePrice: { C: 0.85, B: 1, A: 1.2, S: 1.5 },
    /** A stat's base + growth sums this far from 21 (the pair's average) get an arrow. */
    arrowThreshold: 3,
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
  scholar: ['Aldous', 'Quill', 'Bertram', 'Elspeth', 'Dunstan', 'Mira'],
  exorcist: ['Gervas', 'Ansel', 'Urien', 'Sylvaine', 'Barnabas', 'Radbod'],
  duelist: ['Rennard', 'Isabeau', 'Corvin', 'Lysette', 'Gaspard', 'Aldo'],
  smuggler: ['Salt', 'Marlow', 'Vane', 'Cinza', 'Brack', 'Ryna'],
  diplomat: ['Perrin', 'Ottilie', 'Emeric', 'Sable', 'Conrad', 'Yvain'],
  necromancer: ['Mordecai', 'Lysandra', 'Vesper', 'Ossian', 'Nyx', 'Corvin'],
  beastmaster: ['Fang', 'Hawisa', 'Bram', 'Wolfram', 'Sefa', 'Ryk'],
  engineer: ['Cog', 'Bodwin', 'Tilda', 'Gears', 'Hob', 'Winnow'],
  alchemist: ['Fume', 'Aurelius', 'Sere', 'Nyssa', 'Balthus', 'Elix'],
  porter: ['Hodor', 'Marta', 'Grum', 'Pila', 'Osip', 'Danka'],
  scout: ['Keen', 'Sila', 'Verick', 'Nep', 'Farah', 'Ost'],
  curseBreaker: ['Sigfrid', 'Hael', 'Unwen', 'Alaric', 'Merrit', 'Rhowen'],
  cook: ['Basil', 'Saffron', 'Dree', 'Pottage', 'Mimi', 'Gour'],
  monk: ['Ashen', 'Ilva', 'Tenzin', 'Brother Odo', 'Kelsang', 'Yani'],
  gambler: ['Ace', 'Pip', 'Fortuna', 'Deuce', 'Rook', 'Chance'],
};
