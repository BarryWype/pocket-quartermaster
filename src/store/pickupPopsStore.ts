import { create } from 'zustand';

import type { LatLng, ResourceKind } from '@/game/generation/types';

/** One collect burst playing on the map where a resource was gathered. */
export type PickupPop = { id: number; position: LatLng; kind: ResourceKind; emoji?: string };

/**
 * How long a pop lives even when nothing draws it (animations off, another
 * screen shown), so entries never linger and the store expiring them is the
 * backstop; the burst dismisses itself sooner when its last frame plays.
 */
const POP_MS = 1800;
/** How many pops play at once; the oldest rolls off the front. */
const MAX_POPS = 6;

let nextId = 1;

type PickupPopsState = {
  pops: PickupPop[];
  /** Plays a burst at a gathered spawn's last known position. */
  show: (position: LatLng, kind: ResourceKind, emoji?: string) => void;
  /** What a burst calls when its last frame has played. */
  dismiss: (id: number) => void;
};

/**
 * The map's collect bursts, kept apart from the map screen's state so gathering
 * never re-renders the markers: only <PickupPops> reads this.
 */
export const usePickupPops = create<PickupPopsState>((set) => ({
  pops: [],
  show: (position, kind, emoji) => {
    const id = nextId++;
    set((state) => ({ pops: [...state.pops, { id, position, kind, emoji }].slice(-MAX_POPS) }));
    setTimeout(() => set((state) => ({ pops: state.pops.filter((p) => p.id !== id) })), POP_MS);
  },
  dismiss: (id) => set((state) => ({ pops: state.pops.filter((p) => p.id !== id) })),
}));
