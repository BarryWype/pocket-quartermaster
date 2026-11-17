import { supplyRules } from '@/content/supplyLines';
import { walkableRules } from '@/content/walkable';

import { distanceMeters } from '../generation/geo';
import { mapTileAt, mapTileKey, type WalkableTile } from '../generation/walkable';
import type { LatLng } from '../generation/types';
import type { StreetPath } from './types';

const METERS_PER_DEGREE = 111_320;

/** The street network: its points, the edges between them, and each point's edges in a flat adjacency list. */
export type StreetGraph = {
  nodes: LatLng[];
  /** The way each node first came from, so a way's ends join only to other ways. */
  nodeWay: number[];
  edgeA: number[];
  edgeB: number[];
  edgeLength: number[];
  /** Node u's edges are adjEdge[adjStart[u] .. adjStart[u + 1]]. */
  adjStart: number[];
  adjEdge: number[];
};

/** The map tile keys covering a circle of `reachMeters` plus the extra reach around the hall. */
export function streetTileKeys(hall: LatLng, reachMeters: number): string[] {
  const reach = reachMeters + supplyRules.streets.extraReachMeters;
  const dLat = reach / METERS_PER_DEGREE;
  const dLon = reach / (METERS_PER_DEGREE * Math.cos((hall.latitude * Math.PI) / 180));
  const zoom = walkableRules.mapZoom;
  const corners = [
    { latitude: hall.latitude - dLat, longitude: hall.longitude - dLon },
    { latitude: hall.latitude + dLat, longitude: hall.longitude - dLon },
    { latitude: hall.latitude - dLat, longitude: hall.longitude + dLon },
    { latitude: hall.latitude + dLat, longitude: hall.longitude + dLon },
  ].map((corner) => mapTileAt(corner, zoom));
  const keys: string[] = [];
  for (let x = Math.min(...corners.map((tile) => tile.x)); x <= Math.max(...corners.map((tile) => tile.x)); x++) {
    for (let y = Math.min(...corners.map((tile) => tile.y)); y <= Math.max(...corners.map((tile) => tile.y)); y++) {
      keys.push(mapTileKey({ z: zoom, x, y }));
    }
  }
  return keys;
}

/** The node key that merges points equal to within 1e-6 degrees. */
const nodeKey = (point: LatLng) => `${Math.round(point.latitude * 1e6)}:${Math.round(point.longitude * 1e6)}`;

/**
 * The street network of the given tiles: every walkable way's points as nodes
 * (merged when equal), edges between consecutive points, and each way's two
 * ends joined to the nearest node of another way within the join distance,
 * across tile edges too.
 */
export function buildStreetGraph(tiles: WalkableTile[]): StreetGraph {
  const nodes: LatLng[] = [];
  const nodeWay: number[] = [];
  const nodeIndex = new Map<string, number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeLength: number[] = [];
  const wayEnds: { node: number; way: number }[] = [];

  const nodeOf = (point: LatLng, way: number): number => {
    const key = nodeKey(point);
    const found = nodeIndex.get(key);
    if (found !== undefined) return found;
    const index = nodes.length;
    nodes.push(point);
    nodeWay.push(way);
    nodeIndex.set(key, index);
    return index;
  };

  let way = 0;
  for (const tile of tiles) {
    for (const { points } of tile.ways) {
      let previous = -1;
      for (const point of points) {
        const current = nodeOf(point, way);
        if (previous >= 0 && current !== previous) {
          edgeA.push(previous);
          edgeB.push(current);
          edgeLength.push(distanceMeters(nodes[previous], nodes[current]));
        }
        previous = current;
      }
      if (points.length > 1) {
        wayEnds.push({ node: nodeOf(points[0], way), way }, { node: nodeOf(points[points.length - 1], way), way });
      }
      way++;
    }
  }

  // A grid index with one cell per join distance finds each way end's nearest foreign node fast.
  const joinMeters = supplyRules.streets.joinMeters;
  if (nodes.length > 0 && wayEnds.length > 0) {
    const cellLat = joinMeters / METERS_PER_DEGREE;
    const cellLon = joinMeters / (METERS_PER_DEGREE * Math.cos((nodes[0].latitude * Math.PI) / 180));
    const cellOf = (node: number) => `${Math.floor(nodes[node].latitude / cellLat)}:${Math.floor(nodes[node].longitude / cellLon)}`;
    const grid = new Map<string, number[]>();
    nodes.forEach((_, node) => {
      const key = cellOf(node);
      grid.set(key, [...(grid.get(key) ?? []), node]);
    });
    for (const end of wayEnds) {
      let best = -1;
      let bestDistance = joinMeters;
      const [gx, gy] = cellOf(end.node).split(':').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const candidate of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
            if (candidate === end.node || nodeWay[candidate] === end.way) continue;
            const distance = distanceMeters(nodes[end.node], nodes[candidate]);
            if (distance <= bestDistance) {
              best = candidate;
              bestDistance = distance;
            }
          }
        }
      }
      if (best >= 0) {
        edgeA.push(end.node);
        edgeB.push(best);
        edgeLength.push(bestDistance);
      }
    }
  }

  const adjStart = new Array<number>(nodes.length + 1).fill(0);
  for (let e = 0; e < edgeA.length; e++) {
    adjStart[edgeA[e] + 1] += 1;
    adjStart[edgeB[e] + 1] += 1;
  }
  for (let node = 0; node < nodes.length; node++) adjStart[node + 1] += adjStart[node];
  const adjEdge = new Array<number>(edgeA.length * 2);
  const cursor = adjStart.slice(0, nodes.length);
  for (let e = 0; e < edgeA.length; e++) {
    adjEdge[cursor[edgeA[e]]++] = e;
    adjEdge[cursor[edgeB[e]]++] = e;
  }
  return { nodes, nodeWay, edgeA, edgeB, edgeLength, adjStart, adjEdge };
}

/** The nearest point on any edge within the snap distance: its edge, its place on it, and where it is. */
function snapEdge(graph: StreetGraph, point: LatLng): { edge: number; t: number; at: LatLng } | null {
  const scaleX = METERS_PER_DEGREE * Math.cos((point.latitude * Math.PI) / 180);
  let best: { edge: number; t: number } | null = null;
  let bestDistance = supplyRules.streets.snapMeters;
  for (let e = 0; e < graph.edgeA.length; e++) {
    const a = graph.nodes[graph.edgeA[e]];
    const b = graph.nodes[graph.edgeB[e]];
    const ax = (a.longitude - point.longitude) * scaleX;
    const ay = (a.latitude - point.latitude) * METERS_PER_DEGREE;
    const dx = (b.longitude - point.longitude) * scaleX - ax;
    const dy = (b.latitude - point.latitude) * METERS_PER_DEGREE - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (distance <= bestDistance) {
      best = { edge: e, t };
      bestDistance = distance;
    }
  }
  if (!best) return null;
  const a = graph.nodes[graph.edgeA[best.edge]];
  const b = graph.nodes[graph.edgeB[best.edge]];
  return {
    edge: best.edge,
    t: best.t,
    at: { latitude: a.latitude + (b.latitude - a.latitude) * best.t, longitude: a.longitude + (b.longitude - a.longitude) * best.t },
  };
}

/** The nearest street point within the snap distance, or null when no street is near. */
export function snapToStreet(graph: StreetGraph, point: LatLng): LatLng | null {
  return snapEdge(graph, point)?.at ?? null;
}

/** A binary min-heap of node ids keyed by distance, for Dijkstra. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { id: number; key: number } {
    const top = { id: this.ids[0], key: this.keys[0] };
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.ids.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.ids.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  get empty() {
    return this.ids.length === 0;
  }

  private swap(i: number, j: number) {
    [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
  }
}

/**
 * The shortest street route between two points: both ends snap to the network
 * (the leg from the real point to its snapped point is straight), and Dijkstra
 * runs between the snapped positions with temporary nodes on their edges. A
 * missing snap or an unreachable end falls back to one straight leg.
 */
export function streetPath(graph: StreetGraph, from: LatLng, to: LatLng): { points: LatLng[]; straight: boolean } {
  const start = snapEdge(graph, from);
  const end = snapEdge(graph, to);
  if (!start || !end) return { points: [from, to], straight: true };

  const count = graph.nodes.length;
  const START = count;
  const END = count + 1;
  const startEdge = start.edge;
  const endEdge = end.edge;
  const startLength = graph.edgeLength[startEdge];
  const endLength = graph.edgeLength[endEdge];

  // Both snapped points split their edge, so the search runs from point to point.
  const dist = new Float64Array(count + 2).fill(Infinity);
  const parent = new Int32Array(count + 2).fill(-1);
  const heap = new MinHeap();
  const relax = (node: number, distance: number, fromNode: number) => {
    if (distance < dist[node]) {
      dist[node] = distance;
      parent[node] = fromNode;
      heap.push(node, distance);
    }
  };
  dist[START] = 0;
  relax(graph.edgeA[startEdge], start.t * startLength, START);
  relax(graph.edgeB[startEdge], (1 - start.t) * startLength, START);

  while (!heap.empty) {
    const { id: u, key } = heap.pop();
    if (key > dist[u]) continue;
    if (u === END) break;
    const visit = (v: number, length: number) => relax(v, key + length, u);
    if (u < count) {
      for (let i = graph.adjStart[u]; i < graph.adjStart[u + 1]; i++) {
        const e = graph.adjEdge[i];
        visit(graph.edgeA[e] === u ? graph.edgeB[e] : graph.edgeA[e], graph.edgeLength[e]);
      }
    }
    if (u === graph.edgeA[startEdge]) visit(START, start.t * startLength);
    if (u === graph.edgeB[startEdge]) visit(START, (1 - start.t) * startLength);
    if (u === graph.edgeA[endEdge]) visit(END, end.t * endLength);
    if (u === graph.edgeB[endEdge]) visit(END, (1 - end.t) * endLength);
  }

  // Both ends on one street: the stretch of it between them beats any detour through its ends.
  let total = dist[END];
  let chain: number[] | null = null;
  if (startEdge === endEdge) {
    const along = Math.abs(end.t - start.t) * startLength;
    if (along < total) {
      total = along;
      chain = [START, END];
    }
  }
  if (!isFinite(total)) return { points: [from, to], straight: true };
  if (!chain) {
    chain = [];
    for (let u = END; u !== -1; u = parent[u]) chain.push(u);
    chain.reverse();
  }
  const positionOf = (id: number): LatLng => (id === START ? start.at : id === END ? end.at : graph.nodes[id]);
  return { points: [from, ...chain.map(positionOf), to], straight: false };
}

/** Douglas–Peucker in metres; the two ends are always kept. */
export function simplify(points: LatLng[], meters: number): LatLng[] {
  if (points.length < 3) return points;
  const scaleX = METERS_PER_DEGREE * Math.cos((points[0].latitude * Math.PI) / 180);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = points[first];
    const b = points[last];
    const dx = (b.longitude - a.longitude) * scaleX;
    const dy = (b.latitude - a.latitude) * METERS_PER_DEGREE;
    const lengthSquared = dx * dx + dy * dy;
    let far = -1;
    let farDistance = 0;
    for (let i = first + 1; i < last; i++) {
      const px = (points[i].longitude - a.longitude) * scaleX;
      const py = (points[i].latitude - a.latitude) * METERS_PER_DEGREE;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
      const distance = Math.hypot(px - t * dx, py - t * dy);
      if (distance > farDistance) {
        far = i;
        farDistance = distance;
      }
    }
    if (far >= 0 && farDistance > meters) {
      keep[far] = true;
      stack.push([first, far], [far, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const samePoint = (a: LatLng, b: LatLng) => a.latitude === b.latitude && a.longitude === b.longitude;

/**
 * The whole loop's street path: hall → stops in order → hall, each leg found
 * on the network, simplified, and joined without duplicate points. `stopAt[i]`
 * is the index of stop i in `points`, and `straightLegs` lists the legs that
 * fell back to a straight line (leg 0: hall → first stop, the last: last stop
 * → hall).
 */
export function routeStreetPath(graph: StreetGraph, hall: LatLng, stops: LatLng[]): StreetPath {
  const anchors = [hall, ...stops, hall];
  const points: LatLng[] = [];
  const stopAt: number[] = [];
  const straightLegs: number[] = [];
  for (let leg = 1; leg < anchors.length; leg++) {
    const found = streetPath(graph, anchors[leg - 1], anchors[leg]);
    if (found.straight) straightLegs.push(leg - 1);
    const simplified = simplify(found.points, supplyRules.streets.simplifyMeters);
    for (let i = 0; i < simplified.length; i++) {
      if (i === 0 && points.length > 0 && samePoint(points[points.length - 1], simplified[0])) continue;
      points.push(simplified[i]);
    }
    if (leg <= stops.length) stopAt.push(points.length - 1);
  }
  return { points, stopAt, straightLegs };
}

/** The loop's path with no streets: every leg a straight line. */
export function straightStreetPath(hall: LatLng, stops: LatLng[]): StreetPath {
  const anchors = [hall, ...stops, hall];
  const points: LatLng[] = [];
  const stopAt: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    if (points.length === 0 || !samePoint(points[points.length - 1], anchors[i])) points.push(anchors[i]);
    if (i > 0 && i <= stops.length) stopAt.push(points.length - 1);
  }
  return { points, stopAt, straightLegs: stops.length > 0 ? Array.from({ length: stops.length + 1 }, (_, leg) => leg) : [] };
}
