import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { colors } from '@/theme';

export type RangeCircle = { id: string; center: LatLng; radius: number; kind: 'auto' | 'tap' | 'node' | 'patrol' };

const SIDES = 48;

function circle({ id, center, radius, kind }: RangeCircle): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = Array.from({ length: SIDES + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / SIDES;
    const point = offsetPosition(center, radius * Math.cos(angle), radius * Math.sin(angle));
    return [point.longitude, point.latitude];
  });
  return { type: 'Feature', id, properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Faint circles on the map: auto-gather's radius around the player, a patrol's engage range, and (debug) tap and node ranges. */
export function MapRanges({ circles }: { circles: RangeCircle[] }) {
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: circles.map(circle) };
  return (
    <GeoJSONSource id="ranges" data={data}>
      <Layer type="fill" id="ranges-fill" paint={{ 'fill-color': ['match', ['get', 'kind'], 'auto', colors.success, 'tap', colors.wood, 'patrol', colors.danger, colors.gold], 'fill-opacity': 0.12 }} />
      <Layer type="line" id="ranges-line" paint={{ 'line-color': ['match', ['get', 'kind'], 'auto', colors.success, 'tap', colors.wood, 'patrol', colors.danger, colors.gold], 'line-opacity': 0.6, 'line-width': 1.5 }} />
    </GeoJSONSource>
  );
}
