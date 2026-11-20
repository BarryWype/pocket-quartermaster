import { create } from 'zustand';

import type { PlaceSpawn } from '@/game/places/generate';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { RoutePoint, StreetPath } from '@/game/supply/types';
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
  /** Placing or moving the hall: the next map tap picks its cell. The only time an empty map tap does anything. */
  placingHall: boolean;
  /** The cart's sheet. */
  cartOpen: boolean;
  /**
   * Route mode on the map: the route being edited (`draft`) and the one it
   * opened on (`start`, to tell whether leaving loses changes); null when off.
   */
  routeMode: { draft: RoutePoint[]; start: RoutePoint[] } | null;
  /** The draft's grab point the player tapped (its index in the draft), for Remove. */
  selectedGrab: number | null;
  /** A tap that landed on more than one marker: the list to pick from, anchored at the tapped marker's screen point. */
  chooser: { anchor: { x: number; y: number } | null; entries: ChooserEntry[] } | null;
  openChooser: (chooser: { anchor: { x: number; y: number } | null; entries: ChooserEntry[] }) => void;
  closeChooser: () => void;
  /** The draft's route along the streets: the map draws it instead of the saved route while route mode is on. */
  routePath: StreetPath | null;
  setRoutePath: (path: StreetPath | null) => void;
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
  /** Turns route mode on with a route to edit (with a stop already added for "Add to route"), closing every map sheet. */
  openRouteMode: (route: RoutePoint[]) => void;
  /** The draft after an edit; a selected grab point is let go. */
  setRouteDraft: (draft: RoutePoint[]) => void;
  selectGrab: (index: number | null) => void;
  /** Leaves route mode, keeping nothing of the draft (Save writes the route first). */
  closeRouteMode: () => void;
  /** A tap on the empty map: the hall's cell while placing it, else nothing. */
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
  routeMode: null,
  selectedGrab: null,
  chooser: null,
  openChooser: (chooser) => set({ chooser }),
  closeChooser: () => set({ chooser: null }),
  routePath: null,
  setRoutePath: (path) => set({ routePath: path }),
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
  openRouteMode: (route) => {
    set({
      routeMode: { draft: route, start: route },
      selectedGrab: null,
      routePath: null,
      chooser: null,
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
  setRouteDraft: (draft) => set((state) => (state.routeMode ? { routeMode: { ...state.routeMode, draft }, selectedGrab: null } : {})),
  selectGrab: (index) => set({ selectedGrab: index }),
  closeRouteMode: () => set({ routeMode: null, selectedGrab: null, routePath: null }),
  tapMap: (position) => set((state) => (state.placingHall ? { hallCell: cellAt(position), placingHall: false, supplyBuilding: null } : {})),
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
