import type { GearType, Tag } from '@/game/types';
import { ELEMENTS, type Element } from '@/game/elements';

import { elementInfo } from '../elements';

// The 13 components of doc/design/loot/components.csv, the elemental heart
// expanded to one per element. Components are materials (inventory counts)
// swapped into a gear recipe to add their effect.

export type ComponentDef = {
  id: string;
  name: string;
  emoji: string;
  from: string;
  fits: GearType[];
  adds: string;
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
  { id: 'captainsSpurs', name: 'Captain’s spurs', emoji: '🐎', from: 'Bandit captain (T1 boss)', fits: ARMOUR, adds: '+Speed', bossId: 'banditCaptain', sellPrice: 40 },
  { id: 'ogreKnucklebone', name: 'Ogre knucklebone', emoji: '🦴', from: 'Ogre chieftain (T2 boss)', fits: ['mace', 'warhammer', 'knuckles'], adds: 'Stagger', bossId: 'ogreChieftain', sellPrice: 40 },
  { id: 'phylacteryShard', name: 'Phylactery shard', emoji: '💠', from: 'Lich of the deep (T3 boss)', fits: ['focus', 'wand', 'staff', 'tome'], adds: 'Channel', bossId: 'lichOfTheDeep', sellPrice: 40 },
  { id: 'giantsHeartstone', name: 'Giant’s heartstone', emoji: '❤️', from: 'Giant king (T4 boss)', fits: ['shield'], adds: 'Guard', bossId: 'giantKing', sellPrice: 40 },
  { id: 'dragonClaw', name: 'Dragon claw', emoji: '🐾', from: 'Elder dragon (T5 boss)', fits: ['sword', 'axe'], adds: 'Cleave', bossId: 'elderDragon', sellPrice: 40 },
  { id: 'drakeFang', name: 'Drake fang', emoji: '🦷', from: 'Elite beasts, monster lair', fits: ['spear', 'dagger', 'bow'], adds: 'Pierce', tags: ['beast', 'dragon'], sellPrice: 20 },
  { id: 'harpyFlightFeather', name: 'Harpy flight feather', emoji: '🪶', from: 'Harpies, monster lair', fits: ['bow', 'spear'], adds: 'Reach', tags: ['bird'], sellPrice: 20 },
  { id: 'clockworkEscapement', name: 'Clockwork escapement', emoji: '🕰️', from: 'Elite constructs', fits: ['offhandBlade', 'buckler'], adds: 'Parry', tags: ['construct'], sellPrice: 20 },
  { id: 'golemCore', name: 'Golem core', emoji: '🗿', from: 'Elite golems', fits: [...ARMOUR, 'shield'], adds: 'Brace', tags: ['construct'], sellPrice: 20 },
  { id: 'trollHide', name: 'Troll hide', emoji: '🟫', from: 'Elite trolls', fits: ARMOUR, adds: 'Mend', tags: ['brute'], sellPrice: 20 },
  { id: 'orcWarDrumSkin', name: 'Orc war-drum skin', emoji: '🥁', from: 'Elite orcs', fits: ['lute', 'censer', 'tome'], adds: 'Inspire', tags: ['goblinoid'], sellPrice: 20 },
  { id: 'spiderSilk', name: 'Spider silk', emoji: '🕸️', from: 'Elite spiders', fits: ['leather', 'robes'], adds: '+Evasion', tags: ['vermin'], sellPrice: 20 },
  ...ELEMENTS.map((element): ComponentDef => ({
    id: `${element}Heart`,
    name: `${elementInfo[element].name} heart`,
    emoji: elementInfo[element].emoji,
    from: 'Elemental rift, Sanctum guardians',
    fits: ANY_WEAPON,
    adds: 'Permanent infusion of that element',
    element,
    sellPrice: 20,
  })),
];
