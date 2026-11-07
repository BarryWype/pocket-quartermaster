import type { NpcDef } from '@/game/types';

// People met in dungeons (`locals` encounters). With no Locals threat they are
// always quiet steps: only their names are read.
export const npcs: NpcDef[] = [
  {
    id: 'tollTroll',
    name: 'toll troll',
    description: 'A bored troll who wants a coin for the bridge it doesn’t own.',
  },
  {
    id: 'hermit',
    name: 'wandering hermit',
    description: 'An old hermit with a kettle and too many opinions.',
  },
  {
    id: 'pedlar',
    name: 'pedlar',
    description: 'A pedlar with a cart of tonics, odds and ends, and a nose for a bargain.',
  },
  {
    id: 'lostMiner',
    name: 'lost miner',
    description: 'A miner who has been down here far too long and knows every loose stone.',
  },
  {
    id: 'poachers',
    name: 'poachers’ camp',
    description: 'Poachers around a fire, who don’t like being seen.',
  },
];

export const npcById = Object.fromEntries(npcs.map((n) => [n.id, n]));
