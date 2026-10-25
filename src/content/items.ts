import type { ItemDef } from '@/game/types';

// Five forge tiers: wood → stone → copper → iron → steel (iron + coal).
// Each tier has a pickaxe, a sword, a bow, a wand and an armor.
export const items: ItemDef[] = [
  // Pickaxes: each one mines the next material, see `requiresPickaxe` in resources.ts.
  { id: 'woodPickaxe', name: 'Wooden pickaxe', emoji: '⛏️', tier: 'wood', slot: 'tool', tool: 'pickaxe', power: 1 },
  { id: 'stonePickaxe', name: 'Stone pickaxe', emoji: '⛏️', tier: 'stone', slot: 'tool', tool: 'pickaxe', power: 2 },
  { id: 'copperPickaxe', name: 'Copper pickaxe', emoji: '⛏️', tier: 'copper', slot: 'tool', tool: 'pickaxe', power: 3 },
  { id: 'ironPickaxe', name: 'Iron pickaxe', emoji: '⛏️', tier: 'iron', slot: 'tool', tool: 'pickaxe', power: 4 },
  { id: 'steelPickaxe', name: 'Steel pickaxe', emoji: '⛏️', tier: 'steel', slot: 'tool', tool: 'pickaxe', power: 5, yieldBonus: 1 },

  // Swords
  { id: 'woodSword', name: 'Wooden sword', emoji: '🗡️', tier: 'wood', slot: 'weapon', weaponType: 'sword', stats: { attack: 2 }, maxDurability: 15 },
  { id: 'stoneSword', name: 'Stone sword', emoji: '🗡️', tier: 'stone', slot: 'weapon', weaponType: 'sword', stats: { attack: 4 }, maxDurability: 20 },
  { id: 'copperSword', name: 'Copper sword', emoji: '🗡️', tier: 'copper', slot: 'weapon', weaponType: 'sword', stats: { attack: 6 }, maxDurability: 25 },
  { id: 'ironSword', name: 'Iron sword', emoji: '🗡️', tier: 'iron', slot: 'weapon', weaponType: 'sword', stats: { attack: 9 }, maxDurability: 30 },
  { id: 'steelSword', name: 'Steel sword', emoji: '🗡️', tier: 'steel', slot: 'weapon', weaponType: 'sword', stats: { attack: 13 }, maxDurability: 40 },

  // Bows
  { id: 'woodBow', name: 'Wooden bow', emoji: '🏹', tier: 'wood', slot: 'weapon', weaponType: 'bow', stats: { attack: 2 }, maxDurability: 15 },
  { id: 'stoneBow', name: 'Stone-tipped bow', emoji: '🏹', tier: 'stone', slot: 'weapon', weaponType: 'bow', stats: { attack: 4 }, maxDurability: 20 },
  { id: 'copperBow', name: 'Copper bow', emoji: '🏹', tier: 'copper', slot: 'weapon', weaponType: 'bow', stats: { attack: 6 }, maxDurability: 25 },
  { id: 'ironBow', name: 'Iron bow', emoji: '🏹', tier: 'iron', slot: 'weapon', weaponType: 'bow', stats: { attack: 9 }, maxDurability: 30 },
  { id: 'steelBow', name: 'Steel bow', emoji: '🏹', tier: 'steel', slot: 'weapon', weaponType: 'bow', stats: { attack: 13 }, maxDurability: 40 },

  // Wands
  { id: 'woodWand', name: 'Wooden wand', emoji: '🪄', tier: 'wood', slot: 'weapon', weaponType: 'wand', stats: { magic: 2 }, maxDurability: 15 },
  { id: 'stoneWand', name: 'Stone wand', emoji: '🪄', tier: 'stone', slot: 'weapon', weaponType: 'wand', stats: { magic: 4 }, maxDurability: 20 },
  { id: 'copperWand', name: 'Copper wand', emoji: '🪄', tier: 'copper', slot: 'weapon', weaponType: 'wand', stats: { magic: 6 }, maxDurability: 25 },
  { id: 'ironWand', name: 'Iron wand', emoji: '🪄', tier: 'iron', slot: 'weapon', weaponType: 'wand', stats: { magic: 9 }, maxDurability: 30 },
  { id: 'steelWand', name: 'Steel wand', emoji: '🪄', tier: 'steel', slot: 'weapon', weaponType: 'wand', stats: { magic: 13 }, maxDurability: 40 },

  // Armor
  { id: 'woodArmor', name: 'Bark armor', emoji: '🦺', tier: 'wood', slot: 'armor', stats: { defense: 1, hp: 4 }, maxDurability: 15 },
  { id: 'stoneArmor', name: 'Stone-studded armor', emoji: '🦺', tier: 'stone', slot: 'armor', stats: { defense: 2, hp: 8 }, maxDurability: 20 },
  { id: 'copperArmor', name: 'Copper mail', emoji: '🦺', tier: 'copper', slot: 'armor', stats: { defense: 3, hp: 12 }, maxDurability: 25 },
  { id: 'ironArmor', name: 'Iron mail', emoji: '🦺', tier: 'iron', slot: 'armor', stats: { defense: 5, hp: 16 }, maxDurability: 30 },
  { id: 'steelArmor', name: 'Steel plate', emoji: '🦺', tier: 'steel', slot: 'armor', stats: { defense: 7, hp: 22 }, maxDurability: 40 },

  // Legendary, from the last dungeons
  { id: 'starforgedBlade', name: 'Starforged blade', emoji: '⚔️', slot: 'weapon', weaponType: 'sword', stats: { attack: 17, magic: 3 }, maxDurability: 50 },
  { id: 'moonweaveCloak', name: 'Moonweave cloak', emoji: '🧥', slot: 'armor', stats: { defense: 6, magic: 8, hp: 18 }, maxDurability: 45 },

  // Consumables
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', power: 4 },
  { id: 'ration', name: 'Ration', emoji: '🥪', slot: 'consumable', power: 2 },
  { id: 'fireResistanceElixir', name: 'Fire resistance elixir', emoji: '🧯', slot: 'consumable', power: 3, protectsAgainst: 'fire' },
];
