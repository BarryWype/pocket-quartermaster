import type { Tier } from '@/game/types';

/** Forge tiers in progression order. */
export const tiers: { id: Tier; name: string }[] = [
  { id: 'wood', name: 'Wood' },
  { id: 'stone', name: 'Stone' },
  { id: 'copper', name: 'Copper' },
  { id: 'iron', name: 'Iron' },
  { id: 'steel', name: 'Steel' },
];
