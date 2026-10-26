import type { GearDef, ItemDef, WeaponType } from '@/game/types';

export const MATERIAL_TIERS = [
  { id: 'wood', name: 'Wooden' },
  { id: 'stone', name: 'Stone' },
  { id: 'copper', name: 'Copper' },
  { id: 'iron', name: 'Iron' },
  { id: 'steel', name: 'Steel' },
];

/** Weapon types the newer classes use; one per material tier, with the same main stat as the other weapons. */
export const extraWeaponTypes: { type: WeaponType; suffix: string; name: string; emoji: string; stat: 'attack' | 'magic' }[] = [
  { type: 'axe', suffix: 'Axe', name: 'axe', emoji: '🪓', stat: 'attack' },
  { type: 'mace', suffix: 'Mace', name: 'mace', emoji: '🔨', stat: 'attack' },
  { type: 'dagger', suffix: 'Dagger', name: 'dagger', emoji: '🔪', stat: 'attack' },
  { type: 'staff', suffix: 'Staff', name: 'staff', emoji: '🦯', stat: 'magic' },
  { type: 'instrument', suffix: 'Lute', name: 'lute', emoji: '🪕', stat: 'magic' },
];

const WEAPON_POWER = [6, 12, 17, 24, 32];

const extraWeapons: GearDef[] = extraWeaponTypes.flatMap(({ type, suffix, name, emoji, stat }) =>
  MATERIAL_TIERS.map((material, i) => ({
    id: `${material.id}${suffix}`,
    name: `${material.name} ${name}`,
    emoji,
    slot: 'weapon' as const,
    weaponType: type,
    stats: { [stat]: WEAPON_POWER[i] },
    tier: i + 1,
  })),
);

// One gear set per material tier: wood → stone → copper → iron → steel.
export const items: ItemDef[] = [
  // Tier 1: wood
  { id: 'woodPickaxe', name: 'Wooden pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-wood.png'), slot: 'tool', toolType: 'pickaxe', tier: 1 },
  { id: 'woodSword', name: 'Wooden sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-wood.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 6 }, tier: 1 },
  { id: 'woodBow', name: 'Wooden bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-wood.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 6 }, tier: 1 },
  { id: 'woodWand', name: 'Wooden wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-wood.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 6 }, tier: 1 },
  { id: 'woodArmour', name: 'Wooden armour', emoji: '🦺', slot: 'armor', stats: { defense: 4, hp: 30 }, tier: 1 },

  // Tier 2: stone
  { id: 'stonePickaxe', name: 'Stone pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-stone.png'), slot: 'tool', toolType: 'pickaxe', tier: 2 },
  { id: 'stoneSword', name: 'Stone sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-stone.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 12 }, tier: 2 },
  { id: 'stoneBow', name: 'Stone bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-stone.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 12 }, tier: 2 },
  { id: 'stoneWand', name: 'Stone wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-stone.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 12 }, tier: 2 },
  { id: 'stoneArmour', name: 'Stone armour', emoji: '🦺', slot: 'armor', stats: { defense: 8, hp: 55 }, tier: 2 },

  // Tier 3: copper
  { id: 'copperPickaxe', name: 'Copper pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-copper.png'), slot: 'tool', toolType: 'pickaxe', tier: 3 },
  { id: 'copperSword', name: 'Copper sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-copper.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 17 }, tier: 3 },
  { id: 'copperBow', name: 'Copper bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-copper.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 17 }, tier: 3 },
  { id: 'copperWand', name: 'Copper wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-copper.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 17 }, tier: 3 },
  { id: 'copperArmour', name: 'Copper armour', emoji: '🦺', slot: 'armor', stats: { defense: 11, hp: 85 }, tier: 3 },

  // Tier 4: iron
  { id: 'ironPickaxe', name: 'Iron pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-iron.png'), slot: 'tool', toolType: 'pickaxe', tier: 4 },
  { id: 'ironSword', name: 'Iron sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-iron.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 24 }, tier: 4 },
  { id: 'ironBow', name: 'Iron bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-iron.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 24 }, tier: 4 },
  { id: 'ironWand', name: 'Iron wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-iron.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 24 }, tier: 4 },
  { id: 'ironArmour', name: 'Iron armour', emoji: '🦺', slot: 'armor', stats: { defense: 16, hp: 120 }, tier: 4 },

  // Tier 5: steel
  { id: 'steelPickaxe', name: 'Steel pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-steel.png'), slot: 'tool', toolType: 'pickaxe', tier: 5 },
  { id: 'steelSword', name: 'Steel sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-steel.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 32 }, tier: 5 },
  { id: 'steelBow', name: 'Steel bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-steel.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 32 }, tier: 5 },
  { id: 'steelWand', name: 'Steel wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-steel.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 32 }, tier: 5 },
  { id: 'steelArmour', name: 'Steel armour', emoji: '🦺', slot: 'armor', stats: { defense: 22, hp: 160 }, tier: 5 },

  // Consumables
  // Potions are drunk below the HP threshold (and returned if never needed);
  // rations are eaten before the boss; elixirs protect for the whole run.
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', heal: 1, when: 'lowHp' },
  { id: 'ration', name: 'Ration', emoji: '🥪', slot: 'consumable', heal: 0.25, when: 'beforeBoss' },
  { id: 'fireResistanceElixir', name: 'Fire resistance elixir', emoji: '🧯', slot: 'consumable', protectsAgainst: 'fire' },

  ...extraWeapons,
];
