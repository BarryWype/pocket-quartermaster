import type { GearDef, ItemDef } from '@/game/types';

import { gearItemStats } from '@/game/equipment/budget';

import { GEAR_SLOTS, gearId, gearNames, gearProfiles, testCharm } from './equipment';
import { healthRules } from './health';
import { provisionRules } from './provisions';

const { meals, charms, elixirs } = provisionRules;

export const MATERIAL_TIERS = [
  { id: 'wood', name: 'Wooden' },
  { id: 'stone', name: 'Stone' },
  { id: 'copper', name: 'Copper' },
  { id: 'iron', name: 'Iron' },
  { id: 'steel', name: 'Steel' },
];

/** Types that keep their drawn icons (sword, bow, wand), one per material tier. */
const GEAR_ICONS: Partial<Record<keyof typeof gearProfiles, GearDef['icon'][]>> = {
  sword: [
    require('../../assets/icons/scaled/sword-wood.png'),
    require('../../assets/icons/scaled/sword-stone.png'),
    require('../../assets/icons/scaled/sword-copper.png'),
    require('../../assets/icons/scaled/sword-iron.png'),
    require('../../assets/icons/scaled/sword-steel.png'),
  ],
  bow: [
    require('../../assets/icons/scaled/bow-wood.png'),
    require('../../assets/icons/scaled/bow-stone.png'),
    require('../../assets/icons/scaled/bow-copper.png'),
    require('../../assets/icons/scaled/bow-iron.png'),
    require('../../assets/icons/scaled/bow-steel.png'),
  ],
  wand: [
    require('../../assets/icons/scaled/wand-wood.png'),
    require('../../assets/icons/scaled/wand-stone.png'),
    require('../../assets/icons/scaled/wand-copper.png'),
    require('../../assets/icons/scaled/wand-iron.png'),
    require('../../assets/icons/scaled/wand-steel.png'),
  ],
};

/** One item per gear type and tier (110 pieces), stats from the budget maths. */
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
  // below the HP threshold, charms help for the whole run, and what never
  // triggered is broken back down (see threats/salvage.ts).
  { id: 'healingPotion', name: 'Minor healing potion', emoji: '🧪', description: 'Heals 30% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.minor, when: 'lowHp' },
  { id: 'standardHealingPotion', name: 'Healing potion', emoji: '🧪', description: 'Heals 50% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.standard, when: 'lowHp' },
  { id: 'greaterHealingPotion', name: 'Greater healing potion', emoji: '🧪', description: 'Heals 70% of max HP when badly hurt.', slot: 'consumable', heal: healthRules.potionHeal.greater, when: 'lowHp' },
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
  { id: 'healersSatchel', name: 'Healer’s satchel', emoji: '🩹', description: 'Theriac, bandages and a stone mortar.', slot: 'consumable', kit: { threats: ['poison'], keywords: ['antidote'], heal: 0.1 } },
  { id: 'giftBasket', name: 'Gift basket', emoji: '🎁', description: 'Honey cakes, smoked meat and a carved stone trinket.', slot: 'consumable', kit: { threats: ['locals'], approach: 'presence' } },
  { id: 'lantern', name: 'Lantern', emoji: '🏮', description: 'A shuttered tallow lantern and bells.', slot: 'consumable', kit: { threats: ['darkness', 'ambush'], keywords: ['light', 'watchful'] } },
  { id: 'holyRelics', name: 'Holy relics', emoji: '🕯️', description: 'Holy water in a copper vial and warding salt.', slot: 'consumable', kit: { threats: ['desecrated', 'casters'], approach: 'faith' } },
  { id: 'blessedRelics', name: 'Blessed relics', emoji: '✨', description: 'Holy relics blessed at a chapel: +3 Faith.', slot: 'consumable', kit: { threats: ['desecrated', 'casters'], approach: 'faith', bonus: 3 } },
  { id: 'scholarsSatchel', name: 'Scholar’s satchel', emoji: '📚', description: 'A cipher wheel, lampblack ink, thread and chalk.', slot: 'consumable', kit: { threats: ['puzzle', 'maze'], approach: 'wits' } },

  // Hero consumables, gone after the run like every one in a hero's slot.
  { id: 'strengthDraught', name: 'Strength draught', emoji: '💪', description: '+15% Power for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'power', multiplier: elixirs.power } },
  { id: 'arcaneTonic', name: 'Arcane tonic', emoji: '🔮', description: '+15% Magic for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'magic', multiplier: elixirs.magic } },
  { id: 'ironskinBrew', name: 'Ironskin brew', emoji: '🛡️', description: '+20% Armour for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'armour', multiplier: elixirs.armour } },
  { id: 'nullrootTincture', name: 'Nullroot tincture', emoji: '🌿', description: '+20% Resistance for the run.', slot: 'consumable', elixir: { kind: 'stat', stat: 'resistance', multiplier: elixirs.resistance } },
  { id: 'quicksilver', name: 'Quicksilver', emoji: '🌀', description: '+2 Speed for the run.', slot: 'consumable', elixir: { kind: 'speed', add: elixirs.quicksilverSpeed } },
  { id: 'firebomb', name: 'Firebomb', emoji: '💣', description: 'Opens the first fight with fire damage to every enemy.', slot: 'consumable', elixir: { kind: 'firebomb', damage: elixirs.firebombDamage } },
  { id: 'emberOil', name: 'Ember oil', emoji: '🔥', description: 'Infuses the weapon with fire for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'fire' } },
  { id: 'tideOil', name: 'Tide oil', emoji: '💧', description: 'Infuses the weapon with water for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'water' } },
  { id: 'stormOil', name: 'Storm oil', emoji: '⚡', description: 'Infuses the weapon with lightning for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'electric' } },
  { id: 'stoneOil', name: 'Stone oil', emoji: '🪨', description: 'Infuses the weapon with stone for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'stone' } },
  { id: 'thornOil', name: 'Thorn oil', emoji: '🌵', description: 'Infuses the weapon with thorns for one run.', slot: 'consumable', elixir: { kind: 'oil', element: 'grass' } },
  { id: 'smokeBomb', name: 'Smoke bomb', emoji: '💨', description: 'Instead of a knock-out, the party escapes with more loot.', slot: 'consumable', elixir: { kind: 'smokeBomb', retreatBonus: elixirs.smokeBombRetreat } },
  { id: 'revivalDraught', name: 'Revival draught', emoji: '✨', description: 'Once per run, gets back up at 30% HP when knocked out.', slot: 'consumable', elixir: { kind: 'revive', hp: elixirs.reviveHp } },

  // Boss weakness items, bought at map places and used up when the run meets
  // their boss.
  { id: 'wantedPoster', name: 'His own wanted poster', emoji: '📜', description: 'Half the bandit captain’s men desert: −25% HP.', slot: 'consumable', weakness: 'banditCaptain' },
  { id: 'strongAle', name: 'A cask of strong ale', emoji: '🍺', description: 'The ogre chieftain fights drunk: −30% damage.', slot: 'consumable', weakness: 'ogreChieftain' },
  { id: 'fontWater', name: 'Water from a chapel font', emoji: '⛲', description: 'The lich of the deep loses 25% HP and never enrages.', slot: 'consumable', weakness: 'lichOfTheDeep' },
  { id: 'sleepingDraught', name: 'A sleeping draught', emoji: '💤', description: 'The giant king starts asleep: two free rounds.', slot: 'consumable', weakness: 'giantKing' },
  { id: 'decoyHoard', name: 'A decoy hoard', emoji: '💰', description: 'The elder dragon guards it instead of sweeping the party.', slot: 'consumable', weakness: 'elderDragon' },

  // Provisions, taken by the whole party. Supply is needed for every
  // expedition; a meal is optional.
  { id: 'trailMix', name: 'Trail mix', emoji: '🥜', description: '2 supply points.', slot: 'provision', supply: 2 },
  { id: 'jerky', name: 'Jerky', emoji: '🥓', description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'smokedFish', name: 'Smoked fish', emoji: '🐟', description: '3 supply points.', slot: 'provision', supply: 3 },
  { id: 'saltedFish', name: 'Salted fish', emoji: '🧂', description: '4 supply points.', slot: 'provision', supply: 4 },
  { id: 'pemmican', name: 'Pemmican', emoji: '🥩', description: '5 supply points.', slot: 'provision', supply: 5 },
  { id: 'huntersStew', name: 'Hunter’s stew', emoji: '🍲', description: 'Heals 15% of max HP before the boss.', slot: 'provision', meal: { kind: 'bossHeal', pct: meals.stewHeal } },
  { id: 'scholarsPorridge', name: 'Scholar’s porridge', emoji: '🥣', description: '+15% XP.', slot: 'provision', meal: { kind: 'xp', multiplier: meals.porridgeXp } },
  { id: 'merchantsPie', name: 'Merchant’s pie', emoji: '🥧', description: '+15% gold.', slot: 'provision', meal: { kind: 'gold', multiplier: meals.pieGold } },
  { id: 'quickBites', name: 'Quick bites', emoji: '🥪', description: '−10% expedition time.', slot: 'provision', meal: { kind: 'duration', multiplier: meals.quickBitesDuration } },
  { id: 'comfortBroth', name: 'Comfort broth', emoji: '🍵', description: 'Better rewards after a retreat or defeat.', slot: 'provision', meal: { kind: 'retreat', bonus: meals.brothRetreat } },
  { id: 'heartyRoast', name: 'Hearty roast', emoji: '🍖', description: '+10% max HP for the party.', slot: 'provision', meal: { kind: 'maxHp', multiplier: meals.roastHp } },
  { id: 'honeyCakes', name: 'Honey cakes', emoji: '🍯', description: '+25% from opportunities.', slot: 'provision', meal: { kind: 'opportunity', multiplier: meals.honeyOpportunity } },
  { id: 'spicedSkewers', name: 'Spiced skewers', emoji: '🍢', description: '+1 Speed for the party.', slot: 'provision', meal: { kind: 'speed', add: meals.skewersSpeed } },
  { id: 'mushroomRisotto', name: 'Mushroom risotto', emoji: '🍚', description: '+10% Resistance for the party.', slot: 'provision', meal: { kind: 'resistance', multiplier: meals.risottoResistance } },
  { id: 'grilledTrout', name: 'Grilled trout', emoji: '🍤', description: '+10% critical hit chance for the party.', slot: 'provision', meal: { kind: 'crit', add: meals.troutCrit } },
  { id: 'fishermansChowder', name: 'Fisherman’s chowder', emoji: '🥘', description: 'Halves the Underwater and Poison penalties.', slot: 'provision', meal: { kind: 'penaltyCut', threats: ['underwater', 'poison'], multiplier: meals.chowderCut } },

  // Utilities: used by the player from the stock, on the map or at home.
  { id: 'foragersTonic', name: 'Forager’s tonic', emoji: '🍃', description: 'Auto-gather reaches 10 m further for 30 minutes.', slot: 'utility', walk: 'forage' },
  { id: 'huntersMusk', name: 'Hunter’s musk', emoji: '🦌', description: 'Animals gather around you for 15 minutes.', slot: 'utility', walk: 'musk' },
  { id: 'prospectorsDraught', name: 'Prospector’s draught', emoji: '🪙', description: 'Ore nodes give 1 more for 30 minutes.', slot: 'utility', walk: 'prospect' },
  { id: 'trackersEye', name: 'Tracker’s eye', emoji: '👁️', description: 'Patrols and rare ore show from twice as far for 30 minutes.', slot: 'utility', walk: 'track' },
  { id: 'herbalPoultice', name: 'Herbal poultice', emoji: '🌱', description: 'Heals 25% of max HP at home.', slot: 'utility', homeCare: { kind: 'heal', share: healthRules.poulticeHeal } },
  { id: 'restorativeTonic', name: 'Restorative tonic', emoji: '💖', description: 'Heals fully at home.', slot: 'utility', homeCare: { kind: 'heal', share: 1 } },
  { id: 'calmingTea', name: 'Calming tea', emoji: '🫖', description: 'Ends exhaustion at home.', slot: 'utility', homeCare: { kind: 'rest' } },

  // Debug trinket: never crafted or dropped.
  testCharm,

  ...gear,
];
