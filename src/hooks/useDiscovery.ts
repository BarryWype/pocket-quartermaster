import { useEffect } from 'react';

import { discoveryNote, networkPlacesAround } from '@/game/supply/discovery';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

import { useSupplyOn } from './useSupply';

/**
 * Live discovery while the app is open: each new position the map reports checks
 * the network places around it, and a find shows a note on the map. The store
 * writes only when something was found.
 */
export function useDiscovery() {
  const on = useSupplyOn();

  useEffect(() => {
    if (!on) return;
    return useWorldStore.subscribe((state, previous) => {
      const point = state.player;
      if (!point || point === previous.player) return;
      const save = useGameStore.getState().save;
      const found = useGameStore.getState().discoverPlaces(networkPlacesAround(save, point, Date.now()), point);
      const note = discoveryNote(found);
      if (note) useWorldStore.getState().set({ supplyMessage: { text: note, at: Date.now() } });
    });
  }, [on]);
}
