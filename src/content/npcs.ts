import type { NpcDef } from '@/game/types';

// People met in dungeons (`locals` encounters). How they react depends on the
// party's abilities: charm → help, provoke → fight, pickpocket → steal (they may
// notice), otherwise nothing happens. Their hostile form is scaled to the
// dungeon's tier in `enemies.ts`.
export const npcs: NpcDef[] = [
  {
    id: 'tollTroll',
    name: 'toll troll',
    description: 'A bored troll who wants a coin for the bridge it doesn’t own.',
    help: { kind: 'gold', share: 0.3 },
    hostile: { name: 'toll troll', count: 1, hp: 30, damage: 7 },
  },
  {
    id: 'hermit',
    name: 'wandering hermit',
    description: 'An old hermit with a kettle and too many opinions.',
    help: { kind: 'heal', pct: 0.5 },
    hostile: { name: 'angry hermit', count: 1, hp: 18, damage: 5 },
  },
  {
    id: 'pedlar',
    name: 'pedlar',
    description: 'A pedlar with a cart of tonics, odds and ends, and a nose for a bargain.',
    help: { kind: 'heal', pct: 0.5 },
    hostile: { name: 'pedlar’s guard', count: 2, hp: 14, damage: 5 },
  },
  {
    id: 'lostMiner',
    name: 'lost miner',
    description: 'A miner who has been down here far too long and knows every loose stone.',
    help: { kind: 'tip' },
    hostile: { name: 'frantic miner', count: 1, hp: 16, damage: 5 },
  },
  {
    id: 'poachers',
    name: 'poachers’ camp',
    description: 'Poachers around a fire, who don’t like being seen.',
    help: { kind: 'heal', pct: 0.4 },
    hostile: { name: 'poacher', count: 3, hp: 12, damage: 4 },
  },
];

export const localsRules = {
  /** Gold a pickpocket lifts, as a share of the dungeon's top gold reward. */
  pickpocketGoldShare: 0.2,
  /** Chance the locals notice the pickpocket and fight. */
  noticeChance: 0.3,
};

export const npcById = Object.fromEntries(npcs.map((n) => [n.id, n]));
