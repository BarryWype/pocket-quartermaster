// Families: team tags counted across the party to unlock set bonuses
// (doc/design/families/).

import type { ImageSourcePropType } from 'react-native';

import type { ThreatId } from '@/game/types';

export type FamilyId =
  | 'faith'
  | 'wild'
  | 'watch'
  | 'cunning'
  | 'venom'
  | 'warding'
  | 'breaker'
  | 'bulwark'
  | 'bloodrage'
  | 'shadow'
  | 'volley'
  | 'spellweave'
  | 'pack'
  | 'rally'
  | 'plunder';

/** The threat a threat family answers. */
export type FamilyThreat = ThreatId;

export type FamilyDef = {
  id: FamilyId;
  name: string;
  kind: 'threat' | 'playstyle';
  /** Only threat families: the threat they answer. */
  answers?: FamilyThreat;
  emoji: string;
  icon: ImageSourcePropType;
};

export const families: FamilyDef[] = [
  { id: 'faith', name: 'Faith', kind: 'threat', answers: 'holy', emoji: '✨', icon: require('../../assets/icons/abilities-scaled/holy-star.png') },
  { id: 'wild', name: 'Wild', kind: 'threat', answers: 'beasts', emoji: '🐺', icon: require('../../assets/icons/abilities-scaled/bull-head.png') },
  { id: 'watch', name: 'Watch', kind: 'threat', answers: 'darkness', emoji: '👁️', icon: require('../../assets/icons/abilities-scaled/stone-tower.png') },
  { id: 'cunning', name: 'Cunning', kind: 'threat', answers: 'traps', emoji: '🪤', icon: require('../../assets/icons/relics/lockpicks.png') },
  { id: 'venom', name: 'Venom', kind: 'threat', answers: 'poison', emoji: '🧪', icon: require('../../assets/icons/abilities-scaled/poison-net.png') },
  { id: 'warding', name: 'Warding', kind: 'threat', answers: 'element', emoji: '🔰', icon: require('../../assets/icons/abilities-scaled/ice-shield.png') },
  { id: 'breaker', name: 'Breaker', kind: 'threat', answers: 'armoured', emoji: '🔨', icon: require('../../assets/icons/abilities-scaled/war-hammer.png') },
  { id: 'bulwark', name: 'Bulwark', kind: 'playstyle', emoji: '🛡️', icon: require('../../assets/icons/abilities-scaled/bronze-shield.png') },
  { id: 'bloodrage', name: 'Bloodrage', kind: 'playstyle', emoji: '🩸', icon: require('../../assets/icons/abilities-scaled/red-slashes.png') },
  { id: 'shadow', name: 'Shadow', kind: 'playstyle', emoji: '🌑', icon: require('../../assets/icons/abilities-scaled/crossed-daggers.png') },
  { id: 'volley', name: 'Volley', kind: 'playstyle', emoji: '🏹', icon: require('../../assets/icons/abilities-scaled/arrow-strike.png') },
  { id: 'spellweave', name: 'Spellweave', kind: 'playstyle', emoji: '🌀', icon: require('../../assets/icons/abilities-scaled/water-vortex.png') },
  { id: 'pack', name: 'Pack', kind: 'playstyle', emoji: '🐾', icon: require('../../assets/icons/abilities-scaled/bat-moon.png') },
  { id: 'rally', name: 'Rally', kind: 'playstyle', emoji: '📯', icon: require('../../assets/icons/abilities-scaled/hanging-banner.png') },
  { id: 'plunder', name: 'Plunder', kind: 'playstyle', emoji: '💰', icon: require('../../assets/icons/abilities-scaled/golden-chalice.png') },
];

export const familyById = Object.fromEntries(families.map((family) => [family.id, family])) as Record<FamilyId, FamilyDef>;

/** The family that answers a threat. */
export function familyOfThreat(threatId: ThreatId): FamilyId {
  return families.find((family) => family.answers === threatId)!.id;
}

/** Tag counts a family's levels are reached at (2, 4 and 6). */
export const familyRules = { levels: [2, 4, 6] };

/** A family effect that fired, for the log: the family and level, with a suffix when one level has two parts. */
export type FamilyEffectId =
  | 'faith1'
  | 'faith2'
  | 'faith3'
  | 'wild1'
  | 'wild2'
  | 'wild3'
  | 'cunning1'
  | 'cunning2'
  | 'cunning3'
  | 'watch1'
  | 'watch2'
  | 'watch3'
  | 'watch3Crit'
  | 'spellweave3Late'
  | 'rally3Damage'
  | 'warding1'
  | 'warding2'
  | 'warding3'
  | 'breaker1'
  | 'breaker2'
  | 'breaker3'
  | 'bulwark1'
  | 'bulwark2'
  | 'bulwark3'
  | 'bloodrage1'
  | 'bloodrage2'
  | 'bloodrage3'
  | 'shadow1'
  | 'shadow2'
  | 'shadow3'
  | 'volley1'
  | 'volley2'
  | 'volley3'
  | 'venom1'
  | 'venom2'
  | 'venom3'
  | 'pack1'
  | 'pack2'
  | 'pack3'
  | 'spellweave1'
  | 'spellweave2'
  | 'spellweave3'
  | 'rally1'
  | 'rally2'
  | 'rally3'
  | 'plunder1'
  | 'plunder2'
  | 'plunder3';

/** The numbers behind the family effects in fights (see game/expeditions/familyEffects.ts). */
export const familyEffectRules = {
  /** Damage against these tags; the share of every hit's damage healed, against any enemy (level 2); the HP share the run's first knockout gets back up at (level 3). */
  faith: { vsTags: ['undead', 'spirit'] as string[], damage: 1.05, healShare: 0.04, revivePct: 0.15 },
  /** Damage taken from these tags; after a won fight against them, the party's heal and the monster parts found (level 2). */
  wild: { fromTags: ['beast'] as string[], damageTaken: 0.9, healShare: 0.05, part: 'fangOrHorn', parts: 1 },
  /** The share of its max HP a random enemy loses to a trap as each fight starts; the time a dungeon expedition saves (level 2); extra loot rolls from every hidden cache step, Hidden cache and Sealed vault (level 3). */
  cunning: { trapHit: 0.1, timeCut: 0.15, cacheRolls: 1 },
  /** Speed added in round 1; regular fights ambushed per run, the weakest first: their enemies lose their first turn (level 2); crit chance added against elites. */
  watch: { firstRoundSpeed: 4, ambushedFights: 1, eliteCrit: 0.1 },
  /** Elemental hits taken are multiplied; each fight's first elemental hit is multiplied again (level 2); a share of the elemental damage taken is reflected (level 3). */
  warding: { elementalTaken: 0.92, firstHitTaken: 0.75, reflect: 0.1 },
  /** Party damage and the share of enemy armour ignored (level 1); the chance a crit staggers, once per enemy and fight (level 2); the damage of each fight's first hit, and the armour it shreds (level 3). */
  breaker: { damage: 1.03, armourIgnore: 0.1, staggerChance: 0.3, firstHit: 1.5, shred: 0.3 },
  /** The front hero's damage taken; the share of the weakest ally's hits the front hero takes; the share of each fight's first hit the party still takes (level 3). */
  bulwark: { frontTaken: 0.9, guardShare: 0.35, firstHitTaken: 0.65 },
  /** Damage below this HP share; the heal on each kill (level 2); the HP share below which a hero attacks twice, once per fight (level 3). */
  bloodrage: { belowHp: 0.5, damage: 1.2, healOnKill: 0.08, extraBelowHp: 0.45 },
  /** Crit chance in round 1; Evasion points added; a counter's share of a normal hit; the chance each fight's weakest enemy is struck down (level 3). */
  shadow: { firstRoundCrit: 0.25, evasion: 6, counterShare: 0.3, strikeChance: 0.45 },
  /** The weapons that count as ranged, and their heroes' damage (level 1). */
  volley: { gearTypes: ['bow', 'crossbow', 'throwing'] as string[], damage: 1.05 },
  /** The chance a hit poisons, on top of any Venomous affix; a Venomous poison's share of the hit, its rounds, the stacks an enemy carries (base, and with Venom 2) and each stack's share with Venom 2; damage taken by poisoned enemies with Venom 3. */
  venom: { poisonChance: 0.2, dotShare: 0.3, dotRounds: 3, baseStacks: 1, maxStacks: 3, stackShare: 0.5, poisonedTaken: 1.2 },
  /** Magic damage added each round of a fight, up to the max; an elemental hit's share that jumps to a second enemy (level 2); magic damage from round 2, and the scale on the wheel's advantage bonus: its +50% becomes +75% (level 3). */
  spellweave: { perRound: 0.025, max: 0.125, chainShare: 0.4, lateDamage: 1.1, advantageScale: 1.5 },
  /** The spirit hound each fight: its share of the carrier's hit and its rounds (one at level 1, a second at level 3); every summon's extra rounds and damage (level 2). */
  pack: { houndShare: 0.35, houndRounds: 2, extraRounds: 1, damage: 1.25 },
  /** Party damage; the party's heal between fights (level 2); more party damage and extra uses of every special per run (level 3). */
  rally: { damage: 1.05, healShare: 0.08, lateDamage: 1.05, extraSpecialUses: 1 },
  /** The run's gold; monster parts per won fight (level 2); rarity steps on gear loot (level 3). */
  plunder: { gold: 1.1, partsPerFight: 1, raritySteps: 1 },
};
