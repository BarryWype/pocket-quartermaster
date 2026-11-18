import { create } from 'zustand';

import type { PlaceSpawn } from '@/game/places/generate';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { RoutePoint } from '@/game/supply/types';
import type { TavernSpawn } from '@/game/taverns/taverns';
import type { LatLng } from '@/game/generation/types';
import { cellAt } from '@/game/discovery/cells';

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
  /** The site sheet's site. */
  site: PlaceSpawn | null;
  /** The supply cell sheet's cell, or the building sheet's building id. */
  supplyCell: string | null;
  supplyBuilding: string | null;
  /** The cart's sheet. */
  cartOpen: boolean;
  /** The route planner sheet: null when it is closed, else the route it opens on. */
  routePlanner: RoutePoint[] | null;
  /** The planner shrunk to a bar on its result step: only then does a map tap mean a via point. */
  plannerAdjusting: boolean;
  /** A tap on the map while the planner is adjusting, waiting to become a via point. */
  plannerTap: { position: LatLng; seq: number } | null;
  openSanctum: (spawn: SanctumSpawn) => void;
  openTavern: (tavern: TavernSpawn) => void;
  openPlace: (place: PlaceSpawn) => void;
  openSite: (site: PlaceSpawn) => void;
  /** Also lets go of a notification's held camera: the patrol was picked by hand. */
  openPatrol: (spawn: PatrolSpawn) => void;
  openSupplyCell: (cell: string) => void;
  openSupplyBuilding: (id: string) => void;
  openCart: () => void;
  /** Opens the route planner on a starting route, closing every other map sheet. */
  openRoutePlanner: (route: RoutePoint[]) => void;
  /** Closes the route planner. */
  closeRoutePlanner: () => void;
  setPlannerAdjusting: (adjusting: boolean) => void;
  /** A tap on the network's map: a via point while the planner adjusts the route, else the cell's sheet. */
  tapMap: (position: LatLng) => void;
  closeSanctum: () => void;
  closeTavern: () => void;
  closePlace: () => void;
  closeSite: () => void;
  /** Also lets go of a notification's held camera. */
  closePatrol: () => void;
  closeSupplyCell: () => void;
  closeSupplyBuilding: () => void;
  closeCart: () => void;
};

export const useMapPanels = create<MapPanelsState>()((set) => ({
  sanctum: null,
  tavern: null,
  place: null,
  patrol: null,
  site: null,
  supplyCell: null,
  supplyBuilding: null,
  cartOpen: false,
  routePlanner: null,
  plannerAdjusting: false,
  plannerTap: null,
  openSanctum: (spawn) => set({ sanctum: spawn }),
  openTavern: (tavern) => set({ tavern }),
  openPlace: (place) => set({ place }),
  openSite: (site) => set({ site }),
  openPatrol: (spawn) => {
    set({ patrol: spawn });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  openSupplyCell: (cell) => set({ supplyCell: cell, supplyBuilding: null }),
  openSupplyBuilding: (id) => set({ supplyBuilding: id, supplyCell: null }),
  openCart: () => set({ cartOpen: true }),
  openRoutePlanner: (route) => {
    set({
      routePlanner: route,
      plannerAdjusting: false,
      plannerTap: null,
      sanctum: null,
      tavern: null,
      place: null,
      patrol: null,
      site: null,
      supplyCell: null,
      supplyBuilding: null,
      cartOpen: false,
    });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  closeRoutePlanner: () => set({ routePlanner: null, plannerAdjusting: false, plannerTap: null }),
  setPlannerAdjusting: (adjusting) => set({ plannerAdjusting: adjusting }),
  tapMap: (position) =>
    set((state) =>
      state.routePlanner !== null && state.plannerAdjusting
        ? { plannerTap: { position, seq: (state.plannerTap?.seq ?? 0) + 1 } }
        : { supplyCell: cellAt(position), supplyBuilding: null },
    ),
  closeSanctum: () => set({ sanctum: null }),
  closeTavern: () => set({ tavern: null }),
  closePlace: () => set({ place: null }),
  closeSite: () => set({ site: null }),
  closePatrol: () => {
    set({ patrol: null });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  closeSupplyCell: () => set({ supplyCell: null }),
  closeSupplyBuilding: () => set({ supplyBuilding: null }),
  closeCart: () => set({ cartOpen: false }),
}));
