import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';

import { useSupplyOn } from '@/hooks/useSupply';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

/**
 * The cart's route on the map: the stored street path's points, dashed while a
 * changed route waits for the next departure. One GeoJSON line, memoised on
 * the path object.
 */
export const SupplyRoute = memo(function SupplyRoute() {
  const on = useSupplyOn();
  const path = useGameStore((s) => s.save.supply.cart.nextPath ?? s.save.supply.cart.path);
  const pending = useGameStore((s) => s.save.supply.cart.loop !== null && s.save.supply.cart.nextPath !== null);

  const lineData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'supply-route',
          properties: {},
          geometry: { type: 'LineString', coordinates: (path?.points ?? []).map((point) => [point.longitude, point.latitude]) },
        },
      ],
    }),
    [path],
  );

  // The hall and back with no stop between is no route.
  if (!on || !path || path.points.length < 3) return null;
  return (
    <GeoJSONSource id="supply-route" data={lineData}>
      <Layer
        type="line"
        id="supply-route-line"
        paint={{ 'line-color': colors.gold, 'line-width': 3, ...(pending ? { 'line-dasharray': [2, 2] } : {}) }}
      />
    </GeoJSONSource>
  );
});
