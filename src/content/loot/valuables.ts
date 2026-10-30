// The 9 valuables of doc/design/loot/valuables.csv. Sold at full price at the
// market; gems are also ingredients. Value rises with the source's tier.

export type ValuableRarity = 'common' | 'uncommon' | 'rare';

export type ValuableDef = {
  id: string;
  name: string;
  emoji: string;
  rarity: ValuableRarity;
  basePrice: number;
  uses?: string;
};

export const VALUABLE_BASE_PRICES: Record<ValuableRarity, number> = { common: 5, uncommon: 12, rare: 30 };

export const valuables: ValuableDef[] = [
  { id: 'oldCoins', name: 'Old coins', emoji: '🪙', rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'silverRing', name: 'Silver ring', emoji: '💍', rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'silverware', name: 'Silverware', emoji: '🍴', rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'roughGem', name: 'Rough gem', emoji: '💎', rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common, uses: 'Prism charm, relic restoring' },
  { id: 'goldChain', name: 'Gold chain', emoji: '⛓️', rarity: 'uncommon', basePrice: VALUABLE_BASE_PRICES.uncommon },
  { id: 'silverChalice', name: 'Silver chalice', emoji: '🏆', rarity: 'uncommon', basePrice: VALUABLE_BASE_PRICES.uncommon },
  { id: 'jadeIdol', name: 'Jade idol', emoji: '🗿', rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare },
  { id: 'painting', name: 'Painting', emoji: '🖼️', rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare },
  { id: 'cutGem', name: 'Cut gem', emoji: '💠', rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare, uses: 'Architect’s seal, relic restoring' },
];
