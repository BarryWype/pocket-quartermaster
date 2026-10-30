import { patrolTexts } from '../patrols';

// The base items that are not materials, shards, stones, parts, components,
// valuables or relics: display entries for inventory tiles.

export type BaseItemDef = {
  name: string;
  emoji: string;
  description?: string;
};

export const baseItems = {
  keyFragment: { name: patrolTexts.keyFragment.name, emoji: '🔑', description: patrolTexts.keyFragment.description },
  mysteriousKey: {
    name: 'Mysterious key',
    emoji: '🗝️',
    description: 'Opens a sealed place. Four key fragments make one.',
  },
  treasureMap: { name: 'Treasure map', emoji: '🗺️' },
  trainingManual: { name: 'Training manual', emoji: '📖' },
  blueprint: { name: 'Blueprint', emoji: '📜' },
} as Record<string, BaseItemDef>;
