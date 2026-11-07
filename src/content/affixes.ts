import type { Tag } from '@/game/types';
import { ELEMENTS, type Element } from '@/game/elements';

import { elementInfo } from '@/content/elements';
import { frElementQualifiers } from '@/content/fr/names';

// The affix catalogue of doc/design/gear/affixes.csv: what a monster part, an
// elemental stone or lucky looting adds to a piece of gear.

export type AffixSlot = 'weapon' | 'armourOffhand' | 'any';
export type AffixSource =
  | { kind: 'part'; partId: string }
  | { kind: 'element'; element: Element }
  | { kind: 'loot' };
export type AffixEffect =
  | { kind: 'damageVs'; tags: Tag[] }
  | { kind: 'damageFrom'; tags: Tag[] }
  | { kind: 'stat'; stat: 'speed' | 'evasion' | 'luck' }
  | { kind: 'poisonOnHit' } | { kind: 'dotDuration' } | { kind: 'fightShield' } | { kind: 'lastStand' }
  | { kind: 'magicDamageTaken' } | { kind: 'gold' } | { kind: 'xp' } | { kind: 'healOnKill' }
  | { kind: 'potionHealing' } | { kind: 'salvageValue' } | { kind: 'elementResistAll' } | { kind: 'firstRoundCrit' }
  | { kind: 'infused'; element: Element } | { kind: 'warding'; element: Element }
  | { kind: 'forage' } | { kind: 'gatherRadius' } | { kind: 'pocketYield' };
export type AffixDef = {
  id: string;
  name: string;
  nameFr: string;
  family: Tag | 'element' | 'keyword' | 'threat' | 'walking';
  source: AffixSource;
  slot: AffixSlot;
  effect: AffixEffect;
  /** Rolled value range in display units (15 = 15%, 1 = +1 Speed, 3 = 3 m); absent when fixed. */
  range?: { min: number; max: number };
  unit?: 'pct' | 'flat' | 'm';
  /** Counts once per party (gold) or once per roster (walking), at its best value. */
  scope?: 'party' | 'roster';
};

export const affixes: AffixDef[] = [
  // Monster parts, family by family (id, effect and value from affixes.csv).
  {
    id: 'hunter',
    name: 'Hunter',
    nameFr: 'Chasseur',
    family: 'beast',
    source: { kind: 'part', partId: 'fangOrHorn' },
    slot: 'weapon',
    effect: { kind: 'damageVs', tags: ['beast'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'thickHide',
    name: 'Thick hide',
    nameFr: 'Peau épaisse',
    family: 'beast',
    source: { kind: 'part', partId: 'fangOrHorn' },
    slot: 'armourOffhand',
    effect: { kind: 'damageFrom', tags: ['beast'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'swift',
    name: 'Swift',
    nameFr: 'Rapide',
    family: 'bird',
    source: { kind: 'part', partId: 'feather' },
    slot: 'weapon',
    effect: { kind: 'stat', stat: 'speed' },
    range: { min: 1, max: 3 },
    unit: 'flat',
  },
  {
    id: 'light',
    name: 'Light',
    nameFr: 'Léger',
    family: 'bird',
    source: { kind: 'part', partId: 'feather' },
    slot: 'armourOffhand',
    effect: { kind: 'stat', stat: 'evasion' },
    range: { min: 2, max: 6 },
    unit: 'pct',
  },
  {
    id: 'venomous',
    name: 'Venomous',
    nameFr: 'Venimeux',
    family: 'vermin',
    source: { kind: 'part', partId: 'venomSac' },
    slot: 'weapon',
    effect: { kind: 'poisonOnHit' },
    range: { min: 10, max: 25 },
    unit: 'pct',
  },
  {
    id: 'antivenom',
    name: 'Antivenom',
    nameFr: 'Antivenin',
    family: 'vermin',
    source: { kind: 'part', partId: 'venomSac' },
    slot: 'armourOffhand',
    effect: { kind: 'dotDuration' },
    range: { min: 30, max: 60 },
    unit: 'pct',
  },
  {
    id: 'sundering',
    name: 'Sundering',
    nameFr: 'Fracassant',
    family: 'carapace',
    source: { kind: 'part', partId: 'chitin' },
    slot: 'weapon',
    effect: { kind: 'damageVs', tags: ['carapace', 'construct'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    nameFr: 'Rempart',
    family: 'carapace',
    source: { kind: 'part', partId: 'chitin' },
    slot: 'armourOffhand',
    effect: { kind: 'fightShield' },
    range: { min: 3, max: 8 },
    unit: 'pct',
  },
  {
    id: 'hallowed',
    name: 'Hallowed',
    nameFr: 'Béni',
    family: 'undead',
    source: { kind: 'part', partId: 'graveDust' },
    slot: 'weapon',
    effect: { kind: 'damageVs', tags: ['undead'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'unyielding',
    name: 'Unyielding',
    nameFr: 'Inflexible',
    family: 'undead',
    source: { kind: 'part', partId: 'graveDust' },
    slot: 'armourOffhand',
    effect: { kind: 'lastStand' },
    range: { min: 50, max: 100 },
    unit: 'pct',
  },
  {
    id: 'spectral',
    name: 'Spectral',
    nameFr: 'Spectral',
    family: 'spirit',
    source: { kind: 'part', partId: 'ectoplasm' },
    slot: 'weapon',
    effect: { kind: 'damageVs', tags: ['spirit'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'spiritWard',
    name: 'Spirit ward',
    nameFr: 'Protection spirituelle',
    family: 'spirit',
    source: { kind: 'part', partId: 'ectoplasm' },
    slot: 'armourOffhand',
    effect: { kind: 'magicDamageTaken' },
    range: { min: 8, max: 20 },
    unit: 'pct',
  },
  {
    id: 'plunderer',
    name: 'Plunderer',
    nameFr: 'Pillard',
    family: 'goblinoid',
    source: { kind: 'part', partId: 'goblinEar' },
    slot: 'weapon',
    effect: { kind: 'gold' },
    range: { min: 5, max: 15 },
    unit: 'pct',
    scope: 'party',
  },
  {
    id: 'lucky',
    name: 'Lucky',
    nameFr: 'Chanceux',
    family: 'goblinoid',
    source: { kind: 'part', partId: 'goblinEar' },
    slot: 'armourOffhand',
    effect: { kind: 'stat', stat: 'luck' },
    range: { min: 1, max: 4 },
    unit: 'flat',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    nameFr: 'Vétéran',
    family: 'humanoid',
    source: { kind: 'part', partId: 'tatteredInsignia' },
    slot: 'weapon',
    effect: { kind: 'xp' },
    range: { min: 10, max: 25 },
    unit: 'pct',
  },
  {
    id: 'soldiers',
    name: "Soldier's",
    nameFr: 'De soldat',
    family: 'humanoid',
    source: { kind: 'part', partId: 'tatteredInsignia' },
    slot: 'armourOffhand',
    effect: { kind: 'damageFrom', tags: ['humanoid'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'bloodthirsty',
    name: 'Bloodthirsty',
    nameFr: 'Sanguinaire',
    family: 'brute',
    source: { kind: 'part', partId: 'bruteBlood' },
    slot: 'weapon',
    effect: { kind: 'healOnKill' },
    range: { min: 2, max: 5 },
    unit: 'pct',
  },
  {
    id: 'potionAffinity',
    name: 'Potion affinity',
    nameFr: 'Affinité aux potions',
    family: 'brute',
    source: { kind: 'part', partId: 'bruteBlood' },
    slot: 'armourOffhand',
    effect: { kind: 'potionHealing' },
    range: { min: 15, max: 35 },
    unit: 'pct',
  },
  {
    id: 'tinkered',
    name: 'Tinkered',
    nameFr: 'Bricolé',
    family: 'construct',
    source: { kind: 'part', partId: 'cog' },
    slot: 'weapon',
    effect: { kind: 'salvageValue' },
    range: { min: 20, max: 50 },
    unit: 'pct',
  },
  {
    id: 'reinforced',
    name: 'Reinforced',
    nameFr: 'Renforcé',
    family: 'construct',
    source: { kind: 'part', partId: 'cog' },
    slot: 'armourOffhand',
    effect: { kind: 'damageFrom', tags: ['construct', 'brute'] },
    range: { min: 10, max: 25 },
    unit: 'pct',
  },
  {
    id: 'dragonSlayer',
    name: 'Dragon-slayer',
    nameFr: 'Tueur de dragons',
    family: 'dragon',
    source: { kind: 'part', partId: 'scale' },
    slot: 'weapon',
    effect: { kind: 'damageVs', tags: ['dragon'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },
  {
    id: 'dragonhide',
    name: 'Dragonhide',
    nameFr: 'Peau de dragon',
    family: 'dragon',
    source: { kind: 'part', partId: 'scale' },
    slot: 'armourOffhand',
    effect: { kind: 'elementResistAll' },
    range: { min: 5, max: 12 },
    unit: 'pct',
  },
  {
    id: 'opener',
    name: 'Opener',
    nameFr: 'Premier coup',
    family: 'caster',
    source: { kind: 'part', partId: 'ritualCandle' },
    slot: 'weapon',
    effect: { kind: 'firstRoundCrit' },
    range: { min: 10, max: 25 },
    unit: 'pct',
  },
  {
    id: 'nullAffix',
    name: 'Null',
    nameFr: 'Nul',
    family: 'caster',
    source: { kind: 'part', partId: 'ritualCandle' },
    slot: 'armourOffhand',
    effect: { kind: 'damageFrom', tags: ['caster'] },
    range: { min: 15, max: 30 },
    unit: 'pct',
  },

  // Elemental stones: Infused on offensive pieces, Warding on defensive ones.
  ...ELEMENTS.map((element): AffixDef => ({
    id: `infused${element[0].toUpperCase()}${element.slice(1)}`,
    name: `${elementInfo[element].name}-infused`,
    nameFr: `Infusé ${frElementQualifiers[element]}`,
    family: 'element',
    source: { kind: 'element', element },
    slot: 'weapon',
    effect: { kind: 'infused', element },
  })),
  ...ELEMENTS.map((element): AffixDef => ({
    id: `warding${element[0].toUpperCase()}${element.slice(1)}`,
    name: `${elementInfo[element].name} warding`,
    nameFr: `Protection ${frElementQualifiers[element]}`,
    family: 'element',
    source: { kind: 'element', element },
    slot: 'armourOffhand',
    effect: { kind: 'warding', element },
    range: { min: 15, max: 30 },
    unit: 'pct',
  })),

  // Loot-only walking affixes, counted once per roster at their best value.
  {
    id: 'foragers',
    name: "Forager's",
    nameFr: 'Cueilleur',
    family: 'walking',
    source: { kind: 'loot' },
    slot: 'any',
    effect: { kind: 'forage' },
    range: { min: 5, max: 15 },
    unit: 'pct',
    scope: 'roster',
  },
  {
    id: 'wanderers',
    name: "Wanderer's",
    nameFr: 'Vagabond',
    family: 'walking',
    source: { kind: 'loot' },
    slot: 'any',
    effect: { kind: 'gatherRadius' },
    range: { min: 3, max: 8 },
    unit: 'm',
    scope: 'roster',
  },
  {
    id: 'pocket',
    name: 'Pocket',
    nameFr: 'Poche',
    family: 'walking',
    source: { kind: 'loot' },
    slot: 'any',
    effect: { kind: 'pocketYield' },
    range: { min: 5, max: 15 },
    unit: 'pct',
    scope: 'roster',
  },
];

export const affixById: Record<string, AffixDef> = Object.fromEntries(
  affixes.map((affix) => [affix.id, affix]),
);
