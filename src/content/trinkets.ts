import { elementInfo } from '@/content/elements';
import { ELEMENTS, type Element } from '@/game/elements';
import type { GearDef, StatKey } from '@/game/types';

/** Each element's amulet icon. */
const AMULET_ICONS: Record<Element, GearDef['icon']> = {
  fire: require('../../assets/icons/rpg/amulet-copper-pendant.png'),
  grass: require('../../assets/icons/rpg/amulet-triple-gem.png'),
  stone: require('../../assets/icons/relics/amulet-amethyst-drop.png'),
  electric: require('../../assets/icons/relics/amulet-crescent-gold.png'),
  water: require('../../assets/icons/relics/amulet-blue-gem.png'),
};

export const trinketRules = {
  /** Crit, Speed and Evasion trinkets: base × this by tier (≈ √ of the enemy strength curve). */
  extraBudget: [1, 1.4, 1.7, 2, 2.4],
  /** Elemental amulets: base × the enemy strength curve by tier. */
  resistanceBudget: [1, 1.9, 3, 4.2, 5.6],
  /** Ring of fortune Luck by tier; it only drops Legendary, so quality doesn't scale it. */
  luckByTier: [2, 2, 3, 3, 4],
  /** Kind weights in a trinket drop; the ring only joins the pool on a Legendary roll. */
  weights: { stat: 3, amulet: 3, fortune: 4 },
};

/** A trinket kind's drop group; amulets of the five elements share one entry. */
export type TrinketGroup = 'stat' | 'amulet' | 'fortune';

type TrinketKind = {
  kind: string;
  name: string;
  emoji: string;
  icon: GearDef['icon'];
  group: TrinketGroup;
} & (
  | { group: 'stat'; stat: StatKey; base: number }
  | { group: 'amulet'; element: Element; base: number }
  | { group: 'fortune' }
);

/** One kind of trinket; the bases are Normal-quality values at tier 1. */
export const trinketKinds: TrinketKind[] = [
  { kind: 'hawkEyeRing', name: 'Hawk-eye ring', emoji: '💍', icon: require('../../assets/icons/rpg/ring-gold-sapphire.png'), group: 'stat', stat: 'crit', base: 4 },
  { kind: 'quicksilverAnklet', name: 'Quicksilver anklet', emoji: '🦶', icon: require('../../assets/icons/rpg/ring-steel-band.png'), group: 'stat', stat: 'speed', base: 1 },
  { kind: 'shadowPin', name: 'Shadow pin', emoji: '📌', icon: require('../../assets/icons/rpg/amulet-silver-fang.png'), group: 'stat', stat: 'evasion', base: 3 },
  ...ELEMENTS.map((element): TrinketKind => ({
    kind: `${element}Amulet`,
    name: `${elementInfo[element].name} amulet`,
    emoji: '📿',
    icon: AMULET_ICONS[element],
    group: 'amulet',
    element,
    base: 4,
  })),
  { kind: 'ringOfFortune', name: 'Ring of fortune', emoji: '🍀', icon: require('../../assets/icons/magic/ring-gold-emerald.png'), group: 'fortune' },
];

export const trinketId = (kind: string, tier: number) => `${kind}${tier}`;

/** One trinket per kind and tier (9 kinds × 5 tiers), stats at Normal quality, unrounded. */
export const trinkets: GearDef[] = trinketKinds.flatMap((kind) =>
  [1, 2, 3, 4, 5].map((tier): GearDef => ({
    id: trinketId(kind.kind, tier),
    name: kind.name,
    emoji: kind.emoji,
    icon: kind.icon,
    slot: 'trinket',
    keywords: [],
    tier,
    ...(kind.group === 'stat'
      ? { stats: { [kind.stat]: kind.base * trinketRules.extraBudget[tier - 1] } }
      : kind.group === 'amulet'
        ? { stats: {}, elementResist: { element: kind.element, amount: kind.base * trinketRules.resistanceBudget[tier - 1] } }
        : { stats: { luck: trinketRules.luckByTier[tier - 1] } }),
  })),
);
