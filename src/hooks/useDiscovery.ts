import { useEffect } from 'react';

import type { PlaceSpawn } from '@/game/places/generate';
import { discoveryNote } from '@/game/supply/discovery';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

import { useSupplyOn } from './useSupply';

/**
 * Live discovery while the app is open: each new position the map reports checks
 * the placed network places it is given, and a find shows a note on the map. The
 * store writes only when something was found.
 */
export function useDiscovery(places: PlaceSpawn[]) {
  const on = useSupplyOn();

  useEffect(() => {
    if (!on) return;
    return useWorldStore.subscribe((state, previous) => {
      const point = state.player;
      if (!point || point === previous.player) return;
      const found = useGameStore.getState().discoverPlaces(places, point);
      const note = discoveryNote(found);
      if (note) useWorldStore.getState().set({ supplyMessage: { text: note, at: Date.now() } });
    });
  }, [on, places]);
}
