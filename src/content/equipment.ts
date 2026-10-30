import type { DamageStat, GearType, HeroClassId, Keyword, MaterialStack, WeaponType, ArmourType } from '@/game/types';

// Equipment content: profiles, budget rules, names and recipes from the
// design catalogue (doc/design/threats/). Stats are derived in
// src/game/equipment/budget.ts, exactly as tools/gear-budget.py does.

/** One gear type: its slot, damage stat, hands, flat extras and keywords. */
export type GearProfile = {
  slot: 'weapon' | 'armor' | 'offhand';
  emoji: string;
  damageStat?: DamageStat;
  twoHanded?: boolean;
  /** Flat extras, as budget costs (see gearBudgetRules.cost); approach is +1 approach pip. */
  extras: { speed?: number; crit?: number; evasion?: number; approach?: number };
  keywords: Keyword[];
  heavy?: boolean;
  concealed?: boolean;
  /** Shares of the scaling budget; HP is worth hpPerPoint per point. */
  shares: Partial<Record<'power' | 'magic' | 'armour' | 'resistance' | 'hp', number>>;
};

export const GEAR_SLOTS: Record<GearType, 'weapon' | 'armor' | 'offhand'> = {
  sword: 'weapon',
  axe: 'weapon',
  mace: 'weapon',
  dagger: 'weapon',
  bow: 'weapon',
  spear: 'weapon',
  warhammer: 'weapon',
  wand: 'weapon',
  staff: 'weapon',
  lute: 'weapon',
  censer: 'weapon',
  knuckles: 'weapon',
  plate: 'armor',
  mail: 'armor',
  leather: 'armor',
  robes: 'armor',
  shield: 'offhand',
  buckler: 'offhand',
  offhandBlade: 'offhand',
  quiver: 'offhand',
  tome: 'offhand',
  focus: 'offhand',
};

export const gearProfiles: Record<GearType, GearProfile> = {
  sword: { slot: 'weapon', emoji: '🗡️', damageStat: 'power', extras: { crit: 5 }, keywords: ['parry'], shares: { power: 1 } },
  axe: { slot: 'weapon', emoji: '🪓', damageStat: 'power', extras: { speed: -1 }, keywords: ['cleave'], shares: { power: 1 } },
  mace: { slot: 'weapon', emoji: '🔨', damageStat: 'power', extras: { speed: -1 }, keywords: ['blessed', 'stagger'], shares: { power: 1 } },
  dagger: { slot: 'weapon', emoji: '🔪', damageStat: 'power', extras: { speed: 2, crit: 10 }, keywords: ['pierce'], concealed: true, shares: { power: 1 } },
  bow: { slot: 'weapon', emoji: '🏹', damageStat: 'power', extras: {}, keywords: ['pierce', 'reach'], shares: { power: 1 } },
  spear: { slot: 'weapon', emoji: '🔱', damageStat: 'power', extras: {}, keywords: ['reach', 'brace'], shares: { power: 1 } },
  warhammer: { slot: 'weapon', emoji: '⚒️', damageStat: 'power', twoHanded: true, extras: { speed: -2 }, keywords: ['pierce', 'stagger'], heavy: true, shares: { power: 1 } },
  wand: { slot: 'weapon', emoji: '🪄', damageStat: 'magic', extras: { speed: 1 }, keywords: ['channel'], concealed: true, shares: { magic: 1 } },
  staff: { slot: 'weapon', emoji: '🦯', damageStat: 'magic', twoHanded: true, extras: {}, keywords: ['cleave'], shares: { magic: 1 } },
  lute: { slot: 'weapon', emoji: '🪕', damageStat: 'magic', extras: { approach: 1 }, keywords: ['inspire'], concealed: true, shares: { magic: 1 } },
  censer: { slot: 'weapon', emoji: '🪔', damageStat: 'magic', extras: {}, keywords: ['blessed', 'mend'], shares: { magic: 1 } },
  knuckles: { slot: 'weapon', emoji: '🥊', damageStat: 'power', extras: { speed: 1 }, keywords: ['stagger'], concealed: true, shares: { power: 1 } },
  plate: { slot: 'armor', emoji: '🛡️', extras: { speed: -2 }, keywords: ['guard'], heavy: true, shares: { armour: 0.75, hp: 0.2, resistance: 0.05 } },
  mail: { slot: 'armor', emoji: '🦺', extras: {}, keywords: ['brace'], shares: { armour: 0.5, resistance: 0.3, hp: 0.2 } },
  leather: { slot: 'armor', emoji: '🧥', extras: { speed: 1, evasion: 8 }, keywords: [], shares: { armour: 0.45, hp: 0.4, resistance: 0.15 } },
  robes: { slot: 'armor', emoji: '👘', extras: {}, keywords: [], shares: { magic: 0.2, resistance: 0.65, hp: 0.15 } },
  shield: { slot: 'offhand', emoji: '🛡️', extras: { speed: -1 }, keywords: ['guard'], shares: { armour: 0.75, hp: 0.25 } },
  buckler: { slot: 'offhand', emoji: '🔔', extras: { evasion: 6 }, keywords: ['parry'], shares: { armour: 1 } },
  offhandBlade: { slot: 'offhand', emoji: '🤺', damageStat: 'power', extras: { crit: 5 }, keywords: [], concealed: true, shares: { power: 1 } },
  quiver: { slot: 'offhand', emoji: '🎯', damageStat: 'power', extras: {}, keywords: ['reach'], shares: { power: 1 } },
  tome: { slot: 'offhand', emoji: '📖', damageStat: 'magic', extras: { approach: 1 }, keywords: [], shares: { magic: 1 } },
  focus: { slot: 'offhand', emoji: '🔮', damageStat: 'magic', extras: {}, keywords: ['channel'], shares: { magic: 0.7, resistance: 0.3 } },
};

/** Every constant of tools/gear-budget.py, for the budget maths in game/equipment/budget.ts. */
export const gearBudgetRules = {
  /** Enemy strength per tier; the budget scales with it. */
  tierScale: [1, 1.9, 3, 4.2, 5.6],
  /** Budget points at tier 1. 1 point = 1 Power = 1 Magic = 1 Armour = 1 Resistance = 10 HP. */
  budget: { weapon: 5, armour: 6, offhand: 3 },
  /** Share of the off-hand budget a two-handed weapon absorbs. */
  twoHandedBonus: 0.9,
  hpPerPoint: 10,
  /** Cost of non-scaling extras, as a share of the item's budget. */
  cost: {
    speed: 0.09,
    crit: 0.015,
    evasion: 0.05,
    major: 0.1,
    minor: 0.05,
    approach: 0.1,
    heavy: -0.1,
    concealed: 0.03,
  },
  /** Keywords that cost the major share instead of the minor one. */
  major: ['pierce', 'cleave', 'blessed', 'guard'] as Keyword[],
  /** Evasion items gain +1% Evasion per tier above the first. */
  evasionPerTier: 1,
};

export const TIER_NAMES = ['Wood, bone', 'Stone', 'Copper', 'Iron', 'Steel'];

/** Names from item-names.csv, per type and tier (1–5). */
export const gearNames: Record<GearType, [string, string, string, string, string]> = {
  sword: ['Wooden sword', 'Flint sword', 'Copper sword', 'Iron sword', 'Steel sword'],
  axe: ['Bone axe', 'Flint axe', 'Copper axe', 'Iron axe', 'Steel axe'],
  mace: ['Wooden mace', 'Stone mace', 'Copper mace', 'Iron mace', 'Steel mace'],
  dagger: ['Bone dagger', 'Flint dagger', 'Copper dagger', 'Iron dagger', 'Steel dagger'],
  bow: ['Wooden bow', 'Flint-tipped bow', 'Copper-banded bow', 'Iron-banded bow', 'Steel-banded bow'],
  spear: ['Wooden spear', 'Flint spear', 'Copper spear', 'Iron spear', 'Steel spear'],
  warhammer: ['Hardwood warhammer', 'Stone warhammer', 'Copper warhammer', 'Iron warhammer', 'Steel warhammer'],
  wand: ['Wooden wand', 'Stone wand', 'Copper wand', 'Iron wand', 'Steel wand'],
  staff: ['Wooden staff', 'Stone-tipped staff', 'Copper-shod staff', 'Iron-shod staff', 'Steel-shod staff'],
  lute: ['Wooden lute', 'Stone-inlaid lute', 'Copper-strung lute', 'Iron-strung lute', 'Steel-strung lute'],
  censer: ['Bone censer', 'Stone censer', 'Copper censer', 'Iron censer', 'Steel censer'],
  knuckles: ['Bone knuckles', 'Stone knuckles', 'Copper knuckles', 'Iron knuckles', 'Steel knuckles'],
  plate: ['Hardwood plate', 'Slate plate', 'Copper plate', 'Iron plate', 'Steel plate'],
  mail: ['Bone mail', 'Stone-scale mail', 'Copper mail', 'Iron mail', 'Steel mail'],
  leather: ['Hide armour', 'Stone-studded leather', 'Copper-studded leather', 'Iron-studded leather', 'Steel-studded leather'],
  robes: ['Linen robes', 'Stone-beaded robes', 'Copper-threaded robes', 'Iron-threaded robes', 'Steel-threaded robes'],
  shield: ['Wooden shield', 'Stone-rimmed shield', 'Copper shield', 'Iron shield', 'Steel shield'],
  buckler: ['Wooden buckler', 'Stone buckler', 'Copper buckler', 'Iron buckler', 'Steel buckler'],
  offhandBlade: ['Bone parrying dagger', 'Flint parrying dagger', 'Copper parrying dagger', 'Iron parrying dagger', 'Steel parrying dagger'],
  quiver: ['Hide quiver', 'Flint-arrow quiver', 'Copper-arrow quiver', 'Iron-arrow quiver', 'Steel-arrow quiver'],
  tome: ['Bark tome', 'Stone-clasped tome', 'Copper-clasped tome', 'Iron-clasped tome', 'Steel-clasped tome'],
  focus: ['Bone focus', 'Stone focus', 'Copper focus', 'Iron focus', 'Steel focus'],
};

/** Inputs from equipment-recipes.csv, per type and tier (1–5). */
export const gearRecipes: Record<GearType, [MaterialStack[], MaterialStack[], MaterialStack[], MaterialStack[], MaterialStack[]]> = {
  sword: [
    [{ materialId: 'wood', amount: 4 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'stone', amount: 3 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'copper', amount: 3 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'iron', amount: 3 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'steel', amount: 3 }],
  ],
  axe: [
    [{ materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'steel', amount: 2 }],
  ],
  mace: [
    [{ materialId: 'wood', amount: 3 }, { materialId: 'bone', amount: 1 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'stone', amount: 3 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'copper', amount: 3 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'iron', amount: 3 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'steel', amount: 3 }],
  ],
  dagger: [
    [{ materialId: 'bone', amount: 3 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  bow: [
    [{ materialId: 'wood', amount: 3 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  spear: [
    [{ materialId: 'wood', amount: 4 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'steel', amount: 2 }],
  ],
  warhammer: [
    [{ materialId: 'wood', amount: 6 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'stone', amount: 4 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'copper', amount: 4 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'iron', amount: 4 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'steel', amount: 4 }],
  ],
  wand: [
    [{ materialId: 'wood', amount: 3 }, { materialId: 'bone', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  staff: [
    [{ materialId: 'wood', amount: 5 }, { materialId: 'herb', amount: 1 }],
    [{ materialId: 'wood', amount: 4 }, { materialId: 'herb', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'wood', amount: 4 }, { materialId: 'herb', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'wood', amount: 4 }, { materialId: 'herb', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'wood', amount: 4 }, { materialId: 'herb', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  lute: [
    [{ materialId: 'wood', amount: 3 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  censer: [
    [{ materialId: 'bone', amount: 3 }, { materialId: 'herb', amount: 1 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'herb', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'herb', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'herb', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'herb', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  knuckles: [
    [{ materialId: 'bone', amount: 2 }, { materialId: 'hide', amount: 2 }],
    [{ materialId: 'hide', amount: 2 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'hide', amount: 2 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'hide', amount: 2 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'hide', amount: 2 }, { materialId: 'steel', amount: 2 }],
  ],
  plate: [
    [{ materialId: 'wood', amount: 5 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 5 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 5 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 5 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 5 }],
  ],
  mail: [
    [{ materialId: 'bone', amount: 4 }, { materialId: 'hide', amount: 2 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 4 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 4 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 4 }],
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 4 }],
  ],
  leather: [
    [{ materialId: 'bone', amount: 1 }, { materialId: 'hide', amount: 5 }],
    [{ materialId: 'hide', amount: 4 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'hide', amount: 4 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'hide', amount: 4 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'hide', amount: 4 }, { materialId: 'steel', amount: 2 }],
  ],
  robes: [
    [{ materialId: 'herb', amount: 4 }, { materialId: 'berries', amount: 2 }],
    [{ materialId: 'herb', amount: 4 }, { materialId: 'berries', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'herb', amount: 4 }, { materialId: 'berries', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'herb', amount: 4 }, { materialId: 'berries', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'herb', amount: 4 }, { materialId: 'berries', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  shield: [
    [{ materialId: 'wood', amount: 3 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'wood', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  buckler: [
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  offhandBlade: [
    [{ materialId: 'bone', amount: 2 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  quiver: [
    [{ materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
  tome: [
    [{ materialId: 'wood', amount: 1 }, { materialId: 'hide', amount: 1 }, { materialId: 'berries', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'berries', amount: 1 }, { materialId: 'stone', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'berries', amount: 1 }, { materialId: 'copper', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'berries', amount: 1 }, { materialId: 'iron', amount: 1 }],
    [{ materialId: 'hide', amount: 1 }, { materialId: 'berries', amount: 1 }, { materialId: 'steel', amount: 1 }],
  ],
  focus: [
    [{ materialId: 'bone', amount: 2 }, { materialId: 'mushroom', amount: 1 }],
    [{ materialId: 'mushroom', amount: 1 }, { materialId: 'stone', amount: 2 }],
    [{ materialId: 'mushroom', amount: 1 }, { materialId: 'copper', amount: 2 }],
    [{ materialId: 'mushroom', amount: 1 }, { materialId: 'iron', amount: 2 }],
    [{ materialId: 'mushroom', amount: 1 }, { materialId: 'steel', amount: 2 }],
  ],
};

export type Affinity = 'favoured' | 'usable' | 'unfit';

/** Favoured, usable or unfit per class, for weapon and armour types (affinities.csv). */
export const classAffinities: Record<HeroClassId, Record<WeaponType | ArmourType, Affinity>> = {
  warrior: { sword: 'favoured', axe: 'favoured', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'favoured', warhammer: 'usable', wand: 'unfit', staff: 'unfit', lute: 'unfit', censer: 'usable', knuckles: 'usable', plate: 'favoured', mail: 'favoured', leather: 'usable', robes: 'unfit' },
  barbarian: { sword: 'usable', axe: 'favoured', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'usable', warhammer: 'favoured', wand: 'unfit', staff: 'usable', lute: 'unfit', censer: 'unfit', knuckles: 'favoured', plate: 'usable', mail: 'favoured', leather: 'favoured', robes: 'unfit' },
  paladin: { sword: 'favoured', axe: 'usable', mace: 'favoured', dagger: 'unfit', bow: 'unfit', spear: 'usable', warhammer: 'favoured', wand: 'unfit', staff: 'usable', lute: 'usable', censer: 'usable', knuckles: 'usable', plate: 'favoured', mail: 'favoured', leather: 'usable', robes: 'unfit' },
  ranger: { sword: 'usable', axe: 'usable', mace: 'unfit', dagger: 'favoured', bow: 'favoured', spear: 'favoured', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'usable', censer: 'unfit', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  thief: { sword: 'favoured', axe: 'usable', mace: 'unfit', dagger: 'favoured', bow: 'usable', spear: 'usable', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'usable', censer: 'unfit', knuckles: 'favoured', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  fireMage: { sword: 'usable', axe: 'unfit', mace: 'unfit', dagger: 'usable', bow: 'usable', spear: 'usable', warhammer: 'unfit', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'usable', knuckles: 'usable', plate: 'unfit', mail: 'usable', leather: 'usable', robes: 'favoured' },
  frostMage: { sword: 'usable', axe: 'unfit', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'usable', warhammer: 'unfit', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'usable', knuckles: 'unfit', plate: 'unfit', mail: 'favoured', leather: 'usable', robes: 'favoured' },
  sorcerer: { sword: 'usable', axe: 'usable', mace: 'unfit', dagger: 'usable', bow: 'usable', spear: 'unfit', warhammer: 'unfit', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'usable', knuckles: 'usable', plate: 'unfit', mail: 'usable', leather: 'usable', robes: 'favoured' },
  cleric: { sword: 'usable', axe: 'usable', mace: 'usable', dagger: 'unfit', bow: 'unfit', spear: 'usable', warhammer: 'usable', wand: 'usable', staff: 'favoured', lute: 'usable', censer: 'favoured', knuckles: 'unfit', plate: 'usable', mail: 'favoured', leather: 'usable', robes: 'usable' },
  druid: { sword: 'unfit', axe: 'unfit', mace: 'usable', dagger: 'unfit', bow: 'usable', spear: 'usable', warhammer: 'usable', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'usable', knuckles: 'usable', plate: 'unfit', mail: 'usable', leather: 'favoured', robes: 'favoured' },
  troubadour: { sword: 'usable', axe: 'unfit', mace: 'unfit', dagger: 'usable', bow: 'usable', spear: 'unfit', warhammer: 'usable', wand: 'favoured', staff: 'usable', lute: 'favoured', censer: 'usable', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  scholar: { sword: 'usable', axe: 'unfit', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'usable', warhammer: 'unfit', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'usable', knuckles: 'unfit', plate: 'unfit', mail: 'unfit', leather: 'usable', robes: 'favoured' },
  exorcist: { sword: 'usable', axe: 'usable', mace: 'favoured', dagger: 'unfit', bow: 'unfit', spear: 'usable', warhammer: 'favoured', wand: 'usable', staff: 'usable', lute: 'unfit', censer: 'usable', knuckles: 'usable', plate: 'usable', mail: 'favoured', leather: 'usable', robes: 'usable' },
  duelist: { sword: 'favoured', axe: 'usable', mace: 'usable', dagger: 'favoured', bow: 'usable', spear: 'favoured', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'usable', censer: 'unfit', knuckles: 'unfit', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  smuggler: { sword: 'usable', axe: 'usable', mace: 'unfit', dagger: 'favoured', bow: 'favoured', spear: 'usable', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'usable', censer: 'unfit', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  diplomat: { sword: 'usable', axe: 'unfit', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'usable', warhammer: 'unfit', wand: 'favoured', staff: 'usable', lute: 'favoured', censer: 'usable', knuckles: 'unfit', plate: 'unfit', mail: 'usable', leather: 'favoured', robes: 'favoured' },
  necromancer: { sword: 'unfit', axe: 'usable', mace: 'unfit', dagger: 'usable', bow: 'usable', spear: 'unfit', warhammer: 'usable', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'favoured', knuckles: 'usable', plate: 'unfit', mail: 'usable', leather: 'usable', robes: 'favoured' },
  beastmaster: { sword: 'usable', axe: 'favoured', mace: 'usable', dagger: 'usable', bow: 'favoured', spear: 'favoured', warhammer: 'usable', wand: 'unfit', staff: 'usable', lute: 'unfit', censer: 'unfit', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'unfit' },
  engineer: { sword: 'usable', axe: 'favoured', mace: 'usable', dagger: 'usable', bow: 'favoured', spear: 'usable', warhammer: 'favoured', wand: 'unfit', staff: 'usable', lute: 'unfit', censer: 'unfit', knuckles: 'usable', plate: 'favoured', mail: 'favoured', leather: 'usable', robes: 'unfit' },
  alchemist: { sword: 'usable', axe: 'unfit', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'unfit', warhammer: 'unfit', wand: 'favoured', staff: 'usable', lute: 'usable', censer: 'favoured', knuckles: 'usable', plate: 'unfit', mail: 'usable', leather: 'favoured', robes: 'favoured' },
  porter: { sword: 'usable', axe: 'favoured', mace: 'usable', dagger: 'usable', bow: 'usable', spear: 'favoured', warhammer: 'favoured', wand: 'unfit', staff: 'unfit', lute: 'unfit', censer: 'usable', knuckles: 'usable', plate: 'usable', mail: 'favoured', leather: 'usable', robes: 'unfit' },
  scout: { sword: 'usable', axe: 'usable', mace: 'unfit', dagger: 'favoured', bow: 'favoured', spear: 'favoured', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'usable', censer: 'unfit', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
  curseBreaker: { sword: 'usable', axe: 'usable', mace: 'usable', dagger: 'unfit', bow: 'unfit', spear: 'usable', warhammer: 'usable', wand: 'favoured', staff: 'favoured', lute: 'usable', censer: 'favoured', knuckles: 'unfit', plate: 'usable', mail: 'favoured', leather: 'usable', robes: 'favoured' },
  cook: { sword: 'usable', axe: 'favoured', mace: 'favoured', dagger: 'favoured', bow: 'usable', spear: 'usable', warhammer: 'usable', wand: 'unfit', staff: 'unfit', lute: 'unfit', censer: 'usable', knuckles: 'usable', plate: 'usable', mail: 'favoured', leather: 'favoured', robes: 'usable' },
  monk: { sword: 'unfit', axe: 'unfit', mace: 'usable', dagger: 'usable', bow: 'unfit', spear: 'favoured', warhammer: 'usable', wand: 'usable', staff: 'usable', lute: 'usable', censer: 'usable', knuckles: 'favoured', plate: 'unfit', mail: 'unfit', leather: 'favoured', robes: 'favoured' },
  gambler: { sword: 'usable', axe: 'usable', mace: 'usable', dagger: 'favoured', bow: 'usable', spear: 'unfit', warhammer: 'usable', wand: 'usable', staff: 'unfit', lute: 'favoured', censer: 'unfit', knuckles: 'usable', plate: 'usable', mail: 'usable', leather: 'favoured', robes: 'usable' },
};

/** What each affinity does to a piece's scaling stats. */
export const affinityRules: Record<Affinity, number> = { favoured: 1.2, usable: 1, unfit: 0.6 };

/** First guesses for what each gear keyword does in combat (see phase 2 plan). */
export const gearKeywordRules = {
  cleave: { splash: 0.3 },
  guard: { targetWeight: 1.5 },
  parry: { chance: 0.15 },
  stagger: { chance: 0.15 },
  brace: { above: 0.1, multiplier: 0.5 },
  channel: { advantage: 1.7 },
  inspire: { multiplier: 1.05 },
  mend: { pct: 0.05 },
  /**
   * The "strong" numbers: a keyword an item already has, given again by a
   * component, doubles its effect (Pierce and Blessed have no strong form).
   */
  strong: {
    stagger: { chance: 0.3 },
    parry: { chance: 0.3 },
    cleave: { splash: 0.6 },
    guard: { targetWeight: 2.25 },
    channel: { advantage: 2.0 },
    inspire: { multiplier: 1.1 },
    mend: { pct: 0.1 },
    /** Brace softens this many big hits of each fight instead of one. */
    brace: { hits: 2 },
    /** Reach also strikes before the enemies in round 2. */
    reach: { rounds: 2 },
  },
  /** Heavy wearers take the Underwater weakened penalty this many times over. */
  heavy: { underwaterMultiplier: 2 },
};

/** Magic lost to mail and plate, unless that armour type is favoured for the class. */
export const castingPenalty: Partial<Record<ArmourType, number>> = { mail: 0.15, plate: 0.3 };

/** Legendary forges: this chance of +1 Luck, seeded `${uid}|luck`. */
export const gearLuckRules = { chance: 0.05 };

/** The item id of a gear type and tier, e.g. `sword3` or `offhandBlade2`. */
export const gearId = (type: GearType, tier: number) => `${type}${tier}`;

/** Debug trinket: +1 Luck, +2% Crit; never crafted or dropped. */
export const testCharm = {
  id: 'testCharm',
  name: 'Test charm',
  emoji: '🧿',
  slot: 'trinket' as const,
  stats: { luck: 1, crit: 2 },
  tier: 1,
  keywords: [],
};
