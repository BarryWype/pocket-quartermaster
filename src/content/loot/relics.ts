import type { ImageSourcePropType } from 'react-native';

import type { GearType, RelicEffect } from '@/game/types';

import type { FamilyId } from '@/content/families';

// The 25 relics of doc/design/loot/relics.csv: one-off items restored at the
// forge into a finished piece with their fixed effects.

export type RelicDef = {
  id: string;
  name: string;
  tier: number;
  gearType: GearType;
  effect: string;
  effects: RelicEffect[];
  /** A second team tag (see doc/design/families/), on about a third of the relics. */
  extraFamily?: FamilyId;
  sellPrice: number;
  icon: ImageSourcePropType;
};

const relic = (id: string, name: string, tier: number, gearType: GearType, effect: string, effects: RelicDef['effects'], icon: ImageSourcePropType): RelicDef => ({
  id,
  name,
  tier,
  gearType,
  effect,
  effects,
  sellPrice: 10 * tier,
  icon,
});

export const relics: RelicDef[] = [
  {
    ...relic('rustedSaintsBuckler', 'Rusted saint’s buckler', 1, 'buckler', 'A Faith tag for its carrier', [], require('../../../assets/icons/rpg/shield-iron-cross.png')),
    extraFamily: 'faith',
  },
  {
    ...relic('poachersLongbow', 'Poacher’s longbow', 1, 'bow', 'Double crit damage against beasts; a Cunning tag for its carrier', [
      { kind: 'critDamage', multiplier: 2, when: { tag: 'beast' } },
    ], require('../../../assets/icons/rpg/bow-knotted-wooden.png')),
    extraFamily: 'cunning',
  },
  relic('sextonsMace', 'Sexton’s mace', 1, 'mace', 'Stagger against undead', [
    { kind: 'keyword', keyword: 'stagger', when: { tag: 'undead' } },
  ], require('../../../assets/icons/rpg/mace-skull.png')),
  relic('ratcatchersKnuckles', 'Ratcatcher’s knuckles', 1, 'knuckles', 'Cleave in fights against vermin', [
    { kind: 'keyword', keyword: 'cleave', when: { tag: 'vermin' } },
  ], require('../../../assets/icons/rpg/gloves-padded-leather.png')),
  {
    ...relic('hedgeWitchsRobes', 'Hedge-witch’s robes', 1, 'robes', 'Halves the Poison penalty for its wearer; a Venom tag for its carrier', [
      { kind: 'penaltyCut', threat: 'poison', multiplier: 0.5 },
    ], require('../../../assets/icons/relics/robes-hedge-witch.png')),
    extraFamily: 'venom',
  },
  relic('smugglersCoat', 'Smuggler’s coat', 2, 'leather', 'Traps cost the party nothing', [
    { kind: 'cancelPenalty', threat: 'traps' },
  ], require('../../../assets/icons/rpg/armor-padded-leather.png')),
  relic('barrowKingsBlade', 'Barrow king’s blade', 2, 'sword', 'Heals the wielder when it kills an undead', [
    { kind: 'healOnKill', pct: 0.1, when: { tag: 'undead' } },
  ], require('../../../assets/icons/rpg/sword-ghost-blade.png')),
  {
    ...relic('wolfhoundSpear', 'Wolfhound spear', 2, 'spear', 'Reach against beasts; a Pack tag for its carrier', [
      { kind: 'keyword', keyword: 'reach', when: { tag: 'beast' } },
    ], require('../../../assets/icons/rpg/spear-barbed-steel.png')),
    extraFamily: 'pack',
  },
  relic('desertersMail', 'Deserter’s mail', 2, 'mail', 'Brace in the first fight', [
    { kind: 'keyword', keyword: 'brace', when: { firstFight: true } },
  ], require('../../../assets/icons/relics/armor-steel-belted.png')),
  relic('bogWitchsWand', 'Bog-witch’s wand', 2, 'wand', 'Channel against water enemies', [
    { kind: 'keyword', keyword: 'channel', when: { tag: 'water' } },
  ], require('../../../assets/icons/magic/wand-iron-crescent.png')),
  {
    ...relic('minersLampStaff', 'Miner’s lamp-staff', 3, 'staff', 'A second Watch tag for its carrier', [], require('../../../assets/icons/relics/staff-lamp.png')),
    extraFamily: 'watch',
  },
  relic('drownedBell', 'Drowned bell', 3, 'censer', 'The party ignores the Element penalty in the first fight', [
    { kind: 'ignorePenalty', threat: 'element', when: { firstFight: true } },
  ], require('../../../assets/icons/relics/censer-drowned.png')),
  {
    ...relic('dwarfLordsAxe', 'Dwarf-lord’s axe', 3, 'axe', 'Pierce against constructs; a Bulwark tag for its carrier', [
      { kind: 'keyword', keyword: 'pierce', when: { tag: 'construct' } },
    ], require('../../../assets/icons/rpg/axe-bearded-spike.png')),
    extraFamily: 'bulwark',
  },
  relic('witchHuntersDagger', 'Witch-hunter’s dagger', 3, 'dagger', 'Double crit damage against casters', [
    { kind: 'critDamage', multiplier: 2, when: { tag: 'caster' } },
  ], require('../../../assets/icons/rpg/dagger-blue-dirk.png')),
  {
    ...relic('thiefTakersQuiver', 'Thief-taker’s quiver', 3, 'quiver', 'Reach in Darkness fights; a Watch tag for its carrier', [
      { kind: 'keyword', keyword: 'reach', when: { threat: 'darkness' } },
    ], require('../../../assets/icons/rpg/crossbow-obsidian.png')),
    extraFamily: 'watch',
  },
  relic('orcWarlordsHammer', 'Orc warlord’s hammer', 4, 'warhammer', 'Stagger on every crit against Brutes', [
    { kind: 'staggerOnCrit', when: { tag: 'brute' } },
  ], require('../../../assets/icons/rpg/hammer-axe-hammer.png')),
  relic('clockworkAegis', 'Clockwork aegis', 4, 'shield', 'Guard; Brace against Brutes only', [
    { kind: 'keyword', keyword: 'brace', when: { tag: 'brute' } },
  ], require('../../../assets/icons/rpg/shield-silver-heater.png')),
  relic('sirensLute', 'Siren’s lute', 4, 'lute', 'Inspire in Element dungeons', [
    { kind: 'keyword', keyword: 'inspire', when: { threat: 'element' } },
  ], require('../../../assets/icons/relics/horn-curved.png')),
  {
    ...relic('cartographersFocus', 'Cartographer’s focus', 4, 'focus', 'A second Cunning tag for its carrier', [], require('../../../assets/icons/relics/orb-blue.png')),
    extraFamily: 'cunning',
  },
  relic('duelistsMainGauche', 'Duelist’s main-gauche', 4, 'offhandBlade', 'Parry against Brutes', [
    { kind: 'keyword', keyword: 'parry', when: { tag: 'brute' } },
  ], require('../../../assets/icons/rpg/sword-arrowhead-blade.png')),
  {
    ...relic('dragonbonePlate', 'Dragonbone plate', 5, 'plate', 'Immune to fire; a Warding tag for its carrier', [
      { kind: 'immune', element: 'fire', multiplier: 0.5 },
    ], require('../../../assets/icons/relics/armor-green-scale.png')),
    extraFamily: 'warding',
  },
  relic('archmagesTome', 'Archmage’s tome', 5, 'tome', 'Channel; the first spell of the first fight hits every enemy', [
    { kind: 'keyword', keyword: 'channel' },
    { kind: 'firstSpellAll' },
  ], require('../../../assets/icons/magic/book-open-blue.png')),
  relic('wyrmSlayersSword', 'Wyrm-slayer’s sword', 5, 'sword', 'Pierce against dragons', [
    { kind: 'keyword', keyword: 'pierce', when: { tag: 'dragon' } },
  ], require('../../../assets/icons/rpg/sword-runed-greatsword.png')),
  relic('stormcallersRobes', 'Stormcaller’s robes', 5, 'robes', 'Immune to electric', [
    { kind: 'immune', element: 'electric', multiplier: 0.5 },
  ], require('../../../assets/icons/relics/robes-stormcaller.png')),
  relic('titanBreakerGauntlets', 'Titan-breaker gauntlets', 5, 'knuckles', 'Stagger against constructs', [
    { kind: 'keyword', keyword: 'stagger', when: { tag: 'construct' } },
  ], require('../../../assets/icons/relics/gauntlet-steel-cuffed.png')),
];
