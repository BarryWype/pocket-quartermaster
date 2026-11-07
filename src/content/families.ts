// Families: team tags counted across the party to unlock set bonuses
// (doc/design/families/).

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
};

export const families: FamilyDef[] = [
  { id: 'faith', name: 'Faith', kind: 'threat', answers: 'holy', emoji: '✨' },
  { id: 'wild', name: 'Wild', kind: 'threat', answers: 'beasts', emoji: '🐺' },
  { id: 'watch', name: 'Watch', kind: 'threat', answers: 'darkness', emoji: '👁️' },
  { id: 'cunning', name: 'Cunning', kind: 'threat', answers: 'traps', emoji: '🪤' },
  { id: 'venom', name: 'Venom', kind: 'threat', answers: 'poison', emoji: '🧪' },
  { id: 'warding', name: 'Warding', kind: 'threat', answers: 'element', emoji: '🔰' },
  { id: 'breaker', name: 'Breaker', kind: 'threat', answers: 'armoured', emoji: '🔨' },
  { id: 'bulwark', name: 'Bulwark', kind: 'playstyle', emoji: '🛡️' },
  { id: 'bloodrage', name: 'Bloodrage', kind: 'playstyle', emoji: '🩸' },
  { id: 'shadow', name: 'Shadow', kind: 'playstyle', emoji: '🌑' },
  { id: 'volley', name: 'Volley', kind: 'playstyle', emoji: '🏹' },
  { id: 'spellweave', name: 'Spellweave', kind: 'playstyle', emoji: '🌀' },
  { id: 'pack', name: 'Pack', kind: 'playstyle', emoji: '🐾' },
  { id: 'rally', name: 'Rally', kind: 'playstyle', emoji: '📯' },
  { id: 'plunder', name: 'Plunder', kind: 'playstyle', emoji: '💰' },
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
  | 'wild1'
  | 'watch1'
  | 'watch2'
  | 'watch3'
  | 'watch3Crit'
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
  | 'shadow1'
  | 'shadow2'
  | 'shadow3'
  | 'volley1'
  | 'volley2'
  | 'venom1'
  | 'venom2'
  | 'venom3'
  | 'spellweave1'
  | 'spellweave2'
  | 'spellweave3'
  | 'rally1';

/** The numbers behind the family effects in fights (see game/expeditions/familyEffects.ts). */
export const familyEffectRules = {
  faith: { vsTags: ['undead', 'spirit'] as string[], damage: 1.1 },
  wild: { fromTags: ['beast'] as string[], damageTaken: 0.9 },
  /** Speed added in round 1; crit chance added against elites. */
  watch: { firstRoundSpeed: 3, eliteCrit: 0.1 },
  /** Elemental hits taken are multiplied; a share of the elemental damage taken is reflected. */
  warding: { elementalTaken: 0.85, reflect: 0.2 },
  /** Shares of the enemy armour ignored, and shredded by the first hit of a fight. */
  breaker: { armourIgnore: 0.1, shred: 0.3 },
  /** The front hero's damage taken; the share of the weakest ally's hits the front hero takes. */
  bulwark: { frontTaken: 0.85, guardShare: 0.5 },
  bloodrage: { belowHp: 0.5, damage: 1.2 },
  /** Crit chance in round 1; Evasion points added; a counter's share of a normal hit. */
  shadow: { firstRoundCrit: 0.15, evasion: 10, counterShare: 0.5 },
  /** The weapons that count as ranged, and the share of armour their hits ignore. */
  volley: { gearTypes: ['bow', 'crossbow', 'throwing'] as string[], armourIgnore: 0.2 },
  /** Poison wounds taken after a fight; a Venomous poison's share of the hit, its rounds, the stacks an enemy carries (base, and with Venom 2); damage taken by poisoned enemies with Venom 3. */
  venom: { woundsTaken: 0.5, dotShare: 0.1, dotRounds: 3, baseStacks: 1, maxStacks: 3, poisonedTaken: 1.2 },
  /** Magic damage added each round of a fight, up to the max; an elemental hit's share that jumps to a second enemy; the scale on the wheel's advantage bonus. */
  spellweave: { perRound: 0.05, max: 0.25, chainShare: 0.3, advantageScale: 2 },
  rally: { damage: 1.1 },
};
