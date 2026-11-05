// The gear rework's shared rules (doc/design/gear/README.md): rarity replaces
// quality, affixes replace component effects, stats roll on the forge's dice.

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** The EN rarity names for display; translated through frNames. */
export const rarityNames: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export const gearRules = {
  /** Each scaling stat is base × a factor in this range, mapped from the dice total. */
  statRange: { min: 0.8, max: 1.38 },
  dice: { count: 3, sides: 6 },
  /** Added to the dice total (clamped to the max) by rarity. */
  rarityShift: { common: 0, uncommon: 0, rare: 1, legendary: 2 } satisfies Record<Rarity, number>,
  affixCount: { common: 0, uncommon: 1, rare: 2, legendary: 3 } satisfies Record<Rarity, number>,
  /** Relative weight of a keyword (component) affix in a random roll; other affixes weigh 1. */
  keywordAffixWeight: 0.15,
  /** Reroll: the piece's tier material (tierMaterials) and gold, both × growth^rerolls. */
  reroll: { material: 3, goldPerTier: 25, growth: 1.5 },
  /** Rarity colours (the old quality colours). */
  colors: { common: '#3b2a1a', uncommon: '#3f8f3a', rare: '#2f6fd6', legendary: '#c99a1a' } satisfies Record<Rarity, string>,
};
