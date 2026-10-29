/** Supply, meals and charms. Items are in `items.ts`, recipes in `recipes.ts`. */
export const provisionRules = {
  /** Each hero needs this many supply points per started hour of the expedition. */
  pointsPerHeroHour: 1,
  /** Damage multiplier for the whole run, and share of max HP lost at the start. */
  hunger: {
    underfed: { damage: 0.9, hpLoss: 0 },
    starving: { damage: 0.8, hpLoss: 0.15 },
  },
  /** Taverns sell this item in an emergency: gold per supply point, × perTier per tier above 1. */
  emergency: { itemId: 'jerky', pricePerPoint: 4, perTier: 2 },
  /** A new save's stock: enough for about five short runs. */
  startingStock: { trailMix: 8 } as Record<string, number>,
  /** The cooking tip shows once held supply drops below this. */
  lowStockPoints: 6,
  meals: { stewHeal: 0.15, porridgeXp: 1.15, pieGold: 1.15, quickBitesDuration: 0.9, brothRetreat: 0.25, roastHp: 1.1, honeyOpportunity: 1.25, skewersSpeed: 1, risottoResistance: 1.1, troutCrit: 10, chowderCut: 0.5 },
  charms: { rabbitsFoot: 0.05, luckyTooth: 1.05 },
  /** Hero consumables (elixirs, bombs, oils): one per hero, for one run. */
  elixirs: { power: 1.15, magic: 1.15, armour: 1.2, resistance: 1.2, quicksilverSpeed: 2, firebombDamage: 4, smokeBombRetreat: 0.25, reviveHp: 0.3 },
};
