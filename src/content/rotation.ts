import type { ImageSourcePropType } from 'react-native';

import type { Tag } from '@/game/types';

import { elementInfo } from './elements';

export const rotationRules = {
  /** The daily rotation resets at this hour, UTC, the same moment for every player. */
  resetHourUtc: 0,
  /** Rotations are worked out day by day from here, so "not the same as yesterday" holds exactly. */
  startDay: Date.UTC(2026, 0, 1),
};

/** How a dungeon's tag summary is worked out from its encounters (see game/dungeons/tags.ts). */
export const tagRules = {
  /** The boss counts like this many encounters' worth. */
  bossWeight: 3,
  /** Tags below this share of the total aren't shown. */
  minShare: 0.15,
  maxShown: 3,
};

export const tagInfo: Record<Tag, { emoji: string; icon: ImageSourcePropType; name: string }> = {
  undead: { emoji: '💀', icon: require('../../assets/icons/abilities-scaled/skull.png'), name: 'Undead' },
  beast: { emoji: '🐺', icon: require('../../assets/icons/abilities-scaled/claw-marks.png'), name: 'Beasts' },
  trap: { emoji: '⚙️', icon: require('../../assets/icons/abilities-scaled/rope-snare.png'), name: 'Traps' },
  obstacle: { emoji: '🪨', icon: require('../../assets/icons/abilities-scaled/rock-smash.png'), name: 'Obstacles' },
  locals: { emoji: '🧑', icon: require('../../assets/icons/abilities-scaled/burning-silhouette.png'), name: 'Locals' },
  bird: { emoji: '🐦', icon: require('../../assets/icons/abilities-scaled/golden-eagle.png'), name: 'Birds' },
  vermin: { emoji: '🕷️', icon: require('../../assets/icons/abilities-scaled/red-wings.png'), name: 'Vermin' },
  carapace: { emoji: '🪲', icon: require('../../assets/icons/abilities-scaled/iron-spiked-shield.png'), name: 'Carapaces' },
  spirit: { emoji: '👻', icon: require('../../assets/icons/abilities-scaled/ghost.png'), name: 'Spirits' },
  goblinoid: { emoji: '👺', icon: require('../../assets/icons/abilities-scaled/red-eyed-face.png'), name: 'Goblinoids' },
  humanoid: { emoji: '🗡️', icon: require('../../assets/icons/abilities-scaled/helmeted-warrior.png'), name: 'Humanoids' },
  brute: { emoji: '👹', icon: require('../../assets/icons/abilities-scaled/bull-head.png'), name: 'Brutes' },
  construct: { emoji: '🗿', icon: require('../../assets/icons/abilities-scaled/iron-cuirass.png'), name: 'Constructs' },
  dragon: { emoji: '🐉', icon: require('../../assets/icons/abilities-scaled/dragon-head.png'), name: 'Dragons' },
  caster: { emoji: '🔮', icon: require('../../assets/icons/abilities-scaled/arcane-sword.png'), name: 'Casters' },
  elemental: { emoji: '🌀', icon: require('../../assets/icons/abilities-scaled/fire-elemental.png'), name: 'Elementals' },
  fire: { emoji: elementInfo.fire.emoji, icon: require('../../assets/icons/abilities-scaled/wall-of-fire.png'), name: elementInfo.fire.name },
  grass: { emoji: elementInfo.grass.emoji, icon: require('../../assets/icons/abilities-scaled/leaf.png'), name: elementInfo.grass.name },
  stone: { emoji: elementInfo.stone.emoji, icon: require('../../assets/icons/abilities-scaled/stone-sigil.png'), name: elementInfo.stone.name },
  electric: { emoji: elementInfo.electric.emoji, icon: require('../../assets/icons/abilities-scaled/lightning-flash.png'), name: elementInfo.electric.name },
  water: { emoji: elementInfo.water.emoji, icon: require('../../assets/icons/abilities-scaled/wave.png'), name: elementInfo.water.name },
};

/** Tie-break order, and the order tags are listed in. */
export const TAG_ORDER: Tag[] = ['undead', 'beast', 'trap', 'obstacle', 'locals', 'fire', 'grass', 'stone', 'electric', 'water'];
