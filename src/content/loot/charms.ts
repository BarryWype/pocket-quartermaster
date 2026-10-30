import type { LootModifier } from '@/game/loot/types';

import { lootConfig } from './config';

// The 10 charms of doc/design/loot/charms.csv: consumable-slot items that raise
// what a run finds, crafted at the alchemy panel. Each recipe is known once the
// player has seen every part (or gem) in `unlockedBy`.

export type CharmDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  inputs: Record<string, number>;
  /** Valuables by id, any tier (lowest first). */
  valuables?: Record<string, number>;
  /** Shards of any one element. */
  anyShards?: number;
  unlockedBy: string[];
  modifier: LootModifier;
};

const { chanceMultiplier, luck, goldPercent, xpPercent, qualitySteps } = lootConfig.charms;

const chanceCharm = (
  id: string,
  name: string,
  emoji: string,
  what: string,
  category: Extract<LootModifier, { kind: 'chance' }>['category'],
  recipe: Pick<CharmDef, 'inputs' | 'valuables' | 'anyShards' | 'unlockedBy'>,
): CharmDef => ({
  id,
  name,
  emoji,
  description: `${what} chance ×${chanceMultiplier} for the run, where it can drop.`,
  ...recipe,
  modifier: { id, kind: 'chance', category, multiplier: chanceMultiplier },
});

export const charms: CharmDef[] = [
  {
    id: 'luckyEar',
    name: 'Lucky ear',
    emoji: '👂',
    description: `+${luck} Luck for the party for the run.`,
    inputs: { goblinEar: 3 },
    unlockedBy: ['goblinEar'],
    modifier: { id: 'luckyEar', kind: 'luck', add: luck },
  },
  {
    id: 'bountyToken',
    name: 'Bounty token',
    emoji: '🎖️',
    description: `+${goldPercent}% gold for the run.`,
    inputs: { tatteredInsignia: 3 },
    unlockedBy: ['tatteredInsignia'],
    modifier: { id: 'bountyToken', kind: 'gold', percent: goldPercent },
  },
  {
    id: 'quillCharm',
    name: 'Quill charm',
    emoji: '🪶',
    description: `+${xpPercent}% XP for the run.`,
    inputs: { feather: 3 },
    unlockedBy: ['feather'],
    modifier: { id: 'quillCharm', kind: 'xp', percent: xpPercent },
  },
  {
    id: 'tinkersLodestone',
    name: 'Tinker’s lodestone',
    emoji: '🧲',
    description: 'Gear found on the run is one quality better.',
    inputs: { cog: 3 },
    unlockedBy: ['cog'],
    modifier: { id: 'tinkersLodestone', kind: 'quality', steps: qualitySteps },
  },
  chanceCharm('scarabCharm', 'Scarab charm', '🪲', 'Treasure map', 'treasureMaps', { inputs: { chitin: 3 }, unlockedBy: ['chitin'] }),
  chanceCharm('ghostLantern', 'Ghost lantern', '🪔', 'Key fragment', 'keyFragments', { inputs: { ectoplasm: 3 }, unlockedBy: ['ectoplasm'] }),
  chanceCharm('graveDustPouch', 'Grave-dust pouch', '⚱️', 'Relic', 'relics', { inputs: { graveDust: 3 }, unlockedBy: ['graveDust'] }),
  chanceCharm('prismCharm', 'Prism charm', '🔷', 'Trinket', 'trinkets', {
    inputs: {},
    anyShards: 2,
    valuables: { roughGem: 1 },
    unlockedBy: ['roughGem'],
  }),
  chanceCharm('architectsSeal', 'Architect’s seal', '📐', 'Blueprint', 'blueprints', {
    inputs: { tatteredInsignia: 2 },
    valuables: { cutGem: 1 },
    unlockedBy: ['tatteredInsignia', 'cutGem'],
  }),
  chanceCharm('seersCandle', 'Seer’s candle', '🕯️', 'Training manual', 'manuals', { inputs: { ritualCandle: 3 }, unlockedBy: ['ritualCandle'] }),
];
