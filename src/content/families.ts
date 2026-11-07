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
