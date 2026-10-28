import type { StyleSpecification } from '@maplibre/maplibre-react-native';

// Flat, limited palette over OpenFreeMap's OpenMapTiles vector data.
// `fill-antialias: false` keeps area edges jagged for a pixel-art feel.
// Pattern names are images registered on the map (scripts/generate-map-textures.py).
const palette = {
  forest: '#4f8a3c',
  sand: '#e2cf8f',
  farmland: '#a9c46c',
  water: '#4a86c8',
  waterEdge: '#2f5f99',
  buildingShadow: '#2e2b27',
  wall: '#3b2614',
  curb: '#6b6352',
  path: '#c2a46a',
};

/** OpenMapTiles road classes drawn as paved roads; the rest are dirt. */
const MAJOR_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];

/** OpenFreeMap's TileJSON: the map renders from it and spawn placement reads it. */
export const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: OPENFREEMAP_TILEJSON,
      attribution:
        '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-pattern': 'grass' } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      // Other classes (grass, meadow…) show the grass texture underneath.
      filter: ['match', ['get', 'class'], ['wood', 'sand', 'farmland'], true, false],
      paint: {
        'fill-antialias': false,
        'fill-color': ['match', ['get', 'class'], 'wood', palette.forest, 'sand', palette.sand, palette.farmland],
      },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'residential'],
      paint: { 'fill-antialias': false, 'fill-pattern': 'trampled' },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-antialias': false, 'fill-color': palette.forest, 'fill-opacity': 0.6 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-antialias': false, 'fill-color': palette.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: { 'line-color': palette.water, 'line-width': 3 },
    },
    {
      id: 'road-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      // The curb of the paved roads; dirt roads draw their own ragged edge.
      filter: ['match', ['get', 'class'], MAJOR_ROADS, true, false],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-color': palette.curb,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 18, 26],
      },
    },
    {
      id: 'road-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], MAJOR_ROADS, true, false],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-pattern': 'cobble',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 22],
      },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['!', ['match', ['get', 'class'], [...MAJOR_ROADS, 'path', 'track', 'rail', 'transit'], true, false]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        // The dirt texture is 14 px tall with transparent ragged edges; a narrower
        // road shows only its middle, so it reaches full width early.
        'line-pattern': 'dirt',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 16, 14],
      },
    },
    {
      id: 'path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': palette.path, 'line-width': 3, 'line-dasharray': [2, 1] },
    },
    {
      id: 'building-shadow',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: {
        'fill-antialias': false,
        'fill-color': palette.buildingShadow,
        'fill-opacity': 0.45,
        'fill-translate': [3, 3],
        'fill-translate-anchor': 'viewport',
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: { 'fill-antialias': false, 'fill-pattern': 'floor' },
    },
    {
      // Shade cast by the walls on the floor. Building rings run clockwise on screen,
      // so a positive offset moves the line inside.
      id: 'building-inner-shadow',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: {
        'line-color': palette.wall,
        'line-opacity': 0.45,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 4, 19, 10],
        'line-offset': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 3.5, 19, 9],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 17, 2, 19, 5],
      },
    },
    {
      id: 'building-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: {
        'line-color': palette.wall,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 17, 3.5, 19, 8],
      },
    },
  ],
};
