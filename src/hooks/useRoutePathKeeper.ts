import { useEffect } from 'react';

import { effectiveRoute } from '@/game/supply/autoRoute';
import { findStreetPath } from '@/services/streetPath';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

/**
 * After the route changes by itself (the route toast's note), finds its street
 * path and keeps it, unless the route changed again meanwhile. Until then the
 * cart has the straight path, or the old one passing where a stop was.
 */
export function useRoutePathKeeper() {
  useEffect(
    () =>
      useWorldStore.subscribe((state, previous) => {
        if (!state.routeNote || state.routeNote === previous.routeNote) return;
        const save = useGameStore.getState().save;
        const route = effectiveRoute(save);
        if (route.length === 0) return;
        void findStreetPath(save, route).then((path) => {
          if (path) useGameStore.getState().keepRoutePath(route, path);
        });
      }),
    [],
  );
}
