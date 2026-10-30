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

export const tagInfo: Record<Tag, { emoji: string; name: string }> = {
  undead: { emoji: '💀', name: 'Undead' },
  beast: { emoji: '🐺', name: 'Beasts' },
  trap: { emoji: '⚙️', name: 'Traps' },
  obstacle: { emoji: '🪨', name: 'Obstacles' },
  locals: { emoji: '🧑', name: 'Locals' },
  bird: { emoji: '🐦', name: 'Birds' },
  vermin: { emoji: '🕷️', name: 'Vermin' },
  carapace: { emoji: '🪲', name: 'Carapaces' },
  spirit: { emoji: '👻', name: 'Spirits' },
  goblinoid: { emoji: '👺', name: 'Goblinoids' },
  humanoid: { emoji: '🗡️', name: 'Humanoids' },
  brute: { emoji: '👹', name: 'Brutes' },
  construct: { emoji: '🗿', name: 'Constructs' },
  dragon: { emoji: '🐉', name: 'Dragons' },
  caster: { emoji: '🔮', name: 'Casters' },
  elemental: { emoji: '🌀', name: 'Elementals' },
  fire: { emoji: elementInfo.fire.emoji, name: elementInfo.fire.name },
  grass: { emoji: elementInfo.grass.emoji, name: elementInfo.grass.name },
  stone: { emoji: elementInfo.stone.emoji, name: elementInfo.stone.name },
  electric: { emoji: elementInfo.electric.emoji, name: elementInfo.electric.name },
  water: { emoji: elementInfo.water.emoji, name: elementInfo.water.name },
};

/** Tie-break order, and the order tags are listed in. */
export const TAG_ORDER: Tag[] = ['undead', 'beast', 'trap', 'obstacle', 'locals', 'fire', 'grass', 'stone', 'electric', 'water'];
