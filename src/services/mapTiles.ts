import { OPENFREEMAP_TILEJSON } from '@/content/mapStyle';
import { decodeWalkableTile, parseMapTileKey, type WalkableTile } from '@/game/generation/walkable';

export type WalkableTileService = {
  /** Resolves to the tile's walkable data, or null when it can't be fetched (e.g. offline). */
  load: (key: string) => Promise<WalkableTile | null>;
};

/** Decoded city tiles are a few hundred KB each; keep a bounded set in memory. */
const MAX_CACHED_TILES = 40;

let tileUrlTemplate: Promise<string> | null = null;
const cache = new Map<string, Promise<WalkableTile | null>>();

/** The current tile URL template, e.g. `…/planet/20261018_080001_pt/{z}/{x}/{y}.pbf`. */
function getTileUrlTemplate() {
  tileUrlTemplate ??= fetch(OPENFREEMAP_TILEJSON)
    .then((response) => response.json() as Promise<{ tiles: string[] }>)
    .then((tileJson) => tileJson.tiles[0])
    .catch((error: unknown) => {
      tileUrlTemplate = null;
      throw error;
    });
  return tileUrlTemplate;
}

async function fetchTile(key: string) {
  const tile = parseMapTileKey(key);
  const url = (await getTileUrlTemplate())
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Tile ${key}: HTTP ${response.status}`);
  return decodeWalkableTile(new Uint8Array(await response.arrayBuffer()), tile);
}

export const walkableTiles: WalkableTileService = {
  load: (key) => {
    const cached = cache.get(key);
    if (cached) return cached;
    // A failure is not cached, so the next request retries.
    const loading = fetchTile(key).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, loading);
    if (cache.size > MAX_CACHED_TILES) cache.delete(cache.keys().next().value!);
    return loading;
  },
};
