import type { ItemDef } from '@/game/types';

export const items: ItemDef[] = [
  // Weapons
  { id: 'ironSword', name: 'Iron sword', emoji: '🗡️', slot: 'weapon', weaponType: 'sword', stats: { attack: 6 }, maxDurability: 30 },
  { id: 'copperDagger', name: 'Copper dagger', emoji: '🔪', slot: 'weapon', weaponType: 'dagger', stats: { attack: 4, defense: 1 }, maxDurability: 20 },
  { id: 'huntingKnife', name: 'Hunting knife', emoji: '🔪', slot: 'weapon', weaponType: 'knife', stats: { attack: 3 }, maxDurability: 25 },
  { id: 'crystalWand', name: 'Crystal wand', emoji: '🪄', slot: 'weapon', weaponType: 'wand', stats: { magic: 7 }, maxDurability: 20 },
  { id: 'boneBow', name: 'Bone bow', emoji: '🏹', slot: 'weapon', weaponType: 'bow', stats: { attack: 6 }, maxDurability: 25 },
  { id: 'starforgedBlade', name: 'Starforged blade', emoji: '⚔️', slot: 'weapon', weaponType: 'sword', stats: { attack: 12, magic: 2 }, maxDurability: 50 },

  // Armor
  { id: 'leatherArmor', name: 'Leather armor', emoji: '🦺', slot: 'armor', stats: { defense: 4, hp: 10 }, maxDurability: 30 },
  { id: 'moonweaveCloak', name: 'Moonweave cloak', emoji: '🧥', slot: 'armor', stats: { defense: 3, magic: 4, hp: 5 }, maxDurability: 35 },

  // Consumables
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', power: 4 },
  { id: 'ration', name: 'Ration', emoji: '🥪', slot: 'consumable', power: 2 },
  { id: 'fireResistanceElixir', name: 'Fire resistance elixir', emoji: '🧯', slot: 'consumable', power: 3, protectsAgainst: 'fire' },
];
