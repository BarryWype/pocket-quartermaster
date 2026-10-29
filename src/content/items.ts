import type { GearDef, ItemDef, WeaponType } from '@/game/types';

import { healthRules } from './health';
import { provisionRules } from './provisions';

const { meals, charms } = provisionRules;

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

  // Consumables, in a hero's slot, all gone after the run: potions are drunk
  // below the HP threshold, charms help for the whole run, and what never
  // triggered is broken back down (see threats/salvage.ts).
  { id: 'healingPotion', name: 'Healing potion', emoji: '🧪', slot: 'consumable', heal: healthRules.potionHeal, when: 'lowHp' },
  { id: 'rabbitsFoot', name: 'Rabbit’s foot', emoji: '🐇', description: '+5% critical hit chance for this hero.', slot: 'consumable', charm: { kind: 'crit', chance: charms.rabbitsFoot } },
  { id: 'luckyTooth', name: 'Lucky tooth', emoji: '🦷', description: '+5% gold for the party (one per party counts).', slot: 'consumable', charm: { kind: 'gold', multiplier: charms.luckyTooth } },

  // Kits and ward salves: single-use answers to threats, in a hero's slot and
  // gone after the run, like every consumable.
  { id: 'roguesRoll', name: 'Rogue’s roll', emoji: '🗝️', description: 'Picks, a probe, wire and a decoy purse.', slot: 'consumable', kit: { threats: ['traps', 'locked', 'thieves'], approach: 'finesse' } },
  { id: 'huntersPack', name: 'Hunter’s pack', emoji: '🎒', description: 'Sleepweed bait and a snare.', slot: 'consumable', kit: { threats: ['beasts'], keywords: ['calm'] } },
  { id: 'emberWardSalve', name: 'Ember ward salve', emoji: '🔥', description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'fire', kit: { threats: ['element'] } },
  { id: 'tideWardSalve', name: 'Tide ward salve', emoji: '💧', description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'water', kit: { threats: ['element'] } },
  { id: 'stormWardSalve', name: 'Storm ward salve', emoji: '⚡', description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'electric', kit: { threats: ['element'] } },
  { id: 'stoneWardSalve', name: 'Stone ward salve', emoji: '🪨', description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'stone', kit: { threats: ['element'] } },
  { id: 'thornWardSalve', name: 'Thorn ward salve', emoji: '🌵', description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'grass', kit: { threats: ['element'] } },
  { id: 'explorersKit', name: 'Explorer’s kit', emoji: '🧭', description: 'Rope, a pry bar, an air bladder and seabreath tonic.', slot: 'consumable', kit: { threats: ['rubble', 'underwater'], approach: 'threat' } },
  { id: 'healersSatchel', name: 'Healer’s satchel', emoji: '🩹', description: 'Theriac and bandages.', slot: 'consumable', kit: { threats: ['poison'], keywords: ['antidote'], heal: 0.1 } },
  { id: 'giftBasket', name: 'Gift basket', emoji: '🎁', description: 'Honey cakes, smoked meat and a carved trinket.', slot: 'consumable', kit: { threats: ['locals'], approach: 'presence' } },
  { id: 'lantern', name: 'Lantern', emoji: '🏮', description: 'A shuttered tallow lantern and copper bells.', slot: 'consumable', kit: { threats: ['darkness', 'ambush'], keywords: ['light', 'watchful'] } },
  { id: 'holyRelics', name: 'Holy relics', emoji: '🕯️', description: 'Holy water and warding salt.', slot: 'consumable', kit: { threats: ['desecrated', 'casters'], approach: 'faith' } },
  { id: 'scholarsSatchel', name: 'Scholar’s satchel', emoji: '📚', description: 'A copper cipher wheel, berry ink, thread and chalk.', slot: 'consumable', kit: { threats: ['puzzle', 'maze'], approach: 'wits' } },

  // Provisions, taken by the whole party. Supply is needed for every
  // expedition; a meal is optional.
  { id: 'trailMix', name: 'Trail mix', emoji: '🥜', description: '2 supply points.', slot: 'provision', supply: 2 },
  { id: 'jerky', name: 'Jerky', emoji: '🥓', description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'huntersStew', name: 'Hunter’s stew', emoji: '🍲', description: 'Heals 15% of max HP before the boss.', slot: 'provision', meal: { kind: 'bossHeal', pct: meals.stewHeal } },
  { id: 'scholarsPorridge', name: 'Scholar’s porridge', emoji: '🥣', description: '+15% XP.', slot: 'provision', meal: { kind: 'xp', multiplier: meals.porridgeXp } },
  { id: 'merchantsPie', name: 'Merchant’s pie', emoji: '🥧', description: '+15% gold.', slot: 'provision', meal: { kind: 'gold', multiplier: meals.pieGold } },
  { id: 'quickBites', name: 'Quick bites', emoji: '🥪', description: '−10% expedition time.', slot: 'provision', meal: { kind: 'duration', multiplier: meals.quickBitesDuration } },
  { id: 'comfortBroth', name: 'Comfort broth', emoji: '🍵', description: 'Better rewards after a retreat or defeat.', slot: 'provision', meal: { kind: 'retreat', bonus: meals.brothRetreat } },

  ...extraWeapons,
];
