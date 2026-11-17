import { create } from 'zustand';

import type { PlaceSpawn } from '@/game/places/generate';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { routePreview } from '@/game/supply/cart';
import type { RoutePoint } from '@/game/supply/types';
import type { TavernSpawn } from '@/game/taverns/taverns';
import type { LatLng } from '@/game/generation/types';

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
  /** The planner's step, so the map knows when a tap means a via point. */
  plannerStep: 1 | 2 | 3;
  /** A tap on the map while the planner is on its result step, waiting to become a via point. */
  plannerTap: { position: LatLng; seq: number } | null;
  /** The route being drawn in the map's planner, or null when it is closed. */
  routeDraft: RoutePoint[] | null;
  /** The planner's last preview of the draft (length, time, each crossed cell's danger), shared with the map's route layer. */
  draftPreview: ReturnType<typeof routePreview> | null;
  openSanctum: (spawn: SanctumSpawn) => void;
  openTavern: (tavern: TavernSpawn) => void;
  openPlace: (place: PlaceSpawn) => void;
  openSite: (site: PlaceSpawn) => void;
  /** Also lets go of a notification's held camera: the patrol was picked by hand. */
  openPatrol: (spawn: PatrolSpawn) => void;
  openSupplyCell: (cell: string) => void;
  openSupplyBuilding: (id: string) => void;
  openCart: () => void;
  /** Opens the route planner on a starting route, closing the cart's sheet. */
  openRoutePlanner: (route: RoutePoint[]) => void;
  /** Closes the route planner. */
  closeRoutePlanner: () => void;
  setPlannerStep: (step: 1 | 2 | 3) => void;
  /** Notes a map tap for the planner's result step. */
  notePlannerTap: (position: LatLng) => void;
  /** Opens the map's route planner on a starting route, closing the cart's sheet. */
  planRoute: (route: RoutePoint[]) => void;
  /** Appends a point to the planner's draft. */
  addToRoute: (point: RoutePoint) => void;
  /** Drops the draft's last point. */
  undoRoute: () => void;
  /** Empties the draft, keeping the planner open. */
  clearRoute: () => void;
  setDraftPreview: (preview: ReturnType<typeof routePreview> | null) => void;
  closeSanctum: () => void;
  closeTavern: () => void;
  closePlace: () => void;
  closeSite: () => void;
  /** Also lets go of a notification's held camera. */
  closePatrol: () => void;
  closeSupplyCell: () => void;
  closeSupplyBuilding: () => void;
  closeCart: () => void;
  cancelRoute: () => void;
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
  plannerStep: 1,
  plannerTap: null,
  routeDraft: null,
  draftPreview: null,
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
  openRoutePlanner: (route) => set({ routePlanner: route, plannerStep: 1, plannerTap: null, cartOpen: false }),
  closeRoutePlanner: () => set({ routePlanner: null, plannerTap: null }),
  setPlannerStep: (step) => set({ plannerStep: step }),
  notePlannerTap: (position) => set((state) => ({ plannerTap: { position, seq: (state.plannerTap?.seq ?? 0) + 1 } })),
  planRoute: (route) => set({ routeDraft: route, cartOpen: false }),
  addToRoute: (point) => set((state) => ({ routeDraft: [...(state.routeDraft ?? []), point] })),
  undoRoute: () => set((state) => ({ routeDraft: state.routeDraft?.slice(0, -1) ?? null })),
  clearRoute: () => set({ routeDraft: [] }),
  setDraftPreview: (draftPreview) => set({ draftPreview }),
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
  cancelRoute: () => set({ routeDraft: null, draftPreview: null }),
}));
