import { create } from 'zustand';

import type { LatLng } from '@/game/generation/types';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { TavernSpawn } from '@/game/taverns/taverns';
import type { RewardTile } from '@/game/loot/tiles';

/** Auto-gather as it runs: in the background, only while the app is open, or not at all. */
export type AutoGatherMode = 'off' | 'on' | 'limited';

type WorldState = {
  /** Where the map last saw the player. */
  player: LatLng | null;
  /** A tavern placed on the map within reach of the player, if any. */
  nearbyTavern: TavernSpawn | null;
  autoGather: AutoGatherMode;
  /** The system's location request was refused: the switch explains instead of asking again. */
  autoGatherRefused: boolean;
  /** A short note from auto-gather for the map (what it just gathered, or why it stopped). */
  autoGatherMessage: { text: string; at: number } | null;
  /** A short note from patrol fights for the map (who came back, and what it paid). */
  patrolMessage: { text: string; tiles?: RewardTile[]; at: number } | null;
  /** Patrol id → when the map first showed it, for goblins' flee timer. */
  patrolsSeen: Record<string, number>;
  /** A notification tapped patrol to centre on and select; cleared by the map. */
  focusPatrol: { id: string; latitude: number; longitude: number } | null;
  /** A notification tapped place to centre on; cleared by the map. */
  focusPlace: { latitude: number; longitude: number } | null;
  /** Pocket mode's panel, opened from the pill or a notification tap. */
  pocketPanel: 'closed' | 'open' | 'escort';
  /** The gatherer's units when the app went to the background, to count what it gathered since. */
  gathererLeftUnits: number | null;
  /** Nodes the gatherer gathered while the app was away. */
  gathererSinceLeft: number;
  /** Patrols placed by hand next to the player by the debug tools. */
  debugPatrols: PatrolSpawn[];
  /** Adds hand-placed debug patrols to the map's list; an empty list clears them. */
  addDebugPatrols: (patrols: PatrolSpawn[]) => void;
  set: (state: Partial<Omit<WorldState, 'set' | 'addDebugPatrols'>>) => void;
};

/** What the map knows about the player's surroundings, for other screens. Not saved. */
export const useWorldStore = create<WorldState>()((set) => ({
  player: null,
  nearbyTavern: null,
  autoGather: 'off',
  autoGatherRefused: false,
  autoGatherMessage: null,
  patrolMessage: null,
  patrolsSeen: {},
  focusPatrol: null,
  focusPlace: null,
  pocketPanel: 'closed',
  gathererLeftUnits: null,
  gathererSinceLeft: 0,
  debugPatrols: [],
  addDebugPatrols: (patrols) =>
    set((state) => ({ debugPatrols: patrols.length === 0 ? [] : [...state.debugPatrols, ...patrols] })),
  set: (state) => set(state),
}));
