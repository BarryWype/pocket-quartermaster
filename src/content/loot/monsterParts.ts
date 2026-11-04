import type { ImageSourcePropType } from 'react-native';

import type { Tag } from '@/game/types';

// The 12 monster parts of doc/design/loot/monster-parts.csv: one per enemy
// family tag. Parts are materials (inventory counts) and sellable.

export type MonsterPartDef = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
  tag: Tag;
  uses: string;
  sellPrice: number;
};

export const monsterParts: MonsterPartDef[] = [
  { id: 'fangOrHorn', name: 'Fang or horn', emoji: '🦷', icon: require('../../../assets/icons/magic/part-fangs.png'), tag: 'beast', uses: 'Strength draught', sellPrice: 4 },
  { id: 'feather', name: 'Feather', emoji: '🪶', icon: require('../../../assets/icons/magic/part-black-feather.png'), tag: 'bird', uses: 'Quill charm, Quicksilver', sellPrice: 3 },
  { id: 'venomSac', name: 'Venom sac', emoji: '🫧', icon: require('../../../assets/icons/magic/part-slime.png'), tag: 'vermin', uses: 'Viper oil', sellPrice: 3 },
  { id: 'chitin', name: 'Chitin', emoji: '🪲', icon: require('../../../assets/icons/alchemy/bowl-blue-scales.png'), tag: 'carapace', uses: 'Scarab charm, Ironskin brew', sellPrice: 4 },
  { id: 'graveDust', name: 'Grave dust', emoji: '⚱️', icon: require('../../../assets/icons/alchemy/bowl-grey-ash.png'), tag: 'undead', uses: 'Grave-dust pouch', sellPrice: 3 },
  { id: 'ectoplasm', name: 'Ectoplasm', emoji: '👻', icon: require('../../../assets/icons/relics/jar-blue-essence.png'), tag: 'spirit', uses: 'Ghost lantern, Arcane tonic', sellPrice: 5 },
  { id: 'goblinEar', name: 'Goblin ear', emoji: '👂', tag: 'goblinoid', uses: 'Lucky ear', sellPrice: 3 },
  { id: 'tatteredInsignia', name: 'Tattered insignia', emoji: '🎖️', icon: require('../../../assets/icons/relics/banner-red-tattered.png'), tag: 'humanoid', uses: 'Bounty token, Architect’s seal', sellPrice: 3 },
  { id: 'bruteBlood', name: 'Brute blood', emoji: '🩸', icon: require('../../../assets/icons/alchemy/potion-blood.png'), tag: 'brute', uses: 'Healing potions, Revival draught', sellPrice: 6 },
  { id: 'cog', name: 'Cog', emoji: '⚙️', tag: 'construct', uses: 'Tinker’s lodestone', sellPrice: 5 },
  { id: 'scale', name: 'Scale', emoji: '🐉', icon: require('../../../assets/icons/magic/part-dragon-scale.png'), tag: 'dragon', uses: 'Firebomb', sellPrice: 6 },
  { id: 'ritualCandle', name: 'Ritual candle', emoji: '🕯️', icon: require('../../../assets/icons/relics/candle-holder.png'), tag: 'caster', uses: 'Seer’s candle, Nullroot tincture', sellPrice: 4 },
];
