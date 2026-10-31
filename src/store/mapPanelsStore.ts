import { create } from 'zustand';

import type { PlaceSpawn } from '@/game/places/generate';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { TavernSpawn } from '@/game/taverns/taverns';

import { useWorldStore } from './worldStore';

/**
 * Which panel the map has open. Kept in its own store, away from the map
 * screen's state, so opening or closing a panel never re-renders the markers:
 * the panels read this, the map screen doesn't have to.
 */
type MapPanelsState = {
  sanctum: SanctumSpawn | null;
  tavern: TavernSpawn | null;
  place: PlaceSpawn | null;
  patrol: PatrolSpawn | null;
  openSanctum: (spawn: SanctumSpawn) => void;
  openTavern: (tavern: TavernSpawn) => void;
  openPlace: (place: PlaceSpawn) => void;
  /** Also lets go of a notification's held camera: the patrol was picked by hand. */
  openPatrol: (spawn: PatrolSpawn) => void;
  closeSanctum: () => void;
  closeTavern: () => void;
  closePlace: () => void;
  /** Also lets go of a notification's held camera. */
  closePatrol: () => void;
};

export const useMapPanels = create<MapPanelsState>()((set) => ({
  sanctum: null,
  tavern: null,
  place: null,
  patrol: null,
  openSanctum: (spawn) => set({ sanctum: spawn }),
  openTavern: (tavern) => set({ tavern }),
  openPlace: (place) => set({ place }),
  openPatrol: (spawn) => {
    set({ patrol: spawn });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  closeSanctum: () => set({ sanctum: null }),
  closeTavern: () => set({ tavern: null }),
  closePlace: () => set({ place: null }),
  closePatrol: () => {
    set({ patrol: null });
    useWorldStore.getState().set({ focusPatrol: null });
  },
}));
