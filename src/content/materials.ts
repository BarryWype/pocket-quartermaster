import { ELEMENTS, shardId, stoneId, type Element } from '@/game/elements';
import type { MaterialDef } from '@/game/types';

import { elementInfo } from './elements';
import { components } from './loot/components';
import { monsterParts } from './loot/monsterParts';

/** Each tier's main material, tier 1 first. */
export const tierMaterials = ['wood', 'stone', 'copper', 'iron', 'steel'];

/** Each element's shard icon. */
const SHARD_ICONS: Record<Element, MaterialDef['icon']> = {
  fire: require('../../assets/icons/rpg/gem-red.png'),
  grass: require('../../assets/icons/rpg/gem-green.png'),
  stone: require('../../assets/icons/rpg/gem-brown.png'),
  electric: require('../../assets/icons/rpg/gem-orange.png'),
  water: require('../../assets/icons/rpg/gem-blue.png'),
};

/** Each element's stone icon. */
const STONE_ICONS: Record<Element, MaterialDef['icon']> = {
  fire: require('../../assets/icons/relics/runestone-red-hook.png'),
  grass: require('../../assets/icons/relics/runestone-green-zigzag.png'),
  stone: require('../../assets/icons/magic/runestone-orange.png'),
  electric: require('../../assets/icons/relics/runestone-gold-star.png'),
  water: require('../../assets/icons/relics/runestone-blue-drop.png'),
};

export const materials: MaterialDef[] = [
  { id: 'wood', name: 'Wood', emoji: '🪵', icon: require('../../assets/icons/scaled/wood.png') },
  { id: 'stone', name: 'Stone', emoji: '🪨', icon: require('../../assets/icons/scaled/stone.png') },
  { id: 'copper', name: 'Copper ore', emoji: '🟠', icon: require('../../assets/icons/scaled/copper.png') },
  { id: 'iron', name: 'Iron ore', emoji: '⛓️', icon: require('../../assets/icons/scaled/iron.png') },
  { id: 'coal', name: 'Coal', emoji: '⚫', icon: require('../../assets/icons/scaled/charcoal.png') },
  { id: 'steel', name: 'Steel ingot', emoji: '🔩' },
  { id: 'hide', name: 'Hide', emoji: '🟫', icon: require('../../assets/icons/relics/pelt-hide.png') },
  { id: 'bone', name: 'Bone', emoji: '🦴', icon: require('../../assets/icons/magic/part-bone.png') },
  { id: 'meat', name: 'Meat', emoji: '🍖', icon: require('../../assets/icons/alchemy/food-raw-meat.png') },
  { id: 'fish', name: 'Fish', emoji: '🐟', icon: require('../../assets/icons/magic/food-fish.png') },
  { id: 'herb', name: 'Herbs', emoji: '🌿', icon: require('../../assets/icons/rpg/herb-green-leaf.png') },
  { id: 'berries', name: 'Berries', emoji: '🫐', icon: require('../../assets/icons/tavern/berries-blue.png') },
  { id: 'mushroom', name: 'Mushroom', emoji: '🍄', icon: require('../../assets/icons/rpg/herb-purple-mushroom.png') },
  // Found on the tutorial's first expedition; what it opens comes later.
  // Elemental shards (won at Sanctums) merge into stones, which infuse gear.
  ...ELEMENTS.flatMap((element): MaterialDef[] => [
    { id: shardId(element), name: `${elementInfo[element].name} shard`, emoji: elementInfo[element].emoji, icon: SHARD_ICONS[element] },
    { id: stoneId(element), name: `${elementInfo[element].name} stone`, emoji: '💠', icon: STONE_ICONS[element] },
  ]),
  // Monster parts and forge components (inventory counts like any material).
  ...monsterParts.map((part): MaterialDef => ({ id: part.id, name: part.name, emoji: part.emoji, icon: part.icon })),
  ...components.map((component): MaterialDef => ({ id: component.id, name: component.name, emoji: component.emoji, icon: component.icon })),
];
