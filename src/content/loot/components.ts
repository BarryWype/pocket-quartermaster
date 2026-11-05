import type { ImageSourcePropType } from 'react-native';

import type { GearType, Keyword, Tag } from '@/game/types';

// The components of doc/design/loot/components.csv, boss and elite drops.
// Components are materials (inventory counts) forged into a gear recipe to
// add their affix.

/** What a component adds to the piece it is forged into. */
export type ComponentEffect =
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'stat'; stat: 'speed' | 'evasion'; add: number };

export type ComponentDef = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
  from: string;
  fits: GearType[];
  adds: string;
  effect: ComponentEffect;
  /** The boss its boss component comes from, if any. */
  bossId?: string;
  /** Family tags that map to this elite component, in family order. */
  tags?: Tag[];
  sellPrice: number;
};

/** The CSV "Armour": every armour type. */
const ARMOUR: GearType[] = ['plate', 'mail', 'leather', 'robes'];

export const components: ComponentDef[] = [
  { id: 'captainsSpurs', name: 'Captain’s spurs', emoji: '🐎', icon: require('../../../assets/icons/rpg/boots-knight-sabatons.png'), from: 'Bandit captain (T1 boss)', fits: ARMOUR, adds: '+Speed', effect: { kind: 'stat', stat: 'speed', add: 1 }, bossId: 'banditCaptain', sellPrice: 40 },
  { id: 'ogreKnucklebone', name: 'Ogre knucklebone', emoji: '🦴', icon: require('../../../assets/icons/magic/part-crossed-bones.png'), from: 'Ogre chieftain (T2 boss)', fits: ['mace', 'warhammer', 'knuckles'], adds: 'Stagger', effect: { kind: 'keyword', keyword: 'stagger' }, bossId: 'ogreChieftain', sellPrice: 40 },
  { id: 'phylacteryShard', name: 'Phylactery shard', emoji: '💠', icon: require('../../../assets/icons/relics/reliquary-blue-drop.png'), from: 'Lich of the deep (T3 boss)', fits: ['focus', 'wand', 'staff', 'tome'], adds: 'Channel', effect: { kind: 'keyword', keyword: 'channel' }, bossId: 'lichOfTheDeep', sellPrice: 40 },
  { id: 'giantsHeartstone', name: 'Giant’s heartstone', emoji: '❤️', icon: require('../../../assets/icons/relics/runestone-red-cross.png'), from: 'Giant king (T4 boss)', fits: ['shield', 'plate'], adds: 'Guard', effect: { kind: 'keyword', keyword: 'guard' }, bossId: 'giantKing', sellPrice: 40 },
  { id: 'dragonClaw', name: 'Dragon claw', emoji: '🐾', icon: require('../../../assets/icons/magic/part-claw.png'), from: 'Elder dragon (T5 boss)', fits: ['sword', 'axe', 'staff'], adds: 'Cleave', effect: { kind: 'keyword', keyword: 'cleave' }, bossId: 'elderDragon', sellPrice: 40 },
  { id: 'drakeFang', name: 'Drake fang', emoji: '🦷', icon: require('../../../assets/icons/magic/part-fang-pair.png'), from: 'Elite beasts, monster lair', fits: ['spear', 'dagger', 'bow', 'warhammer'], adds: 'Pierce', effect: { kind: 'keyword', keyword: 'pierce' }, tags: ['beast', 'dragon'], sellPrice: 20 },
  { id: 'harpyFlightFeather', name: 'Harpy flight feather', emoji: '🪶', icon: require('../../../assets/icons/magic/bowl-blue-feathers.png'), from: 'Harpies, monster lair', fits: ['bow', 'spear', 'quiver'], adds: 'Reach', effect: { kind: 'keyword', keyword: 'reach' }, tags: ['bird'], sellPrice: 20 },
  { id: 'clockworkEscapement', name: 'Clockwork escapement', emoji: '🕰️', from: 'Elite constructs', fits: ['offhandBlade', 'buckler', 'sword'], adds: 'Parry', effect: { kind: 'keyword', keyword: 'parry' }, tags: ['construct'], sellPrice: 20 },
  { id: 'golemCore', name: 'Golem core', emoji: '🗿', icon: require('../../../assets/icons/relics/runestone-gold-sun.png'), from: 'Elite golems', fits: [...ARMOUR, 'shield', 'spear'], adds: 'Brace', effect: { kind: 'keyword', keyword: 'brace' }, tags: ['construct'], sellPrice: 20 },
  { id: 'trollHide', name: 'Troll hide', emoji: '🟫', icon: require('../../../assets/icons/relics/pelt-fur-collar.png'), from: 'Elite trolls', fits: ARMOUR, adds: 'Mend', effect: { kind: 'keyword', keyword: 'mend' }, tags: ['brute'], sellPrice: 20 },
  { id: 'orcWarDrumSkin', name: 'Orc war-drum skin', emoji: '🥁', icon: require('../../../assets/icons/relics/drum-red.png'), from: 'Elite orcs', fits: ['lute', 'censer', 'tome'], adds: 'Inspire', effect: { kind: 'keyword', keyword: 'inspire' }, tags: ['goblinoid'], sellPrice: 20 },
  { id: 'spiderSilk', name: 'Spider silk', emoji: '🕸️', icon: require('../../../assets/icons/relics/rope-coil.png'), from: 'Elite spiders', fits: ['leather', 'robes'], adds: '+Evasion', effect: { kind: 'stat', stat: 'evasion', add: 5 }, tags: ['vermin'], sellPrice: 20 },
];
