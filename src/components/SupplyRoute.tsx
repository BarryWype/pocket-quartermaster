import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';

import { tileBounds } from '@/game/generation/tiles';
import { routePoints } from '@/game/supply/cart';
import { useSupplyOn } from '@/hooks/useSupply';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors } from '@/theme';

/**
 * The cart's route on the map: the draft's line while planning (dashed, with
 * each crossed cell tinted by its danger level), else the running loop's
 * line, else the parked route's.
 */
export const SupplyRoute = memo(function SupplyRoute() {
  const on = useSupplyOn();
  const draft = useMapPanels((state) => state.routeDraft);
  const preview = useMapPanels((state) => state.draftPreview);
  const save = useGameStore((state) => state.save);
  const planning = draft !== null;

  // Only points here: the danger of each crossed cell comes from the planner's preview, computed off the render.
  const line = useMemo(() => {
    if (draft) return routePoints(save, draft);
    const cart = save.supply.cart;
    return cart.loop ? cart.loop.points : routePoints(save, cart.route);
  }, [draft, save]);
  const cells = planning ? (preview?.cells ?? []) : [];

  // The hall and back with no stop between is no route.
  if (!on || line.length < 3) return null;
  const lineData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'supply-route',
        properties: {},
        geometry: { type: 'LineString', coordinates: line.map((point) => [point.longitude, point.latitude]) },
      },
    ],
  };
  const cellData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cells
      .filter((cell) => cell.level > 0)
      .map((cell) => {
        const { minLat, minLon, maxLat, maxLon } = tileBounds(cell.cell);
        return {
          type: 'Feature' as const,
          id: cell.cell,
          properties: { level: cell.level },
          geometry: { type: 'Polygon' as const, coordinates: [[[minLon, minLat], [minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat]]] },
        };
      }),
  };
  return (
    <>
      {planning && (
        <GeoJSONSource id="supply-route-cells" data={cellData}>
          <Layer
            type="fill"
            id="supply-route-cells-fill"
            minzoom={14}
            paint={{
              'fill-color': ['match', ['get', 'level'], 1, colors.gold, 2, '#d98a2e', 3, colors.danger, colors.ink],
              'fill-opacity': 0.25,
            }}
          />
        </GeoJSONSource>
      )}
      <GeoJSONSource id="supply-route" data={lineData}>
        <Layer
          type="line"
          id="supply-route-line"
          paint={{ 'line-color': colors.gold, 'line-width': 3, ...(planning ? { 'line-dasharray': [2, 2] } : {}) }}
        />
      </GeoJSONSource>
    </>
  );
});
