import { create } from 'zustand';

import type { LatLng } from '@/game/generation/types';
import type { TavernSpawn } from '@/game/taverns/taverns';

type WorldState = {
  /** Where the map last saw the player. */
  player: LatLng | null;
  /** A tavern placed on the map within reach of the player, if any. */
  nearbyTavern: TavernSpawn | null;
  set: (state: Partial<Omit<WorldState, 'set'>>) => void;
};

/** What the map knows about the player's surroundings, for other screens. Not saved. */
export const useWorldStore = create<WorldState>()((set) => ({
  player: null,
  nearbyTavern: null,
  set: (state) => set(state),
}));
