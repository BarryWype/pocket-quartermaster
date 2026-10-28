import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useState } from 'react';

import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';

export const trailConfig = {
  /** A footprint is left every this many metres walked. */
  stepMeters: 4,
  /** A longer jump (GPS glitch, teleport) starts a new trail instead of drawing a line across. */
  breakMeters: 60,
  maxPoints: 400,
};

/**
 * Glints on lakes and rivers, swapped once a second. Drawn over the style's
 * water layer; only this layer's paint changes, so it's cheap.
 */
export function MapWater() {
  const frame = useAnimationFrame(1) % 2;
  return (
    <Layer
      type="fill"
      id="water-shimmer"
      source="openmaptiles"
      source-layer="water"
      afterId="water"
      paint={{ 'fill-antialias': false, 'fill-pattern': `water-${frame}` }}
    />
  );
}

/** Footprints where the player walked since the map opened. */
export function MapTrail({ position }: { position: LatLng | null }) {
  const [trail, setTrail] = useState<LatLng[][]>([]);
  const segment = trail[trail.length - 1];
  const last = segment?.[segment.length - 1];
  const moved = position && last ? distanceMeters(last, position) : Infinity;
  // Updated while rendering, as React suggests for state derived from a changing prop.
  if (position && moved >= trailConfig.stepMeters) {
    const next = !segment || moved > trailConfig.breakMeters ? [...trail, [position]] : [...trail.slice(0, -1), [...segment, position]];
    let points = next.reduce((sum, s) => sum + s.length, 0);
    while (points > trailConfig.maxPoints) points -= next.shift()?.length ?? points;
    setTrail(next);
  }

  const data: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      // A line needs two points; a fresh segment waits for its second.
      coordinates: trail.filter((s) => s.length > 1).map((s) => s.map((p) => [p.longitude, p.latitude])),
    },
  };
  return (
    <GeoJSONSource id="trail" data={data}>
      <Layer
        type="line"
        id="trail"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#4a2f1a', 'line-opacity': 0.4, 'line-width': 3, 'line-dasharray': [0.1, 2] }}
      />
    </GeoJSONSource>
  );
}
