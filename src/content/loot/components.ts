import type { GearType, Keyword, Tag } from '@/game/types';
import { ELEMENTS, type Element } from '@/game/elements';

import { elementInfo } from '../elements';

// The 13 components of doc/design/loot/components.csv, the elemental heart
// expanded to one per element. Components are materials (inventory counts)
// swapped into a gear recipe to add their effect.

/** What a component adds to the piece it is forged into. */
export type ComponentEffect =
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'stat'; stat: 'speed' | 'evasion'; add: number }
  | { kind: 'infusion' };

export type ComponentDef = {
  id: string;
  name: string;
  emoji: string;
  from: string;
  fits: GearType[];
  adds: string;
  effect: ComponentEffect;
  /** The boss its boss component comes from, if any. */
  bossId?: string;
  /** Family tags that map to this elite component, in family order. */
  tags?: Tag[];
  element?: Element;
  sellPrice: number;
};

/** The CSV "Armour": every armour type. */
const ARMOUR: GearType[] = ['plate', 'mail', 'leather', 'robes'];
/** The CSV "Any weapon": every weapon type. */
const ANY_WEAPON: GearType[] = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'bow',
  'spear',
  'warhammer',
  'wand',
  'staff',
  'lute',
  'censer',
  'knuckles',
];

export const components: ComponentDef[] = [
  { id: 'captainsSpurs', name: 'Captain’s spurs', emoji: '🐎', from: 'Bandit captain (T1 boss)', fits: ARMOUR, adds: '+Speed', effect: { kind: 'stat', stat: 'speed', add: 1 }, bossId: 'banditCaptain', sellPrice: 40 },
  { id: 'ogreKnucklebone', name: 'Ogre knucklebone', emoji: '🦴', from: 'Ogre chieftain (T2 boss)', fits: ['mace', 'warhammer', 'knuckles'], adds: 'Stagger', effect: { kind: 'keyword', keyword: 'stagger' }, bossId: 'ogreChieftain', sellPrice: 40 },
  { id: 'phylacteryShard', name: 'Phylactery shard', emoji: '💠', from: 'Lich of the deep (T3 boss)', fits: ['focus', 'wand', 'staff', 'tome'], adds: 'Channel', effect: { kind: 'keyword', keyword: 'channel' }, bossId: 'lichOfTheDeep', sellPrice: 40 },
  { id: 'giantsHeartstone', name: 'Giant’s heartstone', emoji: '❤️', from: 'Giant king (T4 boss)', fits: ['shield'], adds: 'Guard', effect: { kind: 'keyword', keyword: 'guard' }, bossId: 'giantKing', sellPrice: 40 },
  { id: 'dragonClaw', name: 'Dragon claw', emoji: '🐾', from: 'Elder dragon (T5 boss)', fits: ['sword', 'axe'], adds: 'Cleave', effect: { kind: 'keyword', keyword: 'cleave' }, bossId: 'elderDragon', sellPrice: 40 },
  { id: 'drakeFang', name: 'Drake fang', emoji: '🦷', from: 'Elite beasts, monster lair', fits: ['spear', 'dagger', 'bow'], adds: 'Pierce', effect: { kind: 'keyword', keyword: 'pierce' }, tags: ['beast', 'dragon'], sellPrice: 20 },
  { id: 'harpyFlightFeather', name: 'Harpy flight feather', emoji: '🪶', from: 'Harpies, monster lair', fits: ['bow', 'spear'], adds: 'Reach', effect: { kind: 'keyword', keyword: 'reach' }, tags: ['bird'], sellPrice: 20 },
  { id: 'clockworkEscapement', name: 'Clockwork escapement', emoji: '🕰️', from: 'Elite constructs', fits: ['offhandBlade', 'buckler'], adds: 'Parry', effect: { kind: 'keyword', keyword: 'parry' }, tags: ['construct'], sellPrice: 20 },
  { id: 'golemCore', name: 'Golem core', emoji: '🗿', from: 'Elite golems', fits: [...ARMOUR, 'shield'], adds: 'Brace', effect: { kind: 'keyword', keyword: 'brace' }, tags: ['construct'], sellPrice: 20 },
  { id: 'trollHide', name: 'Troll hide', emoji: '🟫', from: 'Elite trolls', fits: ARMOUR, adds: 'Mend', effect: { kind: 'keyword', keyword: 'mend' }, tags: ['brute'], sellPrice: 20 },
  { id: 'orcWarDrumSkin', name: 'Orc war-drum skin', emoji: '🥁', from: 'Elite orcs', fits: ['lute', 'censer', 'tome'], adds: 'Inspire', effect: { kind: 'keyword', keyword: 'inspire' }, tags: ['goblinoid'], sellPrice: 20 },
  { id: 'spiderSilk', name: 'Spider silk', emoji: '🕸️', from: 'Elite spiders', fits: ['leather', 'robes'], adds: '+Evasion', effect: { kind: 'stat', stat: 'evasion', add: 5 }, tags: ['vermin'], sellPrice: 20 },
  ...ELEMENTS.map((element): ComponentDef => ({
    id: `${element}Heart`,
    name: `${elementInfo[element].name} heart`,
    emoji: elementInfo[element].emoji,
    from: 'Elemental rift, Sanctum guardians',
    fits: ANY_WEAPON,
    adds: 'Permanent infusion of that element',
    effect: { kind: 'infusion' },
    element,
    sellPrice: 20,
  })),
];
