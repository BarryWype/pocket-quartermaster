import type { GearType } from '@/game/types';

// The 25 relics of doc/design/loot/relics.csv: one-off items restored at the
// forge into a finished piece with their fixed effect.

export type RelicDef = {
  id: string;
  name: string;
  tier: number;
  gearType: GearType;
  effect: string;
  sellPrice: number;
};

const relic = (id: string, name: string, tier: number, gearType: GearType, effect: string): RelicDef => ({
  id,
  name,
  tier,
  gearType,
  effect,
  sellPrice: 10 * tier,
});

export const relics: RelicDef[] = [
  relic('rustedSaintsBuckler', 'Rusted saint’s buckler', 1, 'buckler', 'Blessed'),
  relic('poachersLongbow', 'Poacher’s longbow', 1, 'bow', 'Double crit damage against beasts'),
  relic('sextonsMace', 'Sexton’s mace', 1, 'mace', 'Stagger against undead'),
  relic('ratcatchersKnuckles', 'Ratcatcher’s knuckles', 1, 'knuckles', 'Cleave in fights against vermin'),
  relic('hedgeWitchsRobes', 'Hedge-witch’s robes', 1, 'robes', 'Halves the Poison penalty for its wearer'),
  relic('smugglersCoat', 'Smuggler’s coat', 2, 'leather', 'Thieves can’t steal from the party'),
  relic('barrowKingsBlade', 'Barrow king’s blade', 2, 'sword', 'Heals the wielder when it kills an undead'),
  relic('wolfhoundSpear', 'Wolfhound spear', 2, 'spear', 'Reach against beasts'),
  relic('desertersMail', 'Deserter’s mail', 2, 'mail', 'Brace in the first fight'),
  relic('bogWitchsWand', 'Bog-witch’s wand', 2, 'wand', 'Channel against water enemies'),
  relic('minersLampStaff', 'Miner’s lamp-staff', 3, 'staff', 'Answers Darkness for its carrier'),
  relic('drownedBell', 'Drowned bell', 3, 'censer', 'Blessed; the party ignores the Underwater penalty in the first fight'),
  relic('dwarfLordsAxe', 'Dwarf-lord’s axe', 3, 'axe', 'Pierce against constructs'),
  relic('witchHuntersDagger', 'Witch-hunter’s dagger', 3, 'dagger', 'Double crit damage against casters'),
  relic('thiefTakersQuiver', 'Thief-taker’s quiver', 3, 'quiver', 'Reach in Ambush fights'),
  relic('orcWarlordsHammer', 'Orc warlord’s hammer', 4, 'warhammer', 'Stagger on every crit against Brutes'),
  relic('clockworkAegis', 'Clockwork aegis', 4, 'shield', 'Guard; Brace against Brutes only'),
  relic('sirensLute', 'Siren’s lute', 4, 'lute', 'Inspire in Underwater dungeons'),
  relic('cartographersFocus', 'Cartographer’s focus', 4, 'focus', 'Answers Maze for its carrier'),
  relic('duelistsMainGauche', 'Duelist’s main-gauche', 4, 'offhandBlade', 'Parry against Brutes'),
  relic('dragonbonePlate', 'Dragonbone plate', 5, 'plate', 'Immune to fire'),
  relic('archmagesTome', 'Archmage’s tome', 5, 'tome', 'Channel; the first spell of the first fight hits every enemy'),
  relic('wyrmSlayersSword', 'Wyrm-slayer’s sword', 5, 'sword', 'Pierce against dragons'),
  relic('stormcallersRobes', 'Stormcaller’s robes', 5, 'robes', 'Immune to electric'),
  relic('titanBreakerGauntlets', 'Titan-breaker gauntlets', 5, 'knuckles', 'Stagger against constructs'),
];
