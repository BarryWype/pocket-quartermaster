import { elementInfo } from '@/content/elements';
import { ELEMENTS, type Element } from '@/game/elements';
import type { Approach, GearDef, StatKey } from '@/game/types';

export const trinketRules = {
  /** Crit, Speed and Evasion trinkets: base × this by tier (≈ √ of the enemy strength curve). */
  extraBudget: [1, 1.4, 1.7, 2, 2.4],
  /** Elemental amulets: base × the enemy strength curve by tier. */
  resistanceBudget: [1, 1.9, 3, 4.2, 5.6],
  /** Ring of fortune Luck by tier; it only drops Legendary, so quality doesn't scale it. */
  luckByTier: [2, 2, 3, 3, 4],
  /** Kind weights in a trinket drop; the ring only joins the pool on a Legendary roll. */
  weights: { stat: 3, amulet: 3, talisman: 0.5, fortune: 4 },
};

/** A trinket kind's drop group; amulets of the five elements share one entry. */
export type TrinketGroup = 'stat' | 'amulet' | 'talisman' | 'fortune';

type TrinketKind = {
  kind: string;
  name: string;
  emoji: string;
  group: TrinketGroup;
} & (
  | { group: 'stat'; stat: StatKey; base: number }
  | { group: 'amulet'; element: Element; base: number }
  | { group: 'talisman'; approach: Approach }
  | { group: 'fortune' }
);

/** One kind of trinket; the bases are Normal-quality values at tier 1. */
export const trinketKinds: TrinketKind[] = [
  { kind: 'hawkEyeRing', name: 'Hawk-eye ring', emoji: '💍', group: 'stat', stat: 'crit', base: 4 },
  { kind: 'quicksilverAnklet', name: 'Quicksilver anklet', emoji: '🦶', group: 'stat', stat: 'speed', base: 1 },
  { kind: 'shadowPin', name: 'Shadow pin', emoji: '📌', group: 'stat', stat: 'evasion', base: 3 },
  ...ELEMENTS.map((element): TrinketKind => ({
    kind: `${element}Amulet`,
    name: `${elementInfo[element].name} amulet`,
    emoji: '📿',
    group: 'amulet',
    element,
    base: 4,
  })),
  { kind: 'oxTalisman', name: 'Ox talisman', emoji: '🪬', group: 'talisman', approach: 'might' },
  { kind: 'foxTalisman', name: 'Fox talisman', emoji: '🪬', group: 'talisman', approach: 'finesse' },
  { kind: 'owlTalisman', name: 'Owl talisman', emoji: '🪬', group: 'talisman', approach: 'wits' },
  { kind: 'doveTalisman', name: 'Dove talisman', emoji: '🪬', group: 'talisman', approach: 'faith' },
  { kind: 'lionTalisman', name: 'Lion talisman', emoji: '🪬', group: 'talisman', approach: 'presence' },
  { kind: 'ringOfFortune', name: 'Ring of fortune', emoji: '🍀', group: 'fortune' },
];

export const trinketId = (kind: string, tier: number) => `${kind}${tier}`;

/** One trinket per kind and tier (14 kinds × 5 tiers), stats at Normal quality, unrounded. */
export const trinkets: GearDef[] = trinketKinds.flatMap((kind) =>
  [1, 2, 3, 4, 5].map((tier): GearDef => ({
    id: trinketId(kind.kind, tier),
    name: kind.name,
    emoji: kind.emoji,
    slot: 'trinket',
    keywords: [],
    tier,
    ...(kind.group === 'stat'
      ? { stats: { [kind.stat]: kind.base * trinketRules.extraBudget[tier - 1] } }
      : kind.group === 'amulet'
        ? { stats: {}, elementResist: { element: kind.element, amount: kind.base * trinketRules.resistanceBudget[tier - 1] } }
        : kind.group === 'talisman'
          ? { stats: {}, approach: kind.approach }
          : { stats: { luck: trinketRules.luckByTier[tier - 1] } }),
  })),
);
