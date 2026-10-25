import type { StyleSpecification } from '@maplibre/maplibre-react-native';

// Flat, limited palette over OpenFreeMap's OpenMapTiles vector data.
// `fill-antialias: false` keeps area edges jagged for a pixel-art feel.
const palette = {
  grass: '#7bb35a',
  forest: '#4f8a3c',
  sand: '#e2cf8f',
  farmland: '#a9c46c',
  residential: '#9fbf6a',
  water: '#4a86c8',
  waterEdge: '#2f5f99',
  building: '#b0704a',
  buildingEdge: '#5e3622',
  road: '#e9d9a6',
  roadEdge: '#8a6d3b',
  path: '#c2a46a',
};

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
    { id: 'background', type: 'background', paint: { 'background-color': palette.grass } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: {
        'fill-antialias': false,
        'fill-color': [
          'match',
          ['get', 'class'],
          'wood',
          palette.forest,
          'sand',
          palette.sand,
          'farmland',
          palette.farmland,
          palette.grass,
        ],
      },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'residential'],
      paint: { 'fill-antialias': false, 'fill-color': palette.residential },
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
      filter: ['!', ['match', ['get', 'class'], ['path', 'track', 'rail', 'transit'], true, false]],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-color': palette.roadEdge,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 18],
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['!', ['match', ['get', 'class'], ['path', 'track', 'rail', 'transit'], true, false]],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-color': palette.road,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 14],
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
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: {
        'fill-antialias': false,
        'fill-color': palette.building,
      },
    },
    {
      id: 'building-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'building',
      paint: { 'line-color': palette.buildingEdge, 'line-width': 2 },
    },
  ],
};
