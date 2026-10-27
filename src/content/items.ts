import type { GearDef, ItemDef, WeaponType } from '@/game/types';

import { healthRules } from './health';
import { provisionRules } from './provisions';

const { meals, kits, charms } = provisionRules;

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

  // Consumables, in a hero's slot. Potions are drunk below the HP threshold
  // (and returned if never needed); elixirs protect and charms help for the
  // whole run.
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', heal: healthRules.potionHeal, when: 'lowHp' },
  { id: 'fireResistanceElixir', name: 'Fire resistance elixir', emoji: '🧯', slot: 'consumable', protectsAgainst: 'fire' },
  { id: 'rabbitsFoot', name: 'Rabbit’s foot', emoji: '🐇', description: '+5% critical hit chance for this hero.', slot: 'consumable', charm: { kind: 'crit', chance: charms.rabbitsFoot } },
  { id: 'luckyTooth', name: 'Lucky tooth', emoji: '🦷', description: '+5% gold for the party (one per party counts).', slot: 'consumable', charm: { kind: 'gold', multiplier: charms.luckyTooth } },
  { id: 'wardBone', name: 'Ward bone', emoji: '🦴', description: 'This hero ignores the first trap that would hit them.', slot: 'consumable', charm: { kind: 'wardTrap' } },

  // Provisions, taken by the whole party. Supply is needed for every
  // expedition; a meal and a kit are optional.
  { id: 'trailMix', name: 'Trail mix', emoji: '🥜', description: '2 supply points.', slot: 'provision', supply: 2 },
  { id: 'jerky', name: 'Jerky', emoji: '🥓', description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'huntersStew', name: 'Hunter’s stew', emoji: '🍲', description: 'Heals 15% of max HP before the boss.', slot: 'provision', meal: { kind: 'bossHeal', pct: meals.stewHeal } },
  { id: 'scholarsPorridge', name: 'Scholar’s porridge', emoji: '🥣', description: '+15% XP.', slot: 'provision', meal: { kind: 'xp', multiplier: meals.porridgeXp } },
  { id: 'merchantsPie', name: 'Merchant’s pie', emoji: '🥧', description: '+15% gold.', slot: 'provision', meal: { kind: 'gold', multiplier: meals.pieGold } },
  { id: 'quickBites', name: 'Quick bites', emoji: '🥪', description: '−10% expedition time.', slot: 'provision', meal: { kind: 'duration', multiplier: meals.quickBitesDuration } },
  { id: 'comfortBroth', name: 'Comfort broth', emoji: '🍵', description: 'Better rewards after a retreat or defeat.', slot: 'provision', meal: { kind: 'retreat', bonus: meals.brothRetreat } },
  { id: 'lockpicks', name: 'Lockpicks', emoji: '🗝️', description: 'Opens one locked way.', slot: 'provision', kit: { kind: 'obstacle', obstacle: 'locked' } },
  { id: 'ropeAndPitons', name: 'Rope and pitons', emoji: '🪢', description: 'Gets past one rubble.', slot: 'provision', kit: { kind: 'obstacle', obstacle: 'rubble' } },
  { id: 'torches', name: 'Torches', emoji: '🔥', description: 'Burns through one barricade.', slot: 'provision', kit: { kind: 'obstacle', obstacle: 'barricade' } },
  { id: 'bait', name: 'Bait', emoji: '🪱', description: '50% chance to calm the first beast fight.', slot: 'provision', kit: { kind: 'calmBeasts', chance: kits.baitCalm } },
  { id: 'gifts', name: 'Gifts', emoji: '🎁', description: 'The first locals react as if charmed.', slot: 'provision', kit: { kind: 'charmLocals' } },
  { id: 'holyWater', name: 'Holy water', emoji: '💧', description: '+25% damage against undead in the first undead fight.', slot: 'provision', kit: { kind: 'undeadDamage', multiplier: kits.holyWater } },

  ...extraWeapons,
];
