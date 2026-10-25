import type { ItemDef } from '@/game/types';

// One gear set per material tier: wood → stone → copper → iron → steel.
export const items: ItemDef[] = [
  // Tier 1: wood
  { id: 'woodPickaxe', name: 'Wooden pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-wood.png'), slot: 'tool', toolType: 'pickaxe', tier: 1 },
  { id: 'woodSword', name: 'Wooden sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-wood.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 6 }, maxDurability: 15 },
  { id: 'woodBow', name: 'Wooden bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-wood.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 6 }, maxDurability: 15 },
  { id: 'woodWand', name: 'Wooden wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-wood.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 6 }, maxDurability: 15 },
  { id: 'woodArmour', name: 'Wooden armour', emoji: '🦺', slot: 'armor', stats: { defense: 4, hp: 30 }, maxDurability: 15 },

  // Tier 2: stone
  { id: 'stonePickaxe', name: 'Stone pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-stone.png'), slot: 'tool', toolType: 'pickaxe', tier: 2 },
  { id: 'stoneSword', name: 'Stone sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-stone.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 11 }, maxDurability: 20 },
  { id: 'stoneBow', name: 'Stone bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-stone.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 11 }, maxDurability: 20 },
  { id: 'stoneWand', name: 'Stone wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-stone.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 11 }, maxDurability: 20 },
  { id: 'stoneArmour', name: 'Stone armour', emoji: '🦺', slot: 'armor', stats: { defense: 7, hp: 55 }, maxDurability: 20 },

  // Tier 3: copper
  { id: 'copperPickaxe', name: 'Copper pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-copper.png'), slot: 'tool', toolType: 'pickaxe', tier: 3 },
  { id: 'copperSword', name: 'Copper sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-copper.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 17 }, maxDurability: 25 },
  { id: 'copperBow', name: 'Copper bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-copper.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 17 }, maxDurability: 25 },
  { id: 'copperWand', name: 'Copper wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-copper.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 17 }, maxDurability: 25 },
  { id: 'copperArmour', name: 'Copper armour', emoji: '🦺', slot: 'armor', stats: { defense: 11, hp: 85 }, maxDurability: 25 },

  // Tier 4: iron
  { id: 'ironPickaxe', name: 'Iron pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-iron.png'), slot: 'tool', toolType: 'pickaxe', tier: 4 },
  { id: 'ironSword', name: 'Iron sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-iron.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 24 }, maxDurability: 30 },
  { id: 'ironBow', name: 'Iron bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-iron.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 24 }, maxDurability: 30 },
  { id: 'ironWand', name: 'Iron wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-iron.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 24 }, maxDurability: 30 },
  { id: 'ironArmour', name: 'Iron armour', emoji: '🦺', slot: 'armor', stats: { defense: 16, hp: 120 }, maxDurability: 30 },

  // Tier 5: steel
  { id: 'steelPickaxe', name: 'Steel pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-steel.png'), slot: 'tool', toolType: 'pickaxe', tier: 5 },
  { id: 'steelSword', name: 'Steel sword', emoji: '🗡️', icon: require('../../assets/icons/scaled/sword-steel.png'), slot: 'weapon', weaponType: 'sword', stats: { attack: 32 }, maxDurability: 40 },
  { id: 'steelBow', name: 'Steel bow', emoji: '🏹', icon: require('../../assets/icons/scaled/bow-steel.png'), slot: 'weapon', weaponType: 'bow', stats: { attack: 32 }, maxDurability: 40 },
  { id: 'steelWand', name: 'Steel wand', emoji: '🪄', icon: require('../../assets/icons/scaled/wand-steel.png'), slot: 'weapon', weaponType: 'wand', stats: { magic: 32 }, maxDurability: 40 },
  { id: 'steelArmour', name: 'Steel armour', emoji: '🦺', slot: 'armor', stats: { defense: 22, hp: 160 }, maxDurability: 40 },

  // Consumables
  // Potions are drunk below the HP threshold (and returned if never needed);
  // rations are eaten before the boss; elixirs protect for the whole run.
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', heal: 1, when: 'lowHp' },
  { id: 'ration', name: 'Ration', emoji: '🥪', slot: 'consumable', heal: 0.25, when: 'beforeBoss' },
  { id: 'fireResistanceElixir', name: 'Fire resistance elixir', emoji: '🧯', slot: 'consumable', protectsAgainst: 'fire' },
];
