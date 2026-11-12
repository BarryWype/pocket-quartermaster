import type { ClassRarity, HeroClassId } from '@/game/types';

export const rosterRules = {
  /** Heroes per expedition. */
  partySize: 3,
  /** Heroes the player can have at once, before any tier boss falls. */
  startCap: 6,
  /** Each of these tiers' bosses, once beaten, adds `perBoss` to the cap (8, 10, 12, 14); Guild Hall ranks come on top. */
  perBoss: 2,
  bossTiers: [1, 2, 3, 4] as number[],
  /** A hero more than this many levels under the roster's top earns `catchUpXp` × the XP. */
  catchUpGap: 2,
  catchUpXp: 1.5,
  /**
   * A dismissed hero leaves a training manual sized to their level: the
   * rarity of the last band whose `minLevel` they reach.
   */
  retireManual: [
    { minLevel: 1, rarity: 'common' },
    { minLevel: 6, rarity: 'rare' },
    { minLevel: 11, rarity: 'legendary' },
  ] as { minLevel: number; rarity: 'common' | 'rare' | 'legendary' }[],
};

/** Recruits offered at taverns. Price = base × level factor × roster factor × trait factor. */
export const recruitRules = {
  offersPerTavern: 4,
  /**
   * Each class's offer weight by rarity. Common and uncommon weigh the same so
   * every class of the pool shows up about once a week at a single tavern
   * (rarity sets the price); rare classes come from secret places only.
   */
  rarityWeights: { common: 1, uncommon: 1, rare: 0 } satisfies Record<ClassRarity, number>,
  /** A class that just joined the pool is easier to find during its tier. */
  newClassWeight: 1.5,
  /** A class the roster already has is this much less likely to be offered. */
  ownedClassWeight: 0.3,
  /** Days in a "Wanted this week" rotation: one family is in town, and every tavern's first offer is of its classes. */
  wantedDays: 7,
  /** A tier boss's first clear offers one free recruit among `choices` classes of the `poolTier` pool, from families the roster lacks. */
  freePick: { afterBossTier: 1, poolTier: 2, choices: 3 },
  /** Chance an offer has a positive trait rather than a negative one. */
  positiveTraitChance: 0.6,
  /** The lowest level recruits join at, by highest unlocked tier: the bottom of the tier's band. Above it, one level under the roster's median. */
  levelByTier: [1, 4, 7, 10, 13] as number[],
  price: {
    /** Higher than the old 80/180: the forge fee's removal left more gold for recruits. */
    base: { common: 100, uncommon: 220, rare: 600 } satisfies Record<ClassRarity, number>,
    /** +25% per level above 1. */
    perLevel: 0.25,
    /** The roster factor counts heroes beyond this many. */
    freeHeroes: 6,
    /** +15% per hero beyond `freeHeroes`: a company of 12 is meant to be affordable, not a save-up. */
    perExtraHero: 0.15,
    trait: { positive: 1.15, negative: 0.75 },
    /** × this per tier above 1 (highest unlocked tier), so recruits keep pace with income. */
    perTier: 1.5,
  },
  /**
   * The recruit roll (see game/taverns/roll.ts): 3d6 sums per stat, graded by
   * the 16 sums' total that scales the price.
   */
  roll: {
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
