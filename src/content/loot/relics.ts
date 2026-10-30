import type { GearType, RelicEffect } from '@/game/types';

// The 25 relics of doc/design/loot/relics.csv: one-off items restored at the
// forge into a finished piece with their fixed effects.

export type RelicDef = {
  id: string;
  name: string;
  tier: number;
  gearType: GearType;
  effect: string;
  effects: RelicEffect[];
  sellPrice: number;
};

const relic = (id: string, name: string, tier: number, gearType: GearType, effect: string, effects: RelicDef['effects']): RelicDef => ({
  id,
  name,
  tier,
  gearType,
  effect,
  effects,
  sellPrice: 10 * tier,
});

export const relics: RelicDef[] = [
  relic('rustedSaintsBuckler', 'Rusted saint’s buckler', 1, 'buckler', 'Blessed', [{ kind: 'keyword', keyword: 'blessed' }]),
  relic('poachersLongbow', 'Poacher’s longbow', 1, 'bow', 'Double crit damage against beasts', [
    { kind: 'critDamage', multiplier: 2, when: { tag: 'beast' } },
  ]),
  relic('sextonsMace', 'Sexton’s mace', 1, 'mace', 'Stagger against undead', [
    { kind: 'keyword', keyword: 'stagger', when: { tag: 'undead' } },
  ]),
  relic('ratcatchersKnuckles', 'Ratcatcher’s knuckles', 1, 'knuckles', 'Cleave in fights against vermin', [
    { kind: 'keyword', keyword: 'cleave', when: { tag: 'vermin' } },
  ]),
  relic('hedgeWitchsRobes', 'Hedge-witch’s robes', 1, 'robes', 'Halves the Poison penalty for its wearer', [
    { kind: 'penaltyCut', threat: 'poison', multiplier: 0.5 },
  ]),
  relic('smugglersCoat', 'Smuggler’s coat', 2, 'leather', 'Thieves can’t steal from the party', [
    { kind: 'cancelPenalty', threat: 'thieves' },
  ]),
  relic('barrowKingsBlade', 'Barrow king’s blade', 2, 'sword', 'Heals the wielder when it kills an undead', [
    { kind: 'healOnKill', pct: 0.1, when: { tag: 'undead' } },
  ]),
  relic('wolfhoundSpear', 'Wolfhound spear', 2, 'spear', 'Reach against beasts', [
    { kind: 'keyword', keyword: 'reach', when: { tag: 'beast' } },
  ]),
  relic('desertersMail', 'Deserter’s mail', 2, 'mail', 'Brace in the first fight', [
    { kind: 'keyword', keyword: 'brace', when: { firstFight: true } },
  ]),
  relic('bogWitchsWand', 'Bog-witch’s wand', 2, 'wand', 'Channel against water enemies', [
    { kind: 'keyword', keyword: 'channel', when: { tag: 'water' } },
  ]),
  relic('minersLampStaff', 'Miner’s lamp-staff', 3, 'staff', 'Answers Darkness for its carrier', [
    { kind: 'keyword', keyword: 'light' },
  ]),
  relic('drownedBell', 'Drowned bell', 3, 'censer', 'Blessed; the party ignores the Underwater penalty in the first fight', [
    { kind: 'ignorePenalty', threat: 'underwater', when: { firstFight: true } },
  ]),
  relic('dwarfLordsAxe', 'Dwarf-lord’s axe', 3, 'axe', 'Pierce against constructs', [
    { kind: 'keyword', keyword: 'pierce', when: { tag: 'construct' } },
  ]),
  relic('witchHuntersDagger', 'Witch-hunter’s dagger', 3, 'dagger', 'Double crit damage against casters', [
    { kind: 'critDamage', multiplier: 2, when: { tag: 'caster' } },
  ]),
  relic('thiefTakersQuiver', 'Thief-taker’s quiver', 3, 'quiver', 'Reach in Ambush fights', [
    { kind: 'keyword', keyword: 'reach', when: { threat: 'ambush' } },
  ]),
  relic('orcWarlordsHammer', 'Orc warlord’s hammer', 4, 'warhammer', 'Stagger on every crit against Brutes', [
    { kind: 'staggerOnCrit', when: { tag: 'brute' } },
  ]),
  relic('clockworkAegis', 'Clockwork aegis', 4, 'shield', 'Guard; Brace against Brutes only', [
    { kind: 'keyword', keyword: 'brace', when: { tag: 'brute' } },
  ]),
  relic('sirensLute', 'Siren’s lute', 4, 'lute', 'Inspire in Underwater dungeons', [
    { kind: 'keyword', keyword: 'inspire', when: { threat: 'underwater' } },
  ]),
  relic('cartographersFocus', 'Cartographer’s focus', 4, 'focus', 'Answers Maze for its carrier', [
    { kind: 'answers', threat: 'maze' },
  ]),
  relic('duelistsMainGauche', 'Duelist’s main-gauche', 4, 'offhandBlade', 'Parry against Brutes', [
    { kind: 'keyword', keyword: 'parry', when: { tag: 'brute' } },
  ]),
  relic('dragonbonePlate', 'Dragonbone plate', 5, 'plate', 'Immune to fire', [
    { kind: 'immune', element: 'fire', multiplier: 0.5 },
  ]),
  relic('archmagesTome', 'Archmage’s tome', 5, 'tome', 'Channel; the first spell of the first fight hits every enemy', [
    { kind: 'keyword', keyword: 'channel' },
    { kind: 'firstSpellAll' },
  ]),
  relic('wyrmSlayersSword', 'Wyrm-slayer’s sword', 5, 'sword', 'Pierce against dragons', [
    { kind: 'keyword', keyword: 'pierce', when: { tag: 'dragon' } },
  ]),
  relic('stormcallersRobes', 'Stormcaller’s robes', 5, 'robes', 'Immune to electric', [
    { kind: 'immune', element: 'electric', multiplier: 0.5 },
  ]),
  relic('titanBreakerGauntlets', 'Titan-breaker gauntlets', 5, 'knuckles', 'Stagger against constructs', [
    { kind: 'keyword', keyword: 'stagger', when: { tag: 'construct' } },
  ]),
];
