/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { supplyRules } from '@/content/supplyLines';

import { distanceMeters, offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { decodeWalkableTile, type WalkableTile } from '../generation/walkable';
import { buildStreetGraph, routeStreetPath, simplify, snapToStreet, streetPath, streetTileKeys, type StreetGraph } from './streets';

// Wellington waterfront, the same fixture as walkable.test.ts and terrain.test.ts.
const FIXTURE = { z: 14, x: 16147, y: 10258 };
const fixture: WalkableTile = decodeWalkableTile(
  readFileSync(join(__dirname, '../generation/fixtures', 'wellington-14-16147-10258.pbf')),
  FIXTURE,
);

/** Union-find over the given node pairs: the connected components of a set of edges. */
function componentsOf(pairs: [number, number][], count: number): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (const [a, b] of pairs) parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  }
  return [...groups.values()];
}

/** The pieces the decoded ways form before loose ends are joined: ways sharing a point (to 1e-6 degrees) are one piece. */
function rawPieces(tile: WalkableTile): number[][] {
  const key = (p: LatLng) => `${Math.round(p.latitude * 1e6)}:${Math.round(p.longitude * 1e6)}`;
  const nodeIndex = new Map<string, number>();
  const pairs: [number, number][] = [];
  let count = 0;
  for (const way of tile.ways) {
    let previous = -1;
    for (const point of way.points) {
      const k = key(point);
      if (!nodeIndex.has(k)) nodeIndex.set(k, count++);
      const current = nodeIndex.get(k)!;
      if (previous >= 0 && current !== previous) pairs.push([previous, current]);
      previous = current;
    }
  }
  return componentsOf(pairs, count);
}

/** The connected components of the built graph. */
const graphPieces = (graph: StreetGraph) =>
  componentsOf(graph.edgeA.map((a, e) => [a, graph.edgeB[e]] as [number, number]), graph.nodes.length);

describe('buildStreetGraph', () => {
  const graph = buildStreetGraph([fixture]);

  it('joins the ways into one network: fewer pieces than the raw ways, and the largest holds at least 90% of the nodes', () => {
    const before = rawPieces(fixture);
    const after = graphPieces(graph);
    expect(after.length).toBeLessThan(before.length);
    const largest = Math.max(...after.map((piece) => piece.length));
    expect(largest / graph.nodes.length).toBeGreaterThanOrEqual(0.9);
  });

  it('covers the hall\'s reach with its own tile and its neighbours', () => {
    const hall = { latitude: -41.2865, longitude: 174.7762 };
    const keys = streetTileKeys(hall, supplyRules.buildings.limits[2].meters);
    expect(keys).toContain('14/16146/10258');
    expect(keys.length).toBeGreaterThanOrEqual(4);
  });
});

describe('streetPath', () => {
  const graph = buildStreetGraph([fixture]);
  const largest = graphPieces(graph).reduce((best, piece) => (piece.length > best.length ? piece : best));

  it('finds a street route between two well-connected points: longer than the straight line, and starting and ending at them', () => {
    const from = graph.nodes[largest[0]];
    const to = graph.nodes[largest[Math.floor(largest.length / 2)]];
    const found = streetPath(graph, from, to);
    expect(found.straight).toBe(false);
    expect(found.points[0]).toEqual(from);
    expect(found.points[found.points.length - 1]).toEqual(to);
    const length = found.points.slice(1).reduce((sum, point, i) => sum + distanceMeters(found.points[i], point), 0);
    expect(length).toBeGreaterThan(distanceMeters(from, to));
  });

  it('falls back to a straight leg from a point with no street within the snap distance', () => {
    const from = graph.nodes[largest[0]];
    let far: LatLng | null = null;
    for (let bearing = 0; bearing < 360 && !far; bearing += 10) {
      const candidate = offsetPosition(from, 500, bearing);
      if (!snapToStreet(graph, candidate)) far = candidate;
    }
    expect(far).not.toBeNull();
    const found = streetPath(graph, from, far!);
    expect(found).toEqual({ points: [from, far], straight: true });
  });
});

describe('simplify', () => {
  const a = { latitude: -41.2865, longitude: 174.7762 };

  it('keeps the two ends, drops points within the resolution and keeps a real detour', () => {
    const b = offsetPosition(a, 100, 0);
    const near = [offsetPosition(a, 30, 0.2), offsetPosition(a, 70, -0.3)];
    expect(simplify([a, ...near, b], supplyRules.streets.simplifyMeters)).toEqual([a, b]);
    const far = offsetPosition(a, 50, 90);
    expect(simplify([a, far, b], supplyRules.streets.simplifyMeters)).toEqual([a, far, b]);
  });
});

describe('routeStreetPath', () => {
  const graph = buildStreetGraph([fixture]);
  const largest = graphPieces(graph).reduce((best, piece) => (piece.length > best.length ? piece : best));
  const hall = graph.nodes[largest[0]];
  const stops = [graph.nodes[largest[Math.floor(largest.length / 3)]], graph.nodes[largest[Math.floor((2 * largest.length) / 3)]]];

  it('indexes each stop in the points, and starts and ends at the hall', () => {
    const path = routeStreetPath(graph, hall, stops);
    expect(path.points[0]).toEqual(hall);
    expect(path.points[path.points.length - 1]).toEqual(hall);
    expect(path.points[path.stopAt[0]]).toEqual(stops[0]);
    expect(path.points[path.stopAt[1]]).toEqual(stops[1]);
    expect(path.stopAt[0]).toBeLessThan(path.stopAt[1]);
  });
});

describe('performance', () => {
  it('builds the graph and runs ten searches in under 200 ms', () => {
    const began = Date.now();
    const graph = buildStreetGraph([fixture]);
    const largest = graphPieces(graph).reduce((best, piece) => (piece.length > best.length ? piece : best));
    for (let i = 0; i < 10; i++) {
      streetPath(graph, graph.nodes[largest[i % largest.length]], graph.nodes[largest[(largest.length - 1 - i) % largest.length]]);
    }
    expect(Date.now() - began).toBeLessThan(200);
  });
});
