import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import ngeohash from 'ngeohash';
import { memo, useEffect, useMemo, useState } from 'react';

import { patrolRules } from '@/content/patrols';
import { clockConfig } from '@/content/clockConfig';
import { supplyRules } from '@/content/supplyLines';
import type { Bounds } from '@/game/generation/foliage';
import { distanceMeters } from '@/game/generation/geo';
import { tileBounds, tilesWithin } from '@/game/generation/tiles';
import { windowIndex } from '@/game/generation/time';
import type { LatLng } from '@/game/generation/types';
import { cellDangers, dangerContextOf } from '@/game/supply/danger';
import { useNow } from '@/hooks/useNow';
import { useSupplyOn } from '@/hooks/useSupply';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

/** How many cells a view may draw: a tint over the whole view is 150–300 cells at high zoom. */
const MAX_CELLS = 400;
/** The fallback view when the map has not reported its bounds yet. */
const FALLBACK_METERS = 600;
/** A view wider than this (corner to corner) is below the layers' zoom 16. */
const MAX_VIEW_METERS = 2000;

type Props = { bounds: Bounds | null; position: LatLng };

/** The danger tint's cache: one entry per (cells, patrol window), so the half-hourly reshuffle recomputes once. */
const dangerCache = new Map<string, Record<string, { score: number; level: 0 | 1 | 2 | 3 }>>();

/** The debug danger tint over the cells in view, computed a tick late and cached per patrol window. */
function DangerLayers({ cells }: { cells: string[] }) {
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.spawnsMs);
  const window = windowIndex(now, patrolRules.windowMinutes);
  const key = `${cells.join(',')}|${window}`;
  const [computed, setComputed] = useState<{ key: string; value: Record<string, { score: number; level: 0 | 1 | 2 | 3 }> } | null>(null);

  useEffect(() => {
    if (dangerCache.has(key) || computed?.key === key) return;
    const timer = setTimeout(() => {
      const value = cellDangers(cells, Date.now(), dangerContextOf(save));
      if (dangerCache.size > 8) dangerCache.delete(dangerCache.keys().next().value!);
      dangerCache.set(key, value);
      setComputed({ key, value });
    });
    return () => clearTimeout(timer);
    // The key covers the cells and the window; `save` is read when the timer runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const dangers = dangerCache.get(key) ?? (computed?.key === key ? computed.value : null);
  if (!dangers) return null;
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cells.map((cell) => {
      const { minLat, minLon, maxLat, maxLon } = tileBounds(cell);
      return {
        type: 'Feature',
        id: cell,
        properties: { level: dangers[cell]?.level ?? 0 },
        geometry: { type: 'Polygon', coordinates: [[[minLon, minLat], [minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat]]] },
      };
    }),
  };
  return (
    <GeoJSONSource id="supply-danger" data={data}>
      <Layer
        type="fill"
        id="supply-danger-fill"
        minzoom={16}
        paint={{
          'fill-color': ['match', ['get', 'level'], 1, colors.gold, 2, '#d98a2e', 3, colors.danger, colors.ink],
          'fill-opacity': ['match', ['get', 'level'], 0, 0, 0.25],
        }}
      />
    </GeoJSONSource>
  );
}

/** The supply lines on the map: the debug danger tint over the cells in view. Nothing renders while the switch is off. */
export const SupplyLayers = memo(function SupplyLayers({ bounds, position }: Props) {
  const on = useSupplyOn();
  const showDanger = useDebugStore((s) => s.showDanger);

  const cells = useMemo(() => {
    // Zoomed out past the layers' minzoom, a view holds thousands of cells: list none.
    if (bounds && distanceMeters({ latitude: bounds[1], longitude: bounds[0] }, { latitude: bounds[3], longitude: bounds[2] }) > MAX_VIEW_METERS) return [];
    const list = bounds
      ? ngeohash.bboxes(bounds[1], bounds[0], bounds[3], bounds[2], supplyRules.cellPrecision)
      : tilesWithin(position, FALLBACK_METERS, supplyRules.cellPrecision);
    return list.slice(0, MAX_CELLS);
  }, [bounds, position]);

  if (!on) return null;
  return <>{showDanger && <DangerLayers cells={cells} />}</>;
});
