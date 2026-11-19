import { create } from 'zustand';

import type { PlaceSpawn } from '@/game/places/generate';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { RoutePoint } from '@/game/supply/types';
import type { TavernSpawn } from '@/game/taverns/taverns';
import type { LatLng } from '@/game/generation/types';
import { cellAt } from '@/game/discovery/cells';

import { useWorldStore } from './worldStore';

/** One row of the chooser for overlapping markers: the marker's icon, name and status, and what picking it opens. */
export type ChooserEntry = { id: string; emoji: string; name: string; status: string; open: () => void };

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
  /** The hall sheet's cell (the player's, the hall's, or one picked on the map), or the building sheet's building id. */
  hallCell: string | null;
  supplyBuilding: string | null;
  /** Placing or moving the hall: the next map tap picks its cell. The only time an empty map tap does anything, besides the planner's via points. */
  placingHall: boolean;
  /** The cart's sheet. */
  cartOpen: boolean;
  /** The route planner sheet: null when it is closed, else the route it opens on. */
  routePlanner: RoutePoint[] | null;
  /** A tap that landed on more than one marker: the list to pick from, anchored at the tapped marker's screen point. */
  chooser: { anchor: { x: number; y: number } | null; entries: ChooserEntry[] } | null;
  openChooser: (chooser: { anchor: { x: number; y: number } | null; entries: ChooserEntry[] }) => void;
  closeChooser: () => void;
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
  /** The hall sheet for a cell: place or move the hall there. */
  openHall: (cell: string) => void;
  /** The next map tap picks the hall's cell; every sheet closes so the map is free. */
  startPlacingHall: () => void;
  cancelPlacingHall: () => void;
  openSupplyBuilding: (id: string) => void;
  openCart: () => void;
  /** Opens the route planner on a starting route, closing every other map sheet. */
  openRoutePlanner: (route: RoutePoint[]) => void;
  /** Closes the route planner. */
  closeRoutePlanner: () => void;
  setPlannerAdjusting: (adjusting: boolean) => void;
  /** A tap on the empty map: a via point while the planner adjusts the route, the hall's cell while placing it, else nothing. */
  tapMap: (position: LatLng) => void;
  closeSanctum: () => void;
  closeTavern: () => void;
  closePlace: () => void;
  closeSite: () => void;
  /** Also lets go of a notification's held camera. */
  closePatrol: () => void;
  closeHall: () => void;
  closeSupplyBuilding: () => void;
  closeCart: () => void;
};

export const useMapPanels = create<MapPanelsState>()((set) => ({
  sanctum: null,
  tavern: null,
  place: null,
  patrol: null,
  site: null,
  hallCell: null,
  supplyBuilding: null,
  placingHall: false,
  cartOpen: false,
  routePlanner: null,
  chooser: null,
  openChooser: (chooser) => set({ chooser }),
  closeChooser: () => set({ chooser: null }),
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
  openHall: (cell) => set({ hallCell: cell, supplyBuilding: null, placingHall: false }),
  startPlacingHall: () => {
    set({ placingHall: true, hallCell: null, sanctum: null, tavern: null, place: null, patrol: null, site: null, supplyBuilding: null, cartOpen: false });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  cancelPlacingHall: () => set({ placingHall: false }),
  openSupplyBuilding: (id) => set({ supplyBuilding: id, hallCell: null }),
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
      hallCell: null,
      supplyBuilding: null,
      placingHall: false,
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
        : state.placingHall
          ? { hallCell: cellAt(position), placingHall: false, supplyBuilding: null }
          : {},
    ),
  closeSanctum: () => set({ sanctum: null }),
  closeTavern: () => set({ tavern: null }),
  closePlace: () => set({ place: null }),
  closeSite: () => set({ site: null }),
  closePatrol: () => {
    set({ patrol: null });
    useWorldStore.getState().set({ focusPatrol: null });
  },
  closeHall: () => set({ hallCell: null }),
  closeSupplyBuilding: () => set({ supplyBuilding: null }),
  closeCart: () => set({ cartOpen: false }),
}));
