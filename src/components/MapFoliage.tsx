import { GeoJSONSource, Images, Layer, type MapRef } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import {
  buildingPosts,
  chimneySmoke,
  foliageConfig,
  foliageToGeoJSON,
  placeFoliage,
  type FoliageObstacles,
} from '@/game/generation/foliage';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';

// Frames are drawn by scripts/generate-foliage-sprites.py; swap in real art with the same names.
const SPRITES = {
  'bush-0': require('../../assets/sprites/bush-0.png'),
  'bush-1': require('../../assets/sprites/bush-1.png'),
  'bush-2': require('../../assets/sprites/bush-2.png'),
  'bush-3': require('../../assets/sprites/bush-3.png'),
  'tree-0': require('../../assets/sprites/tree-0.png'),
  'tree-1': require('../../assets/sprites/tree-1.png'),
  'tree-2': require('../../assets/sprites/tree-2.png'),
  'tree-3': require('../../assets/sprites/tree-3.png'),
  'pine-0': require('../../assets/sprites/pine-0.png'),
  'pine-1': require('../../assets/sprites/pine-1.png'),
  'pine-2': require('../../assets/sprites/pine-2.png'),
  'pine-3': require('../../assets/sprites/pine-3.png'),
  'birch-0': require('../../assets/sprites/birch-0.png'),
  'birch-1': require('../../assets/sprites/birch-1.png'),
  'birch-2': require('../../assets/sprites/birch-2.png'),
  'birch-3': require('../../assets/sprites/birch-3.png'),
  'blossom-0': require('../../assets/sprites/blossom-0.png'),
  'blossom-1': require('../../assets/sprites/blossom-1.png'),
  'blossom-2': require('../../assets/sprites/blossom-2.png'),
  'blossom-3': require('../../assets/sprites/blossom-3.png'),
  post: require('../../assets/sprites/post.png'),
  'smoke-0': require('../../assets/sprites/smoke-0.png'),
  'smoke-1': require('../../assets/sprites/smoke-1.png'),
  'smoke-2': require('../../assets/sprites/smoke-2.png'),
  'smoke-3': require('../../assets/sprites/smoke-3.png'),
};

/** Classic sprite-animation speed; slow enough to be cheap. */
const FPS = 4;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Layer ids from content/mapStyle.ts. Clearances are a little under half the drawn widths at zoom 17, so plants grow up to the road edges.
// Residential land isn't blocked: buildings, water and roads are, so plants fill the gardens between them.
const LINE_LAYERS = [
  { layer: 'road-edge', clearance: 6 },
  { layer: 'road-minor', clearance: 4 },
  { layer: 'path', clearance: 3 },
  { layer: 'waterway', clearance: 4 },
];
const BARE_LANDCOVER = ['sand', 'farmland'];

async function queryObstacles(map: MapRef): Promise<FoliageObstacles & { buildings: GeoJSON.Feature[] }> {
  const query = (layer: string) => map.queryRenderedFeatures({ layers: [layer] });
  const [buildings, water, landcover, parks, ...lines] = await Promise.all([
    query('building'),
    query('water'),
    query('landcover'),
    query('park'),
    ...LINE_LAYERS.map(({ layer }) => query(layer)),
  ]);
  const landClass = (feature: GeoJSON.Feature) => feature.properties?.class as string | undefined;
  return {
    buildings,
    blocked: [...buildings, ...water, ...landcover.filter((f) => BARE_LANDCOVER.includes(landClass(f) ?? ''))],
    wooded: [...parks, ...landcover.filter((f) => landClass(f) === 'wood')],
    lines: LINE_LAYERS.flatMap(({ clearance }, i) => lines[i].map((feature) => ({ feature, clearance }))),
  };
}

/**
 * Scatters bushes and trees on open ground around the current view, posts on
 * building corners and, when `smoke` is on, smoke from a few chimneys. Call
 * `refresh` when the view changes; it re-reads the drawn map, then once more
 * after a moment for tiles that were still loading.
 */
export function useFoliage(mapRef: RefObject<MapRef | null>, smoke: boolean) {
  const [data, setData] = useState<GeoJSON.FeatureCollection>(EMPTY);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Querying the map before it has loaded crashes natively, so only the map's own events start placement.
  const loaded = useRef(false);

  const place = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const [bounds, obstacles] = await Promise.all([map.getBounds(), queryObstacles(map)]);
      loaded.current = true;
      const posts = buildingPosts(bounds, obstacles.buildings);
      setData(foliageToGeoJSON([...placeFoliage(bounds, obstacles), ...posts, ...(smoke ? chimneySmoke(posts) : [])]));
    } catch {
      // The map can unmount mid-query; the next view change tries again.
    }
  }, [mapRef, smoke]);

  const refresh = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(place, 300), setTimeout(place, 2000)];
  }, [place]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Chimneys start or stop smoking with the time of day.
  useEffect(() => {
    if (loaded.current) refresh();
  }, [refresh]);

  return { data, refresh };
}

/** The animated foliage layer; render it inside `<Map>`. */
export function MapFoliage({ data }: { data: GeoJSON.FeatureCollection }) {
  // Only this component re-renders on each frame, not the whole map screen.
  const frame = useAnimationFrame(FPS) % foliageConfig.frames;

  return (
    <>
      <Images images={SPRITES} />
      <GeoJSONSource id="foliage" data={data}>
        <Layer
          type="symbol"
          id="foliage"
          minzoom={15}
          layout={{
            // Each plant starts on its own frame so they don't sway in sync; posts don't sway.
            'icon-image': [
              'case',
              ['==', ['get', 'kind'], 'post'],
              'post',
              ['concat', ['get', 'kind'], '-', ['to-string', ['%', ['+', frame, ['get', 'phase']], foliageConfig.frames]]],
            ],
            'icon-anchor': ['case', ['==', ['get', 'kind'], 'post'], 'center', 'bottom'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 17, 1.25, 19, 2],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // Plants further south are drawn on top, for a little depth.
            'symbol-z-order': 'viewport-y',
          }}
        />
      </GeoJSONSource>
    </>
  );
}
