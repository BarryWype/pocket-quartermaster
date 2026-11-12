import { elementInfo } from '@/content/elements';
import { lootConfig } from '@/content/loot/config';
import { ELEMENTS, type Element } from '@/game/elements';
import type { GearDef, StatKey } from '@/game/types';
import type { LootModifier } from '@/game/loot/types';

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
  /**
   * Kind weights in a trinket drop; the ring only joins the pool on a Legendary
   * roll. The nine loot trinkets are one weighted entry, at a low weight so one can be found.
   */
  weights: { stat: 3, amulet: 3, fortune: 4, loot: 1 },
};

/** A trinket kind's drop group; amulets of the five elements and the nine loot trinkets each share one entry. */
export type TrinketGroup = 'stat' | 'amulet' | 'fortune' | 'loot';

/** One of the nine loot trinkets: worn, it raises what the wearer's runs find. */
export type LootTrinketKind = {
  kind: string;
  name: string;
  emoji: string;
  icon: GearDef['icon'];
  description: string;
  loot: LootModifier;
  recipe: { inputs: Record<string, number>; anyShards?: number; unlockedBy: string[] };
};

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
  | (LootTrinketKind & { group: 'loot' })
);

const { chanceMultiplier, goldPercent, xpPercent, rarityChance, parts } = lootConfig.lootTrinkets;

/** A loot trinket that multiplies one category's drop chance; its recipe is known once its parts have been seen. */
const chanceLootTrinket = (
  kind: string,
  name: string,
  emoji: string,
  icon: GearDef['icon'],
  what: string,
  category: Extract<LootModifier, { kind: 'chance' }>['category'],
  inputs: Record<string, number>,
): LootTrinketKind => ({
  kind,
  name,
  emoji,
  icon,
  description: `${what} chance ×${chanceMultiplier} where it can drop.`,
  loot: { id: kind, kind: 'chance', category, multiplier: chanceMultiplier },
  recipe: { inputs, unlockedBy: Object.keys(inputs) },
});

/** The nine loot trinkets: worn in the trinket slot, they raise what the wearer's runs find. */
export const lootTrinketKinds: LootTrinketKind[] = [
  {
    kind: 'bountyToken',
    name: 'Bounty token',
    emoji: '🎖️',
    icon: require('../../assets/icons/relics/tablet-gold-cross.png'),
    description: `+${goldPercent}% gold.`,
    loot: { id: 'bountyToken', kind: 'gold', percent: goldPercent },
    recipe: { inputs: { tatteredInsignia: parts }, unlockedBy: ['tatteredInsignia'] },
  },
  {
    kind: 'quillCharm',
    name: 'Quill charm',
    emoji: '🪶',
    icon: require('../../assets/icons/magic/part-grey-feather.png'),
    description: `+${xpPercent}% XP.`,
    loot: { id: 'quillCharm', kind: 'xp', percent: xpPercent },
    recipe: { inputs: { feather: parts }, unlockedBy: ['feather'] },
  },
  {
    kind: 'tinkersLodestone',
    name: 'Tinker’s lodestone',
    emoji: '🧲',
    icon: require('../../assets/icons/relics/runestone-bronze-spiral.png'),
    description: `Gear found has a ${rarityChance * 100}% chance to be one rarity better.`,
    loot: { id: 'tinkersLodestone', kind: 'rarity', steps: 1, chance: rarityChance },
    recipe: { inputs: { cog: parts }, unlockedBy: ['cog'] },
  },
  chanceLootTrinket('scarabCharm', 'Scarab charm', '🪲', require('../../assets/icons/relics/amulet-violet-disc.png'), 'Treasure map', 'treasureMaps', { chitin: parts }),
  chanceLootTrinket('ghostLantern', 'Ghost lantern', '🪔', require('../../assets/icons/magic/elixir-blue-aura.png'), 'Key fragment', 'keyFragments', { ectoplasm: parts }),
  chanceLootTrinket('graveDustPouch', 'Grave-dust pouch', '⚱️', require('../../assets/icons/relics/pouch-purple-dust.png'), 'Relic', 'relics', { graveDust: parts }),
  {
    ...chanceLootTrinket('prismCharm', 'Prism charm', '🔷', require('../../assets/icons/rpg/gem-purple-brilliant.png'), 'Trinket', 'trinkets', { scale: 4 }),
    recipe: { inputs: { scale: 4 }, anyShards: 4, unlockedBy: ['scale'] },
  },
  chanceLootTrinket('architectsSeal', 'Architect’s seal', '📐', require('../../assets/icons/magic/scroll-sealed-red.png'), 'Blueprint', 'blueprints', { tatteredInsignia: parts }),
  chanceLootTrinket('seersCandle', 'Seer’s candle', '🕯️', require('../../assets/icons/magic/elixir-amber-sparkle.png'), 'Training manual', 'manuals', { ritualCandle: parts }),
];

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
  ...lootTrinketKinds.map((kind): TrinketKind => ({ ...kind, group: 'loot' })),
];

export const trinketId = (kind: string, tier: number) => `${kind}${tier}`;

/** One trinket per kind and tier (9 kinds × 5 tiers) and one of each loot trinket (no tiers), stats at Normal quality, unrounded. */
export const trinkets: GearDef[] = [
  ...trinketKinds
    .filter((kind) => kind.group !== 'loot')
    .flatMap((kind) =>
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
    ),
  ...lootTrinketKinds.map((kind): GearDef => ({
    id: kind.kind,
    name: kind.name,
    emoji: kind.emoji,
    icon: kind.icon,
    slot: 'trinket',
    keywords: [],
    tier: 1,
    stats: {},
    description: kind.description,
    loot: kind.loot,
  })),
];
