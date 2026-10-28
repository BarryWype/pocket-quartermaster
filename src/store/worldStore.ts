import { create } from 'zustand';

import type { LatLng } from '@/game/generation/types';
import type { TavernSpawn } from '@/game/taverns/taverns';

/** Auto-gather as it runs: in the background, only while the app is open, or not at all. */
export type AutoGatherMode = 'off' | 'on' | 'limited';

type WorldState = {
  /** Where the map last saw the player. */
  player: LatLng | null;
  /** A tavern placed on the map within reach of the player, if any. */
  nearbyTavern: TavernSpawn | null;
  autoGather: AutoGatherMode;
  /** A short note from auto-gather for the map (what it just gathered, or why it stopped). */
  autoGatherMessage: { text: string; at: number } | null;
  set: (state: Partial<Omit<WorldState, 'set'>>) => void;
};

/** What the map knows about the player's surroundings, for other screens. Not saved. */
export const useWorldStore = create<WorldState>()((set) => ({
  player: null,
  nearbyTavern: null,
  autoGather: 'off',
  autoGatherMessage: null,
  set: (state) => set(state),
}));
