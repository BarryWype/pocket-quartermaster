import { gathererRules } from '@/content/jobs';
import { spawnConfig } from '@/content/spawnConfig';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { generateSpawnsAround, generateTileSpawns } from '../generation/spawns';
import { tilesWithin } from '../generation/tiles';
import { windowIndex } from '../generation/time';
import type { LatLng, Spawn } from '../generation/types';
import { canGather } from '../gathering/gathering';
import { readSpawn } from '../gathering/lockedNodes';
import { isRevealed } from '../reveal/reveal';
import { createInitialSave, type SaveData } from '../save';
import { currentHp } from '../team/health';
import { addAnchor, gathererCapNodes, gathererFinds, gathererFirstWoundAt } from './gatherer';
import { assignJob, collectJob, fullAt, jobCap, jobOutputNow, settleJobs } from './jobs';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 2, 6);
const HOME: LatLng = { latitude: 48.85, longitude: 2.35 };
/** Past the tutorial, where wood, ore, herbs and animals all show on the map. */
const base = (): SaveData => ({ ...createInitialSave('seed'), tutorial: { ...createInitialSave('seed').tutorial, step: 'done' } });
const hero = (save: SaveData): (typeof save.heroes)[number] => save.heroes.find((h) => h.id === 'bram')!;
/** Bram working the gatherer around HOME from T0 on. */
const working = (): SaveData => assignJob(addAnchor(base(), HOME, T0 - 1), 'bram', 'gatherer', T0);

/** The nodes the player would see from `position` at `at`: revealed, uncollected and openable. */
const inSightFrom = (save: SaveData, position: LatLng, at: number): Spawn[] =>
  generateSpawnsAround(position, at).filter((spawn) => {
    if (!isRevealed(save, spawn.kind === 'animal' ? 'animals' : 'resources')) return false;
    if (spawn.id in save.collected) return false;
    if (!canGather(save, spawn)) return false;
    return distanceMeters(position, spawnPositionAt(spawn, at)) <= spawnConfig.kinds[spawn.kind].visibilityMeters;
  });

/** Every spawn of `kind` the gatherer could ever see from HOME between `from` and `to`. */
const spawnsAroundHome = (kind: 'herb' | 'animal', from: number, to: number): Spawn[] => {
  const { precision, windowMinutes, visibilityMeters } = spawnConfig.kinds[kind];
  const out: Spawn[] = [];
  for (let w = windowIndex(from, windowMinutes); w <= windowIndex(to, windowMinutes); w++) {
    for (const tile of tilesWithin(HOME, visibilityMeters, precision)) {
      out.push(...generateTileSpawns(kind, tile, w));
    }
  }
  return out;
};

describe('the outdoor gatherer', () => {
  it('adds an anchor only once the player is far enough and late enough', () => {
    // The first point always lands, even with nobody at work.
    expect(addAnchor(base(), HOME, T0).gatherer.anchors).toEqual([{ position: HOME, at: T0 }]);
    const worked = working();
    // Too soon after the last point, even far away: nothing changes.
    const soon = addAnchor(worked, offsetPosition(HOME, 0, 1000), T0 - 1 + (gathererRules.anchorEveryMinutes - 1) * MINUTE);
    expect(soon).toBe(worked);
    // Late enough, but not far enough: nothing changes either.
    const close = addAnchor(worked, offsetPosition(HOME, 0, gathererRules.anchorMoveMeters), T0 + HOUR);
    expect(close).toBe(worked);
    // Far and late: the point is appended.
    const at = T0 + gathererRules.anchorEveryMinutes * MINUTE;
    const position = offsetPosition(HOME, 0, gathererRules.anchorMoveMeters + 1);
    const moved = addAnchor(worked, position, at);
    expect(moved.gatherer.anchors).toEqual([{ position: HOME, at: T0 - 1 }, { position, at }]);
  });

  it('takes the closest visible node first, paying the walk and the gather time', () => {
    const save = working();
    const { nodes } = gathererFinds(save, 'gatherer', T0, T0 + HOUR);
    expect(nodes.length).toBeGreaterThan(0);
    // Recompute the first look's candidates on its own: closest one wins.
    const candidates = inSightFrom(save, HOME, T0);
    expect(candidates.length).toBeGreaterThan(1);
    const closest = candidates.reduce((a, b) =>
      distanceMeters(HOME, spawnPositionAt(a, T0)) <= distanceMeters(HOME, spawnPositionAt(b, T0)) ? a : b,
    );
    expect(nodes[0].spawn.id).toBe(closest.id);
    // The first node has no pace limit: it finishes after the walk plus the gather time.
    const walkMinutes = distanceMeters(HOME, spawnPositionAt(closest, T0)) / gathererRules.heroWalkMetersPerMinute;
    expect(nodes[0].at).toBeCloseTo(T0 + (walkMinutes + gathererRules.gatherMinutes) * MINUTE, -2);
  });

  it('paces nodes apart, caps the output, and resumes after a collect', () => {
    expect(gathererCapNodes()).toBe(Math.floor((gathererRules.capHours * 60) / gathererRules.minMinutesPerNode));
    expect(jobCap('gatherer')).toBe(gathererCapNodes());
    const save = working();
    const { nodes } = gathererFinds(save, 'gatherer', T0, T0 + 48 * HOUR);
    expect(nodes.length).toBeGreaterThan(1);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].at - nodes[i - 1].at).toBeGreaterThanOrEqual(gathererRules.minMinutesPerNode * MINUTE - 1);
    }
    let settled = save;
    for (const hours of [6, 12, 24, 48]) {
      settled = settleJobs(settled, T0 + hours * HOUR);
      expect(settled.jobOutput.gatherer!.nodes ?? 0).toBeLessThanOrEqual(gathererCapNodes());
      expect(jobOutputNow(settled, 'gatherer', T0 + hours * HOUR)).toBeLessThanOrEqual(gathererCapNodes());
    }
    const collected = collectJob(settled, 'gatherer', T0 + 48 * HOUR);
    expect(collected.jobOutput.gatherer!.nodes).toBe(0);
    expect(collected.jobOutput.gatherer!.wounds).toEqual([]);
    const resumed = settleJobs(collected, T0 + 54 * HOUR);
    expect(resumed.jobOutput.gatherer!.nodes ?? 0).toBeGreaterThan(0);
  });

  it('focuses its kind first, and falls back to any other when none is in sight', () => {
    // Focus ore, with a pickaxe that opens stone: with ore in sight, the early nodes are all ore.
    const picked = { ...base(), tools: [...base().tools, 'woodPickaxe'] };
    const worked = assignJob(addAnchor(picked, HOME, T0 - 1), 'bram', 'gatherer', T0);
    const ore = { ...worked, gatherer: { ...worked.gatherer, focus: 'ore' as const } };
    expect(inSightFrom(ore, HOME, T0).some((spawn) => spawn.kind === 'ore')).toBe(true);
    const focused = gathererFinds(ore, 'gatherer', T0, T0 + 2 * HOUR).nodes;
    expect(focused.length).toBeGreaterThan(0);
    expect(focused[0].spawn.kind).toBe('ore');
    for (const node of focused) expect(node.spawn.kind).toBe('ore');
    // Focus food with every herb and animal the hero could see collected: it still gathers.
    const plain = working();
    const to = T0 + 24 * HOUR;
    const blocked = Object.fromEntries(spawnsAroundHome('herb', T0, to).concat(spawnsAroundHome('animal', T0, to)).map((spawn) => [spawn.id, spawn.expiresAt]));
    expect(Object.keys(blocked).length).toBeGreaterThan(0);
    const foodless = { ...plain, collected: { ...plain.collected, ...blocked }, gatherer: { ...plain.gatherer, focus: 'food' as const } };
    const fallback = gathererFinds(foodless, 'gatherer', T0, to).nodes;
    expect(fallback.length).toBeGreaterThan(0);
    for (const node of fallback) expect(gathererRules.focus.food).not.toContain(node.spawn.kind);
  });

  it('skips a node the player collected first, and still takes one', () => {
    const save = working();
    const first = gathererFinds(save, 'gatherer', T0, T0 + HOUR).nodes[0];
    const withCollected = { ...save, collected: { ...save.collected, [first.spawn.id]: first.spawn.expiresAt } };
    const again = gathererFinds(withCollected, 'gatherer', T0, T0 + HOUR).nodes;
    expect(again.map((node) => node.spawn.id)).not.toContain(first.spawn.id);
    expect(again.length).toBeGreaterThan(0);
  });

  it('finds nothing before the tutorial shows the map, and no ore a pickaxe could not open', () => {
    const assigned = assignJob(addAnchor(createInitialSave('seed'), HOME, T0 - 1), 'bram', 'gatherer', T0);
    expect(gathererFinds(assigned, 'gatherer', T0, T0 + 24 * HOUR).nodes).toEqual([]);
    const save = working();
    const { nodes } = gathererFinds(save, 'gatherer', T0, T0 + 24 * HOUR);
    // Without a pickaxe, ore shows on the map but stays locked: the hero never takes it.
    expect(generateSpawnsAround(HOME, T0).some((spawn) => spawn.kind === 'ore' && !canGather(save, spawn))).toBe(true);
    expect(nodes.filter((node) => node.spawn.kind === 'ore')).toEqual([]);
    // With a wooden pickaxe, every ore taken is one it opens.
    const picked = assignJob(addAnchor({ ...base(), tools: ['woodPickaxe'] }, HOME, T0 - 1), 'bram', 'gatherer', T0);
    const ore = gathererFinds({ ...picked, gatherer: { ...picked.gatherer, focus: 'ore' } }, 'gatherer', T0, T0 + 24 * HOUR).nodes.filter(
      (node) => node.spawn.kind === 'ore',
    );
    expect(ore.length).toBeGreaterThan(0);
    for (const node of ore) {
      expect(canGather(picked, node.spawn)).toBe(true);
      expect(readSpawn(picked, node.spawn).state).not.toBe('locked');
    }
  });

  it('splits the replay at a moved anchor', () => {
    const moved = offsetPosition(HOME, 0, 2000);
    const save = addAnchor(working(), moved, T0 + 2 * HOUR);
    const { nodes } = gathererFinds(save, 'gatherer', T0, T0 + 12 * HOUR);
    expect(nodes.length).toBeGreaterThan(0);
    // A node already under way when the anchor moved may finish after it: allow 30 minutes.
    const grace = 30 * MINUTE;
    for (const node of nodes) {
      const range = spawnConfig.kinds[node.spawn.kind].visibilityMeters;
      if (node.at <= T0 + 2 * HOUR) expect(distanceMeters(HOME, node.position)).toBeLessThanOrEqual(range);
      else if (node.at >= T0 + 2 * HOUR + grace) expect(distanceMeters(moved, node.position)).toBeLessThanOrEqual(range);
    }
    expect(nodes.some((node) => node.at <= T0 + 2 * HOUR)).toBe(true);
    expect(nodes.some((node) => node.at >= T0 + 2 * HOUR + grace)).toBe(true);
  });

  it('gathers nothing while a worker assigned at 0 energy rests, then resumes', () => {
    const rested = { ...base(), heroes: base().heroes.map((h) => (h.id === 'bram' ? { ...h, energy: { value: 0, at: T0 } } : h)) };
    const save = assignJob(addAnchor(rested, HOME, T0 - 1), 'bram', 'gatherer', T0);
    expect(hero(save).job!.tired).toBe(true);
    expect(gathererFinds(save, 'gatherer', T0, T0 + 6 * HOUR).nodes).toEqual([]);
    expect(gathererFinds(save, 'gatherer', T0, T0 + 12 * HOUR).nodes.length).toBeGreaterThan(0);
  });

  it('wounds the worker at about the wound chance, and never below 1 HP', () => {
    const rested = { ...base(), heroes: base().heroes.map((h) => (h.id === 'bram' ? { ...h, energy: { value: 0, at: T0 } } : h)) };
    const start = assignJob(addAnchor(rested, HOME, T0 - 1), 'bram', 'gatherer', T0);
    /** Two weeks of settling and collecting: the count of nodes taken and wounds taken. */
    const loop = (): { wounds: number; nodes: number } => {
      let next = start;
      let taken = 0;
      let hurt = 0;
      for (let hours = 6; hours <= 6 * 24 * 14; hours += 6) {
        next = settleJobs(next, T0 + hours * HOUR);
        const entry = next.jobOutput.gatherer!;
        taken += entry.nodes ?? 0;
        hurt += entry.wounds?.length ?? 0;
        expect(currentHp(next, hero(next), T0 + hours * HOUR)).toBeGreaterThanOrEqual(1 - 1e-9);
        next = collectJob(next, 'gatherer', T0 + hours * HOUR);
      }
      return { wounds: hurt, nodes: taken };
    };
    const once = loop();
    expect(once.nodes).toBeGreaterThanOrEqual(300);
    const rate = once.wounds / once.nodes;
    expect(rate).toBeGreaterThan(0.005);
    expect(rate).toBeLessThan(0.07);
    expect(loop()).toEqual(once);
  });

  it('settles a busy three-day absence quickly', () => {
    let save = working();
    // One anchor every anchorEveryMinutes for 72 h, each about 1.2 km from the previous.
    for (let i = 1; i <= (72 * 60) / gathererRules.anchorEveryMinutes; i++) {
      save = addAnchor(save, offsetPosition(HOME, 0, i * 1200), T0 + i * gathererRules.anchorEveryMinutes * MINUTE);
    }
    expect(save.gatherer.anchors.length).toBe(1 + (72 * 60) / gathererRules.anchorEveryMinutes);
    const at = T0 + 72 * HOUR;
    settleJobs(save, at); // warm-up
    const started = Date.now();
    settleJobs(save, at);
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('gives the same results for the same save and times', () => {
    const save = working();
    const scan = () => ({
      finds: gathererFinds(save, 'gatherer', T0, T0 + 24 * HOUR),
      settled: settleJobs(save, T0 + 12 * HOUR),
    });
    expect(scan()).toEqual(scan());
  });

  it('settles hour by hour to the same output as one long settle', () => {
    const save = working();
    let hourly = save;
    for (let hours = 1; hours <= 24; hours++) hourly = settleJobs(hourly, T0 + hours * HOUR);
    const once = settleJobs(save, T0 + 24 * HOUR);
    expect(hourly.jobOutput.gatherer!.nodes).toBe(once.jobOutput.gatherer!.nodes);
    expect(hourly.jobOutput.gatherer!.amounts).toEqual(once.jobOutput.gatherer!.amounts);
  });

  it('says when the worker next takes a wound, only while one works', () => {
    expect(gathererFirstWoundAt(base(), 'gatherer', T0)).toBeNull();
    // Settle and collect every 6 hours until a wound lies ahead (the scan stops at the output's cap).
    let save = working();
    let now = T0;
    let at: number | null = null;
    for (let i = 0; i < 200 && at === null; i++) {
      now += 6 * HOUR;
      save = settleJobs(collectJob(settleJobs(save, now), 'gatherer', now), now);
      at = gathererFirstWoundAt(save, 'gatherer', now);
    }
    expect(at).not.toBeNull();
    // The same scan, settled the same way, takes its first wound at the same moment.
    const settled = settleJobs(save, now);
    const wounds = gathererFinds(settled, 'gatherer', now, now + 3 * 24 * HOUR).nodes.filter((node) => node.wound > 0);
    expect(wounds.length).toBeGreaterThan(0);
    expect(wounds[0].at).toBe(at);
  });

  it('says when the output fills, counting the nodes found since the last settle', () => {
    const save = working();
    const at = fullAt(save, 'gatherer', T0);
    expect(at).not.toBeNull();
    expect(jobOutputNow(save, 'gatherer', at!)).toBe(gathererCapNodes());
    expect(jobOutputNow(save, 'gatherer', at! - 1)).toBeLessThan(gathererCapNodes());
    expect(fullAt(settleJobs(save, T0), 'gatherer', T0)).toBe(at);
  });
});
