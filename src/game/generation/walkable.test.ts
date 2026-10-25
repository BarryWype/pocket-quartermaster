/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { walkableRules } from '@/content/walkable';

import { distanceMeters } from './geo';
import { createRng } from './rng';
import type { AnimalSpawn, LatLng, StaticSpawn } from './types';
import {
  classifyFeature,
  decodeWalkableTile,
  mapTileAt,
  mapTileKey,
  mapTileKeysFor,
  placementCandidates,
  placeSpawns,
  snapToWalkable,
  type WalkableTile,
} from './walkable';

// Wellington waterfront, OpenFreeMap 2026-10-18: footways, steps, a pedestrian
// square, piers, parks, a playground, private gardens, water and a secondary road.
const FIXTURE = { z: 14, x: 16147, y: 10258 };
const fixture = decodeWalkableTile(
  readFileSync(join(__dirname, 'fixtures', 'wellington-14-16147-10258.pbf')),
  FIXTURE,
);
const KEY = mapTileKey(FIXTURE);

/** Inverse of `mapTileAt`, for a fractional position inside a tile. */
function pointInTile(fx: number, fy: number): LatLng {
  const n = 2 ** FIXTURE.z;
  const longitude = ((FIXTURE.x + fx) / n) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (FIXTURE.y + fy)) / n))) * 180) / Math.PI;
  return { latitude, longitude };
}

/** Distance from a point to the nearest walkable way in the fixture. */
function distanceToWays(point: LatLng) {
  const snapped = snapToWalkable({ ...fixture, areas: [] }, point, 1000);
  return snapped ? distanceMeters(point, snapped) : Infinity;
}

const samples = (() => {
  const rng = createRng('walkable-samples');
  return Array.from({ length: 400 }, () => pointInTile(0.05 + rng.next() * 0.9, 0.05 + rng.next() * 0.9));
})();

describe('classifyFeature', () => {
  const line = 2;
  const polygon = 3;

  it('keeps footpaths, tracks, streets up to secondary roads, and piers', () => {
    expect(classifyFeature('transportation', { class: 'path', subclass: 'footway' }, line)).toBe('way');
    expect(classifyFeature('transportation', { class: 'track' }, line)).toBe('way');
    expect(classifyFeature('transportation', { class: 'minor' }, line)).toBe('way');
    expect(classifyFeature('transportation', { class: 'secondary' }, line)).toBe('way');
    expect(classifyFeature('transportation', { class: 'pier' }, line)).toBe('way');
  });

  it('rejects busy roads and railways', () => {
    for (const roadClass of ['motorway', 'trunk', 'primary', 'rail', 'ferry']) {
      expect(classifyFeature('transportation', { class: roadClass }, line)).toBeNull();
    }
  });

  it('rejects private, indoor and underground ways', () => {
    expect(classifyFeature('transportation', { class: 'service', service: 'driveway' }, line)).toBeNull();
    expect(classifyFeature('transportation', { class: 'path', access: 'no' }, line)).toBeNull();
    expect(classifyFeature('transportation', { class: 'path', foot: 'private' }, line)).toBeNull();
    expect(classifyFeature('transportation', { class: 'path', brunnel: 'tunnel' }, line)).toBeNull();
    expect(classifyFeature('transportation', { class: 'path', subclass: 'corridor', indoor: 1 }, line)).toBeNull();
    expect(classifyFeature('transportation', { class: 'path', level: 2 }, line)).toBeNull();
  });

  it('keeps parks and public squares but not private gardens', () => {
    expect(classifyFeature('landcover', { class: 'grass', subclass: 'park' }, polygon)).toBe('area');
    expect(classifyFeature('landuse', { class: 'playground' }, polygon)).toBe('area');
    expect(classifyFeature('transportation', { class: 'path', subclass: 'pedestrian' }, polygon)).toBe('area');
    expect(classifyFeature('landcover', { class: 'grass', subclass: 'garden' }, polygon)).toBeNull();
    expect(classifyFeature('landuse', { class: 'residential' }, polygon)).toBeNull();
  });
});

describe('decodeWalkableTile', () => {
  it('keeps the walkable ways, public areas and water of a real tile', () => {
    expect(fixture.ways.length).toBeGreaterThan(20);
    expect(fixture.areas.length).toBeGreaterThan(3);
    expect(fixture.water.length).toBeGreaterThan(0);
  });

  it('puts the geometry where the tile is', () => {
    const point = fixture.ways[0].points[0];
    const { x, y } = mapTileAt(point, FIXTURE.z);
    expect(Math.abs(x - FIXTURE.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y - FIXTURE.y)).toBeLessThanOrEqual(1);
  });
});

describe('snapToWalkable', () => {
  const max = walkableRules.maxSnapMeters;
  const placed = samples.map((point) => ({ point, snapped: snapToWalkable(fixture, point, max) }));

  it('places nearly every point on land and drops points out in the harbour', () => {
    const onlyWater: WalkableTile = { ways: [], areas: fixture.water, water: [] };
    const onLand = placed.filter(({ point }) => snapToWalkable(onlyWater, point, 0) === null);
    expect(onLand.filter((p) => p.snapped).length).toBeGreaterThan(onLand.length * 0.9);
    expect(placed.filter((p) => !p.snapped).length).toBeGreaterThan(samples.length * 0.5);
  });

  it('only ever moves a point onto a way or keeps it inside a public area', () => {
    for (const { point, snapped } of placed) {
      if (!snapped) continue;
      expect(distanceMeters(point, snapped)).toBeLessThanOrEqual(max + 0.01);
      const onWay = distanceToWays(snapped) < 0.5;
      const keptInArea = snapped === point;
      expect(onWay || keptInArea).toBe(true);
    }
  });

  it('never keeps a point in the water', () => {
    const inWater = (point: LatLng) => {
      const onlyWater: WalkableTile = { ways: [], areas: fixture.water, water: [] };
      return snapToWalkable(onlyWater, point, 0) !== null;
    };
    const wet = placed.filter(({ point }) => inWater(point));
    expect(wet.length).toBeGreaterThan(0);
    wet.forEach(({ point, snapped }) => expect(snapped).not.toBe(point));
  });

  it('is deterministic', () => {
    samples.slice(0, 50).forEach((point) => {
      expect(snapToWalkable(fixture, point, max)).toEqual(snapToWalkable(fixture, point, max));
    });
  });
});

describe('placeSpawns', () => {
  const base = { tile: 'g', quantity: 1, boosted: false, expiresAt: 1 };
  const ore = (id: string, position: LatLng): StaticSpawn => ({ ...base, id, kind: 'ore', resourceId: 'stone', position });
  const deer: AnimalSpawn = {
    ...base,
    id: 'deer',
    kind: 'animal',
    resourceId: 'deer',
    path: { waypoints: samples.slice(0, 4), loopMs: 60_000, phaseMs: 0 },
  };
  const empty: WalkableTile = { ways: [], areas: [], water: [] };

  it('waits for tiles that are not loaded yet', () => {
    expect(placeSpawns([ore('a', samples[0])], {})).toEqual([]);
  });

  it('keeps generated positions when a tile failed to load', () => {
    expect(placeSpawns([ore('a', samples[0])], { [KEY]: null })).toEqual([ore('a', samples[0])]);
  });

  it('drops spawns with nowhere walkable nearby', () => {
    expect(placeSpawns([ore('a', samples[0]), deer], { [KEY]: empty })).toEqual([]);
  });

  it('snaps positions and animal waypoints', () => {
    const placed = placeSpawns([deer, ...samples.slice(0, 20).map((p, i) => ore(`o${i}`, p))], { [KEY]: fixture });
    expect(placed.length).toBeGreaterThan(0);
    for (const spawn of placed) {
      const points = spawn.kind === 'animal' ? spawn.path.waypoints : [spawn.position];
      points.forEach((point) => expect(snapToWalkable(fixture, point, 0.5)).not.toBeNull());
    }
  });

  it('lists the map tiles a set of spawns needs', () => {
    expect(mapTileKeysFor([ore('a', samples[0]), deer])).toEqual([KEY]);
  });

  it('only places spawns that could become visible', () => {
    const player = samples[0];
    const far = { latitude: player.latitude + 0.05, longitude: player.longitude };
    const ids = placementCandidates([ore('near', player), ore('far', far)], player).map((s) => s.id);
    expect(ids).toEqual(['near']);
  });
});
