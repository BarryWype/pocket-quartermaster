import type { EventDef } from '@/game/types';

// Non-combat encounters a dungeon can roll. Add new kinds in `game/types.ts`
// (`EventDef`) and handle them in `game/expeditions/simulate.ts`.
export const events: EventDef[] = [
  { id: 'spring', name: 'healing spring', kind: 'spring', healPct: 0.3 },
  { id: 'cache', name: 'hidden cache', kind: 'cache', goldShare: 0.25 },
  { id: 'ambush', name: 'ambush', kind: 'ambush' },
];

export const eventById = Object.fromEntries(events.map((e) => [e.id, e]));
