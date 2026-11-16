import { useEffect } from 'react';

import { gatheringConfig } from '@/content/gatheringConfig';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

import { useSupplyOn } from './useSupply';

const { maxSegmentMeters, maxSegmentSeconds, maxSpeed } = gatheringConfig.autoGather;

/**
 * Live scouting while the app is open: each new position the map reports extends
 * the walked path, when the segment between it and the last one reads like a
 * walk the step counter would accept (short enough, recent enough, not too
 * fast). `scoutPath` itself writes only when a new cell was crossed.
 */
export function useScouting() {
  const on = useSupplyOn();

  useEffect(() => {
    if (!on) return;
    let last: { point: LatLng; at: number } | null = null;
    return useWorldStore.subscribe((state, previous) => {
      const point = state.player;
      if (!point) {
        last = null;
        return;
      }
      if (point === previous.player) return;
      const now = Date.now();
      if (last) {
        const meters = distanceMeters(last.point, point);
        const seconds = (now - last.at) / 1000;
        if (
          meters > 0 &&
          meters <= maxSegmentMeters &&
          seconds > 0 &&
          seconds <= maxSegmentSeconds &&
          meters / seconds <= maxSpeed
        ) {
          useGameStore.getState().scoutPath([last.point, point]);
        }
      }
      last = { point, at: now };
    });
  }, [on]);
}
