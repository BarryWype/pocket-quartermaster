import type { ImageSourcePropType } from 'react-native';

import type { LootModifier } from '@/game/loot/types';

import { lootConfig } from './config';

// The 10 charms of doc/design/loot/charms.csv: consumable-slot items that raise
// what a run finds, crafted at the alchemy panel. Each recipe is known once the
// player has seen every part in `unlockedBy` (the Prism charm needs none).

export type CharmDef = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
  description: string;
  inputs: Record<string, number>;
  /** Shards of any one element. */
  anyShards?: number;
  unlockedBy: string[];
  modifier: LootModifier;
};

const { chanceMultiplier, luck, goldPercent, xpPercent, raritySteps } = lootConfig.charms;

const chanceCharm = (
  id: string,
  name: string,
  emoji: string,
  icon: ImageSourcePropType,
  what: string,
  category: Extract<LootModifier, { kind: 'chance' }>['category'],
  recipe: Pick<CharmDef, 'inputs' | 'anyShards' | 'unlockedBy'>,
): CharmDef => ({
  id,
  name,
  emoji,
  icon,
  description: `${what} chance ×${chanceMultiplier} for the run, where it can drop.`,
  ...recipe,
  modifier: { id, kind: 'chance', category, multiplier: chanceMultiplier },
});

export const charms: CharmDef[] = [
  {
    id: 'luckyEar',
    name: 'Lucky ear',
    emoji: '👂',
    icon: require('../../../assets/icons/rpg/herb-four-leaf-clover.png'),
    description: `+${luck} Luck for the party for the run.`,
    inputs: { goblinEar: 3 },
    unlockedBy: ['goblinEar'],
    modifier: { id: 'luckyEar', kind: 'luck', add: luck },
  },
  {
    id: 'bountyToken',
    name: 'Bounty token',
    emoji: '🎖️',
    icon: require('../../../assets/icons/relics/tablet-gold-cross.png'),
    description: `+${goldPercent}% gold for the run.`,
    inputs: { tatteredInsignia: 3 },
    unlockedBy: ['tatteredInsignia'],
    modifier: { id: 'bountyToken', kind: 'gold', percent: goldPercent },
  },
  {
    id: 'quillCharm',
    name: 'Quill charm',
    emoji: '🪶',
    icon: require('../../../assets/icons/magic/part-grey-feather.png'),
    description: `+${xpPercent}% XP for the run.`,
    inputs: { feather: 3 },
    unlockedBy: ['feather'],
    modifier: { id: 'quillCharm', kind: 'xp', percent: xpPercent },
  },
  {
    id: 'tinkersLodestone',
    name: 'Tinker’s lodestone',
    emoji: '🧲',
    icon: require('../../../assets/icons/relics/runestone-bronze-spiral.png'),
    description: 'Gear found on the run is one rarity better.',
    inputs: { cog: 3 },
    unlockedBy: ['cog'],
    modifier: { id: 'tinkersLodestone', kind: 'rarity', steps: raritySteps },
  },
  chanceCharm('scarabCharm', 'Scarab charm', '🪲', require('../../../assets/icons/relics/amulet-violet-disc.png'), 'Treasure map', 'treasureMaps', { inputs: { chitin: 3 }, unlockedBy: ['chitin'] }),
  chanceCharm('ghostLantern', 'Ghost lantern', '🪔', require('../../../assets/icons/magic/elixir-blue-aura.png'), 'Key fragment', 'keyFragments', { inputs: { ectoplasm: 3 }, unlockedBy: ['ectoplasm'] }),
  chanceCharm('graveDustPouch', 'Grave-dust pouch', '⚱️', require('../../../assets/icons/relics/pouch-purple-dust.png'), 'Relic', 'relics', { inputs: { graveDust: 3 }, unlockedBy: ['graveDust'] }),
  chanceCharm('prismCharm', 'Prism charm', '🔷', require('../../../assets/icons/rpg/gem-purple-brilliant.png'), 'Trinket', 'trinkets', {
    inputs: {},
    anyShards: 3,
    unlockedBy: [],
  }),
  chanceCharm('architectsSeal', 'Architect’s seal', '📐', require('../../../assets/icons/magic/scroll-sealed-red.png'), 'Blueprint', 'blueprints', {
    inputs: { tatteredInsignia: 3 },
    unlockedBy: ['tatteredInsignia'],
  }),
  chanceCharm('seersCandle', 'Seer’s candle', '🕯️', require('../../../assets/icons/magic/elixir-amber-sparkle.png'), 'Training manual', 'manuals', { inputs: { ritualCandle: 3 }, unlockedBy: ['ritualCandle'] }),
];
