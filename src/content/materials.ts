import { ELEMENTS, shardId, stoneId } from '@/game/elements';
import type { MaterialDef } from '@/game/types';

import { elementInfo } from './elements';
import { components } from './loot/components';
import { monsterParts } from './loot/monsterParts';

export const materials: MaterialDef[] = [
  { id: 'wood', name: 'Wood', emoji: '🪵', icon: require('../../assets/icons/scaled/wood.png') },
  { id: 'stone', name: 'Stone', emoji: '🪨', icon: require('../../assets/icons/scaled/stone.png') },
  { id: 'copper', name: 'Copper ore', emoji: '🟠', icon: require('../../assets/icons/scaled/copper.png') },
  { id: 'iron', name: 'Iron ore', emoji: '⛓️', icon: require('../../assets/icons/scaled/iron.png') },
  { id: 'coal', name: 'Coal', emoji: '⚫', icon: require('../../assets/icons/scaled/charcoal.png') },
  { id: 'steel', name: 'Steel ingot', emoji: '🔩' },
  { id: 'hide', name: 'Hide', emoji: '🟫' },
  { id: 'bone', name: 'Bone', emoji: '🦴' },
  { id: 'meat', name: 'Meat', emoji: '🍖' },
  { id: 'fish', name: 'Fish', emoji: '🐟' },
  { id: 'herb', name: 'Herbs', emoji: '🌿' },
  { id: 'berries', name: 'Berries', emoji: '🫐' },
  { id: 'mushroom', name: 'Mushroom', emoji: '🍄' },
  // Found on the tutorial's first expedition; what it opens comes later.
  // Elemental shards (won at Sanctums) merge into stones, which infuse gear.
  ...ELEMENTS.flatMap((element): MaterialDef[] => [
    { id: shardId(element), name: `${elementInfo[element].name} shard`, emoji: elementInfo[element].emoji },
    { id: stoneId(element), name: `${elementInfo[element].name} stone`, emoji: '💠' },
  ]),
  // Monster parts and forge components (inventory counts like any material).
  ...monsterParts.map((part): MaterialDef => ({ id: part.id, name: part.name, emoji: part.emoji })),
  ...components.map((component): MaterialDef => ({ id: component.id, name: component.name, emoji: component.emoji })),
];
