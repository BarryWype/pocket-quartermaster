// The 9 valuables of doc/design/loot/valuables.csv. Sold at full price at the
// market; gems are also ingredients. Value rises with the source's tier.

import type { ImageSourcePropType } from 'react-native';

import type { PlaceKind } from '@/content/places';

/** Where a valuable sells: a place, or the travelling trader. */
export type ValuableBuyer = PlaceKind | 'trader';

export type ValuableRarity = 'common' | 'uncommon' | 'rare';

export type ValuableDef = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
  rarity: ValuableRarity;
  basePrice: number;
  uses?: string;
};

export const VALUABLE_BASE_PRICES: Record<ValuableRarity, number> = { common: 5, uncommon: 12, rare: 30 };

export const valuables: ValuableDef[] = [
  { id: 'oldCoins', name: 'Old coins', emoji: '🪙', icon: require('../../../assets/icons/relics/pouch-coins.png'), rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'silverRing', name: 'Silver ring', emoji: '💍', icon: require('../../../assets/icons/rpg/ring-silver-band.png'), rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'silverware', name: 'Silverware', emoji: '🍴', rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common },
  { id: 'roughGem', name: 'Rough gem', emoji: '💎', icon: require('../../../assets/icons/rpg/gem-slate.png'), rarity: 'common', basePrice: VALUABLE_BASE_PRICES.common, uses: 'Prism charm, relic restoring' },
  { id: 'goldChain', name: 'Gold chain', emoji: '⛓️', icon: require('../../../assets/icons/rpg/amulet-gold-torc.png'), rarity: 'uncommon', basePrice: VALUABLE_BASE_PRICES.uncommon },
  { id: 'silverChalice', name: 'Silver chalice', emoji: '🏆', rarity: 'uncommon', basePrice: VALUABLE_BASE_PRICES.uncommon },
  { id: 'jadeIdol', name: 'Jade idol', emoji: '🗿', icon: require('../../../assets/icons/relics/totem-green.png'), rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare },
  { id: 'painting', name: 'Painting', emoji: '🖼️', rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare },
  { id: 'cutGem', name: 'Cut gem', emoji: '💠', icon: require('../../../assets/icons/rpg/gem-cyan-brilliant.png'), rarity: 'rare', basePrice: VALUABLE_BASE_PRICES.rare, uses: 'Architect’s seal, relic restoring' },
];
