import type { ConsumableDef, GearDef, ItemDef } from '@/game/types';

import { gearItemStats } from '@/game/equipment/budget';

import { GEAR_SLOTS, gearBudgetRules, gearId, gearNames, gearProfiles, testCharm } from './equipment';
import { healthRules } from './health';
import { charms } from './loot/charms';
import { provisionRules } from './provisions';
import { workToolId, workToolNames, workTools, workToolRules } from './workTools';

import { trinkets } from './trinkets';

const { meals, elixirs } = provisionRules;

export const MATERIAL_TIERS = [
  { id: 'wood', name: 'Wooden' },
  { id: 'stone', name: 'Stone' },
  { id: 'copper', name: 'Copper' },
  { id: 'iron', name: 'Iron' },
  { id: 'steel', name: 'Steel' },
];

/** Each gear type's icon, one per material tier. */
const GEAR_ICONS: Partial<Record<keyof typeof gearProfiles, GearDef['icon'][]>> = {
  sword: [
    require('../../assets/icons/rpg/sword-worn-shortsword.png'),
    require('../../assets/icons/rpg/sword-shortsword.png'),
    require('../../assets/icons/rpg/sword-leaf-blade.png'),
    require('../../assets/icons/rpg/sword-knight-longsword.png'),
    require('../../assets/icons/rpg/sword-steel-broadsword.png'),
  ],
  axe: [
    require('../../assets/icons/rpg/axe-iron-hatchet.png'),
    require('../../assets/icons/rpg/axe-curved-hook.png'),
    require('../../assets/icons/rpg/axe-crescent-moon.png'),
    require('../../assets/icons/rpg/axe-double-battleaxe.png'),
    require('../../assets/icons/rpg/axe-steel-labrys.png'),
  ],
  mace: [
    require('../../assets/icons/rpg/club-wooden.png'),
    require('../../assets/icons/rpg/club-stone.png'),
    require('../../assets/icons/rpg/mace-flanged.png'),
    require('../../assets/icons/rpg/mace-iron-ball.png'),
    require('../../assets/icons/rpg/mace-spiked-steel-cudgel.png'),
  ],
  dagger: [
    require('../../assets/icons/rpg/dagger-rusty-knife.png'),
    require('../../assets/icons/rpg/dagger-hooked-knife.png'),
    require('../../assets/icons/rpg/dagger-emerald-blade.png'),
    require('../../assets/icons/rpg/dagger-curved-knife.png'),
    require('../../assets/icons/rpg/dagger-steel-dirk.png'),
  ],
  bow: [
    require('../../assets/icons/rpg/bow-short-wooden.png'),
    require('../../assets/icons/rpg/bow-gnarled.png'),
    require('../../assets/icons/rpg/bow-recurve-wooden.png'),
    require('../../assets/icons/rpg/bow-long-wooden.png'),
    require('../../assets/icons/rpg/bow-steel-longbow.png'),
  ],
  spear: [
    require('../../assets/icons/rpg/spear-thorned.png'),
    require('../../assets/icons/rpg/spear-serrated.png'),
    require('../../assets/icons/rpg/spear-winged.png'),
    require('../../assets/icons/rpg/spear-iron.png'),
    require('../../assets/icons/rpg/spear-steel-broadhead.png'),
  ],
  warhammer: [
    require('../../assets/icons/rpg/hammer-iron-mallet.png'),
    require('../../assets/icons/rpg/hammer-ridged-maul.png'),
    require('../../assets/icons/rpg/hammer-war-pick.png'),
    require('../../assets/icons/rpg/hammer-warhammer.png'),
    require('../../assets/icons/rpg/hammer-steel-maul.png'),
  ],
  wand: [
    require('../../assets/icons/magic/wand-leaf.png'),
    require('../../assets/icons/magic/wand-amethyst.png'),
    require('../../assets/icons/magic/wand-ruby.png'),
    require('../../assets/icons/magic/wand-sapphire.png'),
    require('../../assets/icons/magic/wand-violet.png'),
  ],
  staff: [
    require('../../assets/icons/magic/wand-frost.png'),
    require('../../assets/icons/magic/wand-fire.png'),
    require('../../assets/icons/magic/wand-ice.png'),
    require('../../assets/icons/magic/wand-blue-gold.png'),
    require('../../assets/icons/magic/wand-golden-crescent.png'),
  ],
  censer: [
    require('../../assets/icons/relics/incense-bowl.png'),
    require('../../assets/icons/relics/censer-iron-smoking.png'),
    require('../../assets/icons/relics/censer-iron-smoking.png'),
    require('../../assets/icons/relics/censer-gold-smoking.png'),
    require('../../assets/icons/relics/incense-burner-gold.png'),
  ],
  knuckles: [
    require('../../assets/icons/rpg/gloves-hand-wraps.png'),
    require('../../assets/icons/rpg/gloves-banded-leather.png'),
    require('../../assets/icons/rpg/dagger-bronze-knuckle.png'),
    require('../../assets/icons/rpg/gloves-iron-knuckle.png'),
    require('../../assets/icons/rpg/gloves-steel-gauntlets.png'),
  ],
  crossbow: [
    require('../../assets/icons/rpg/crossbow-pale-wooden.png'),
    require('../../assets/icons/rpg/crossbow-long-wooden.png'),
    require('../../assets/icons/rpg/crossbow-spiked-wooden.png'),
    require('../../assets/icons/rpg/crossbow-bone.png'),
    require('../../assets/icons/rpg/crossbow-silver.png'),
  ],
  throwing: [
    require('../../assets/icons/rpg/dual-serrated-knives.png'),
    require('../../assets/icons/rpg/dual-crescent-blades.png'),
    require('../../assets/icons/rpg/dual-iron-battleaxes.png'),
    require('../../assets/icons/rpg/dual-steel-spears.png'),
    require('../../assets/icons/rpg/dual-steel-axes.png'),
  ],
  totem: [
    require('../../assets/icons/relics/totem-green.png'),
    require('../../assets/icons/relics/totem-ox.png'),
    require('../../assets/icons/relics/totem-red.png'),
    require('../../assets/icons/relics/totem-feathered.png'),
    require('../../assets/icons/relics/totem-steel.png'),
  ],
  runestone: [
    require('../../assets/icons/rpg/rune-red-fehu.png'),
    require('../../assets/icons/rpg/rune-orange-serpent.png'),
    require('../../assets/icons/rpg/rune-green-double-cross.png'),
    require('../../assets/icons/rpg/rune-blue-othala.png'),
    require('../../assets/icons/rpg/rune-violet-uruz.png'),
  ],
  flasks: [
    require('../../assets/icons/rpg/bottle-empty-bulb.png'),
    require('../../assets/icons/rpg/potion-green-bulb.png'),
    require('../../assets/icons/rpg/potion-blue-bulb.png'),
    require('../../assets/icons/rpg/potion-orange-bulb.png'),
    require('../../assets/icons/rpg/potion-red-round.png'),
  ],
  plate: [
    require('../../assets/icons/rpg/armor-leather-iron-pauldrons.png'),
    require('../../assets/icons/rpg/armor-mossy-plate.png'),
    require('../../assets/icons/rpg/armor-golden-ruby.png'),
    require('../../assets/icons/rpg/armor-knight-plate.png'),
    require('../../assets/icons/rpg/armor-steel-plate.png'),
  ],
  mail: [
    require('../../assets/icons/rpg/armor-chainmail.png'),
    require('../../assets/icons/rpg/armor-silver-mantle.png'),
    require('../../assets/icons/rpg/armor-spiked-silver.png'),
    require('../../assets/icons/rpg/armor-steel-cuirass.png'),
    require('../../assets/icons/rpg/armor-blue-spiked.png'),
  ],
  leather: [
    require('../../assets/icons/rpg/armor-leather-vest.png'),
    require('../../assets/icons/rpg/armor-strapped-leather.png'),
    require('../../assets/icons/rpg/armor-studded-leather.png'),
    require('../../assets/icons/rpg/armor-dark-leather.png'),
    require('../../assets/icons/rpg/armor-red-caped-leather.png'),
  ],
  robes: [
    require('../../assets/icons/rpg/armor-red-tunic.png'),
    require('../../assets/icons/relics/armor-leather-tunic.png'),
    require('../../assets/icons/rpg/armor-emerald-violet.png'),
    require('../../assets/icons/rpg/armor-crystal-plate.png'),
    require('../../assets/icons/rpg/armor-skull-plate.png'),
  ],
  shield: [
    require('../../assets/icons/rpg/shield-round-wooden.png'),
    require('../../assets/icons/rpg/shield-studded-wooden.png'),
    require('../../assets/icons/rpg/shield-banded-kite.png'),
    require('../../assets/icons/rpg/shield-iron-heater.png'),
    require('../../assets/icons/rpg/shield-steel-kite.png'),
  ],
  buckler: [
    require('../../assets/icons/rpg/shield-wooden-buckler.png'),
    require('../../assets/icons/rpg/shield-oval-iron.png'),
    require('../../assets/icons/relics/shield-round-sun.png'),
    require('../../assets/icons/relics/shield-round-blue.png'),
    require('../../assets/icons/rpg/shield-spiked-steel.png'),
  ],
  offhandBlade: [
    require('../../assets/icons/rpg/dagger-feather-blade.png'),
    require('../../assets/icons/rpg/sword-spade-tip.png'),
    require('../../assets/icons/rpg/sword-crescent-blade.png'),
    require('../../assets/icons/rpg/sword-serrated-blade.png'),
    require('../../assets/icons/rpg/sword-gilded-sabre.png'),
  ],
  quiver: [
    require('../../assets/icons/rpg/crossbow-light-wooden.png'),
    require('../../assets/icons/rpg/crossbow-heavy-wooden.png'),
    require('../../assets/icons/rpg/crossbow-reinforced.png'),
    require('../../assets/icons/rpg/crossbow-steel.png'),
    require('../../assets/icons/rpg/crossbow-steel-heavy.png'),
  ],
  tome: [
    require('../../assets/icons/rpg/book-leather.png'),
    require('../../assets/icons/rpg/book-green.png'),
    require('../../assets/icons/rpg/book-blue-tome.png'),
    require('../../assets/icons/magic/book-purple.png'),
    require('../../assets/icons/rpg/book-dark-grimoire.png'),
  ],
  focus: [
    require('../../assets/icons/magic/orb-teal.png'),
    require('../../assets/icons/magic/orb-purple.png'),
    require('../../assets/icons/magic/orb-fire.png'),
    require('../../assets/icons/magic/orb-ice.png'),
    require('../../assets/icons/relics/orb-galaxy.png'),
  ],
};

/** One item per gear type and tier (135 pieces), stats from the budget maths. */
const gear: GearDef[] = (Object.keys(gearProfiles) as (keyof typeof gearProfiles)[]).flatMap((type) => {
  const profile = gearProfiles[type];
  return [1, 2, 3, 4, 5].map((tier): GearDef => ({
    id: gearId(type, tier),
    name: gearNames[type][tier - 1],
    emoji: profile.emoji,
    ...(GEAR_ICONS[type] ? { icon: GEAR_ICONS[type]![tier - 1] } : {}),
    slot: GEAR_SLOTS[type],
    gearType: type,
    stats: gearItemStats(profile, tier),
    tier,
    ...(profile.twoHanded ? { twoHanded: true } : {}),
    keywords: profile.keywords,
    ...(profile.heavy ? { heavy: true } : {}),
    ...(profile.concealed ? { concealed: true } : {}),
    ...(profile.damageStat ? { damageStat: profile.damageStat } : {}),
  }));
});

/**
 * A work tool's weak stats: `budgetShare` of the off-hand budget, scaled by
 * tier like other gear, split by workToolRules.shares (HP at hpPerPoint).
 */
const workToolStats = (tier: number): GearDef['stats'] => {
  const points = gearBudgetRules.budget.offhand * workToolRules.budgetShare * gearBudgetRules.tierScale[tier - 1];
  const total = workToolRules.shares.armour + workToolRules.shares.hp;
  return {
    armour: (points * workToolRules.shares.armour) / total,
    hp: ((points * workToolRules.shares.hp) / total) * gearBudgetRules.hpPerPoint,
  };
};

/** One work tool per kind and tier (25 pieces): off-hand, no gear type, no damage stat, no keywords. */
const workToolGear: GearDef[] = workTools.flatMap((tool) =>
  [1, 2, 3, 4, 5].map((tier): GearDef => ({
    id: workToolId(tool.kind, tier),
    name: workToolNames[tool.kind][tier - 1],
    emoji: tool.emoji,
    icon: tool.icon,
    slot: 'offhand',
    stats: workToolStats(tier),
    tier,
    keywords: [],
    workTool: { kind: tool.kind, job: tool.job },
  })),
);

// One gear set per material tier: wood → stone → copper → iron → steel.
export const items: ItemDef[] = [
  // Tier 1: wood
  { id: 'woodPickaxe', name: 'Wooden pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-wood.png'), slot: 'tool', toolType: 'pickaxe', tier: 1 },
  // Tier 2: stone
  { id: 'stonePickaxe', name: 'Stone pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-stone.png'), slot: 'tool', toolType: 'pickaxe', tier: 2 },
  // Tier 3: copper
  { id: 'copperPickaxe', name: 'Copper pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-copper.png'), slot: 'tool', toolType: 'pickaxe', tier: 3 },
  // Tier 4: iron
  { id: 'ironPickaxe', name: 'Iron pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-iron.png'), slot: 'tool', toolType: 'pickaxe', tier: 4 },
  // Tier 5: steel
  { id: 'steelPickaxe', name: 'Steel pickaxe', emoji: '⛏️', icon: require('../../assets/icons/scaled/pickaxe-steel.png'), slot: 'tool', toolType: 'pickaxe', tier: 5 },

  // Consumables, in a hero's slot, all gone after the run: potions are drunk
  // below the HP threshold, and what never
  // triggered is broken back down (see threats/salvage.ts).
  { id: 'healingPotion', name: 'Minor healing potion', emoji: '🧪', icon: require('../../assets/icons/rpg/potion-red-vial.png'), description: 'Heals 30% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.minor, when: 'lowHp' },
  { id: 'standardHealingPotion', name: 'Healing potion', emoji: '🧪', icon: require('../../assets/icons/rpg/potion-red-flask.png'), description: 'Heals 50% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.standard, when: 'lowHp' },
  { id: 'greaterHealingPotion', name: 'Greater healing potion', emoji: '🧪', icon: require('../../assets/icons/rpg/potion-red-bulb.png'), description: 'Heals 70% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.greater, when: 'lowHp' },

  // Kits and ward salves: single-use answers to threats, in a hero's slot and
  // gone after the run, like every consumable.
  { id: 'roguesRoll', name: 'Rogue’s roll', emoji: '🗝️', icon: require('../../assets/icons/relics/lockpicks.png'), description: 'Picks, a probe, wire and a decoy purse.', slot: 'consumable', kit: { threats: ['traps'], approach: 'finesse' } },
  { id: 'huntersPack', name: 'Hunter’s pack', emoji: '🎒', icon: require('../../assets/icons/rpg/bag-backpack.png'), description: 'Sleepweed bait and a snare.', slot: 'consumable', kit: { threats: ['beasts'], keywords: ['calm'] } },
  { id: 'emberWardSalve', name: 'Ember ward salve', emoji: '🔥', icon: require('../../assets/icons/alchemy/bowl-fire-crystals.png'), description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'fire', kit: { threats: ['element'] } },
  { id: 'tideWardSalve', name: 'Tide ward salve', emoji: '💧', icon: require('../../assets/icons/alchemy/bowl-aqua-crystals.png'), description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'water', kit: { threats: ['element'] } },
  { id: 'stormWardSalve', name: 'Storm ward salve', emoji: '⚡', icon: require('../../assets/icons/alchemy/bowl-yellow-powder.png'), description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'electric', kit: { threats: ['element'] } },
  { id: 'stoneWardSalve', name: 'Stone ward salve', emoji: '🪨', icon: require('../../assets/icons/alchemy/bowl-white-powder.png'), description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'stone', kit: { threats: ['element'] } },
  { id: 'thornWardSalve', name: 'Thorn ward salve', emoji: '🌵', icon: require('../../assets/icons/alchemy/bowl-green-moss.png'), description: 'Rubbed on skin and armour.', slot: 'consumable', protectsAgainst: 'grass', kit: { threats: ['element'] } },
  { id: 'explorersKit', name: 'Explorer’s kit', emoji: '🧭', icon: require('../../assets/icons/rpg/bag-large-satchel.png'), description: 'Rope, a pry bar, an air bladder and seabreath tonic.', slot: 'consumable', kit: { threats: ['traps', 'element'], approach: 'threat' } },
  { id: 'healersSatchel', name: 'Healer’s satchel', emoji: '🩹', icon: require('../../assets/icons/rpg/bag-small-pouch.png'), description: 'Theriac, bandages and a stone mortar.', slot: 'consumable', kit: { threats: ['poison'], keywords: ['antidote'], heal: 0.1 } },
  { id: 'giftBasket', name: 'Gift basket', emoji: '🎁', icon: require('../../assets/icons/rpg/bag-large-sack.png'), description: 'Honey cakes, smoked meat and a carved stone trinket.', slot: 'consumable' },
  { id: 'lantern', name: 'Lantern', emoji: '🏮', description: 'A shuttered tallow lantern and bells.', slot: 'consumable', kit: { threats: ['darkness'], keywords: ['light', 'watchful'] } },
  { id: 'holyRelics', name: 'Holy symbols', emoji: '🕯️', icon: require('../../assets/icons/relics/cross-wooden.png'), description: 'Holy water in a copper vial and warding salt.', slot: 'consumable', kit: { threats: ['holy'], approach: 'faith' } },
  { id: 'blessedRelics', name: 'Blessed symbols', emoji: '✨', icon: require('../../assets/icons/relics/cross-gold-ornate.png'), description: 'Holy symbols blessed at a chapel: +3 Faith.', slot: 'consumable', kit: { threats: ['holy'], approach: 'faith', bonus: 3 } },
  { id: 'scholarsSatchel', name: 'Scholar’s satchel', emoji: '📚', icon: require('../../assets/icons/magic/book-open-brown.png'), description: 'A cipher wheel, lampblack ink, thread and chalk.', slot: 'consumable', kit: { threats: ['traps'], approach: 'wits' } },

  // Hero consumables, gone after the run like every one in a hero's slot.
  { id: 'strengthDraught', name: 'Strength draught', emoji: '💪', icon: require('../../assets/icons/alchemy/potion-cone-red.png'), description: '+15% Power for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'power', multiplier: elixirs.power } },
  { id: 'arcaneTonic', name: 'Arcane tonic', emoji: '🔮', icon: require('../../assets/icons/alchemy/potion-cone-violet.png'), description: '+15% Magic for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'magic', multiplier: elixirs.magic } },
  { id: 'ironskinBrew', name: 'Ironskin brew', emoji: '🛡️', icon: require('../../assets/icons/alchemy/potion-brown.png'), description: '+20% Armour for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'armour', multiplier: elixirs.armour } },
  { id: 'nullrootTincture', name: 'Nullroot tincture', emoji: '🌿', icon: require('../../assets/icons/alchemy/root-mandrake-dark.png'), description: '+20% Resistance for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'resistance', multiplier: elixirs.resistance } },
  { id: 'quicksilver', name: 'Quicksilver', emoji: '🌀', icon: require('../../assets/icons/magic/elixir-clear.png'), description: '+2 Speed for the run.', slot: 'consumable', elixir: { kind: 'speed', add: elixirs.quicksilverSpeed } },
  { id: 'firebomb', name: 'Firebomb', emoji: '💣', icon: require('../../assets/icons/relics/bomb-black.png'), description: 'Opens the first fight with fire damage to every enemy.', slot: 'consumable', elixir: { kind: 'firebomb', damage: elixirs.firebombDamage } },
  { id: 'emberOil', name: 'Ember oil', emoji: '🔥', icon: require('../../assets/icons/alchemy/potion-round-red.png'), description: 'Infuses the weapon with fire for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'fire' } },
  { id: 'tideOil', name: 'Tide oil', emoji: '💧', icon: require('../../assets/icons/alchemy/potion-round-blue.png'), description: 'Infuses the weapon with water for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'water' } },
  { id: 'stormOil', name: 'Storm oil', emoji: '⚡', icon: require('../../assets/icons/alchemy/potion-round-yellow.png'), description: 'Infuses the weapon with lightning for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'electric' } },
  { id: 'stoneOil', name: 'Stone oil', emoji: '🪨', icon: require('../../assets/icons/alchemy/potion-round-sand.png'), description: 'Infuses the weapon with stone for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'stone' } },
  { id: 'thornOil', name: 'Thorn oil', emoji: '🌵', icon: require('../../assets/icons/alchemy/potion-round-green.png'), description: 'Infuses the weapon with thorns for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'grass' } },
  { id: 'smokeBomb', name: 'Smoke bomb', emoji: '💨', icon: require('../../assets/icons/relics/bomb-iron.png'), description: 'Instead of a knock-out, the party escapes with more loot.', slot: 'consumable', elixir: { kind: 'smokeBomb', retreatBonus: elixirs.smokeBombRetreat } },
  { id: 'revivalDraught', name: 'Revival draught', emoji: '✨', icon: require('../../assets/icons/magic/elixir-golden-glow.png'), description: 'Once per run, gets back up at 30% HP when knocked out.', slot: 'consumable', elixir: { kind: 'revive', hp: elixirs.reviveHp } },
  { id: 'viperOil', name: 'Viper oil', emoji: '🐍', icon: require('../../assets/icons/relics/flask-green-poison.png'), description: `+${elixirs.viperCrit}% critical hit chance for the run.`, slot: 'consumable', elixir: { kind: 'crit', add: elixirs.viperCrit } },
  // Charms: raise what the run finds (see content/loot/charms.ts).
  ...charms.map((charm): ConsumableDef => ({
    id: charm.id,
    name: charm.name,
    emoji: charm.emoji,
    icon: charm.icon,
    description: charm.description,
    slot: 'consumable',
    charm: charm.modifier,
  })),

  // Boss weakness items, bought at map places and used up when the run meets
  // their boss.
  { id: 'wantedPoster', name: 'His own wanted poster', emoji: '📜', icon: require('../../assets/icons/magic/parchment-note.png'), description: 'Half the bandit captain’s men desert: −25% HP.', slot: 'consumable', weakness: 'banditCaptain' },
  { id: 'strongAle', name: 'A cask of strong ale', emoji: '🍺', icon: require('../../assets/icons/tavern/barrel-tap.png'), description: 'The ogre chieftain fights drunk: −30% damage.', slot: 'consumable', weakness: 'ogreChieftain' },
  { id: 'fontWater', name: 'Water from a chapel font', emoji: '⛲', icon: require('../../assets/icons/relics/flask-holy-water.png'), description: 'The lich of the deep loses 25% HP and never enrages.', slot: 'consumable', weakness: 'lichOfTheDeep' },
  { id: 'sleepingDraught', name: 'A sleeping draught', emoji: '💤', icon: require('../../assets/icons/alchemy/potion-lilac.png'), description: 'The giant king starts asleep: two free rounds.', slot: 'consumable', weakness: 'giantKing' },
  { id: 'decoyHoard', name: 'A decoy hoard', emoji: '💰', icon: require('../../assets/icons/relics/pouch-large.png'), description: 'The elder dragon guards it instead of sweeping the party.', slot: 'consumable', weakness: 'elderDragon' },

  // Provisions, taken by the whole party. Supply is needed for every
  // expedition; a meal is optional.
  { id: 'trailMix', name: 'Trail mix', emoji: '🥜', icon: require('../../assets/icons/tavern/bowl-nuts.png'), description: '2 supply points.', slot: 'provision', supply: 2 },
  { id: 'jerky', name: 'Jerky', emoji: '🥓', icon: require('../../assets/icons/meals/meal-sliced-beef.png'), description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'smokedFish', name: 'Smoked fish', emoji: '🐟', icon: require('../../assets/icons/meals/meal-fish-chips.png'), description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'saltedFish', name: 'Salted fish', emoji: '🧂', icon: require('../../assets/icons/magic/part-fish-head.png'), description: '4 supply points.', slot: 'provision', supply: 4 },
  { id: 'pemmican', name: 'Pemmican', emoji: '🥩', icon: require('../../assets/icons/alchemy/food-bread-block.png'), description: '5 supply points.', slot: 'provision', supply: 5 },
  { id: 'huntersStew', name: 'Hunter’s stew', emoji: '🍲', icon: require('../../assets/icons/meals/stew-hearty.png'), description: 'Heals 15% of max HP before the boss.', slot: 'provision', meal: { kind: 'bossHeal', pct: meals.stewHeal } },
  { id: 'scholarsPorridge', name: 'Scholar’s porridge', emoji: '🥣', icon: require('../../assets/icons/tavern/bowl-porridge.png'), description: '+15% XP.', slot: 'provision', meal: { kind: 'xp', multiplier: meals.porridgeXp } },
  { id: 'merchantsPie', name: 'Merchant’s pie', emoji: '🥧', icon: require('../../assets/icons/meals/pie-meat.png'), description: '+15% gold.', slot: 'provision', meal: { kind: 'gold', multiplier: meals.pieGold } },
  { id: 'quickBites', name: 'Quick bites', emoji: '🥪', icon: require('../../assets/icons/meals/meal-sandwich.png'), description: '−10% expedition time.', slot: 'provision', meal: { kind: 'duration', multiplier: meals.quickBitesDuration } },
  { id: 'comfortBroth', name: 'Comfort broth', emoji: '🍵', icon: require('../../assets/icons/meals/soup-herb-broth.png'), description: 'Better rewards after a retreat or defeat.', slot: 'provision', meal: { kind: 'retreat', bonus: meals.brothRetreat } },
  { id: 'heartyRoast', name: 'Hearty roast', emoji: '🍖', icon: require('../../assets/icons/meals/meal-roast-beef-greens.png'), description: '+10% max HP for the party.', slot: 'provision', meal: { kind: 'maxHp', multiplier: meals.roastHp } },
  { id: 'honeyCakes', name: 'Honey cakes', emoji: '🍯', icon: require('../../assets/icons/meals/flan-caramel.png'), description: '+25% from opportunities.', slot: 'provision', meal: { kind: 'opportunity', multiplier: meals.honeyOpportunity } },
  { id: 'spicedSkewers', name: 'Spiced skewers', emoji: '🍢', icon: require('../../assets/icons/meals/meal-grilled-sausages.png'), description: '+1 Speed for the party.', slot: 'provision', meal: { kind: 'speed', add: meals.skewersSpeed } },
  { id: 'mushroomRisotto', name: 'Mushroom risotto', emoji: '🍚', icon: require('../../assets/icons/magic/bowl-mushrooms.png'), description: '+10% Resistance for the party.', slot: 'provision', meal: { kind: 'resistance', multiplier: meals.risottoResistance } },
  { id: 'grilledTrout', name: 'Grilled trout', emoji: '🍤', icon: require('../../assets/icons/meals/meal-salmon-salad.png'), description: '+10% critical hit chance for the party.', slot: 'provision', meal: { kind: 'crit', add: meals.troutCrit } },
  { id: 'fishermansChowder', name: 'Fisherman’s chowder', emoji: '🥘', icon: require('../../assets/icons/meals/soup-chowder.png'), description: 'Halves the Element and Poison penalties.', slot: 'provision', meal: { kind: 'penaltyCut', threats: ['element', 'poison'], multiplier: meals.chowderCut } },

  // Utilities: used by the player from the stock, on the map or at home.
  { id: 'foragersTonic', name: 'Forager’s tonic', emoji: '🍃', icon: require('../../assets/icons/alchemy/potion-light-green.png'), description: 'Auto-gather reaches 10 m further for 30 minutes.', slot: 'utility', walk: 'forage' },
  { id: 'huntersMusk', name: 'Hunter’s musk', emoji: '🦌', icon: require('../../assets/icons/alchemy/bottle-oil.png'), description: 'Animals gather around you for 15 minutes.', slot: 'utility', walk: 'musk' },
  { id: 'prospectorsDraught', name: 'Prospector’s draught', emoji: '🪙', icon: require('../../assets/icons/alchemy/potion-amber.png'), description: 'Ore nodes give 1 more for 30 minutes.', slot: 'utility', walk: 'prospect' },
  { id: 'trackersEye', name: 'Tracker’s eye', emoji: '👁️', icon: require('../../assets/icons/magic/charm-void-eye.png'), description: 'Patrols and rare ore show from twice as far for 30 minutes.', slot: 'utility', walk: 'track' },
  { id: 'herbalPoultice', name: 'Herbal poultice', emoji: '🌱', icon: require('../../assets/icons/alchemy/mortar-herbs.png'), description: 'Heals 25% of max HP at home.', slot: 'utility', homeCare: { kind: 'heal', share: healthRules.poulticeHeal } },
  { id: 'restorativeTonic', name: 'Restorative tonic', emoji: '💖', icon: require('../../assets/icons/alchemy/potion-pink.png'), description: 'Heals fully at home.', slot: 'utility', homeCare: { kind: 'heal', share: 1 } },
  { id: 'calmingTea', name: 'Calming tea', emoji: '🫖', icon: require('../../assets/icons/tavern/mug-herb-brew.png'), description: 'Ends exhaustion at home.', slot: 'utility', homeCare: { kind: 'rest' } },

  // Debug trinket: never crafted or dropped.
  testCharm,

  ...gear,
  ...workToolGear,
  ...trinkets,
];
