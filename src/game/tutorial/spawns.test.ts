import { gatheringConfig } from '@/content/gatheringConfig';
import { tutorialRules } from '@/content/tutorial';
import { walkableRules } from '@/content/walkable';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { snapToWalkable, type WalkableTile } from '../generation/walkable';
import { createInitialSave, type SaveData } from '../save';
import { collectFromHere, collectRadiusNow, collectTutorialSpawn, fallbackReady, placeTutorialSpawns, shownTutorialSpawns } from './spawns';

const player = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;

/** An east–west walkable way straight through the player, like a footpath. */
const way = Array.from({ length: 17 }, (_, i) => offsetPosition(player, 0, -80 + i * 10));
const tile: WalkableTile = {
  ways: [
    {
      points: way,
      bbox: {
        minLat: Math.min(...way.map((p) => p.latitude)),
        minLon: Math.min(...way.map((p) => p.longitude)),
        maxLat: Math.max(...way.map((p) => p.latitude)),
        maxLon: Math.max(...way.map((p) => p.longitude)),
      },
    },
  ],
  areas: [],
  water: [],
};

const atStep = (step: SaveData['tutorial']['step']): SaveData => ({
  ...createInitialSave(),
  tutorial: { ...createInitialSave().tutorial, step },
});

describe('tutorial spawns', () => {
  it('places one node per material, 8–15 m away, 6 m apart, on walkable spots', () => {
    const save = placeTutorialSpawns(createInitialSave(), player, tile, now);
    const spawns = save.tutorial.spawns;
    expect(spawns).toHaveLength(4);
    expect(shownTutorialSpawns(save).map((s) => s.materialId)).toEqual(['wood', 'wood', 'wood', 'wood']);
    for (const spawn of spawns) {
      const distance = distanceMeters(player, spawn.position!);
      expect(distance).toBeGreaterThanOrEqual(8);
      expect(distance).toBeLessThanOrEqual(15);
      expect(snapToWalkable(tile, spawn.position!, walkableRules.maxSnapMeters)).not.toBeNull();
    }
    for (const [a, b] of spawns.flatMap((a, i) => spawns.slice(i + 1).map((b) => [a, b] as const))) {
      expect(distanceMeters(a.position!, b.position!)).toBeGreaterThanOrEqual(6);
    }
  });

  it('waits for the map tile, but places them without one', () => {
    const fresh = createInitialSave();
    expect(placeTutorialSpawns(fresh, player, undefined, now)).toBe(fresh);
    expect(placeTutorialSpawns(fresh, player, null, now).tutorial.spawns).toHaveLength(4);
  });

  it('gives the nodes no position while location is off', () => {
    const save = placeTutorialSpawns(createInitialSave(), null, null, now);
    expect(save.tutorial.spawns).toHaveLength(4);
    expect(save.tutorial.spawns.every((s) => s.position === null)).toBe(true);
    expect(shownTutorialSpawns(save)).toHaveLength(4);
  });

  it('spawns nothing outside the gathering steps, and never twice', () => {
    const steps = ['forgeSword', 'seeThreat', 'craftKit', 'equipKit', 'sendExpedition', 'awaitReport', 'readReport', 'done'] as const;
    for (const step of steps) {
      const save = atStep(step);
      expect(placeTutorialSpawns(save, player, null, now)).toBe(save);
    }
    const save = placeTutorialSpawns(createInitialSave(), player, null, now);
    expect(placeTutorialSpawns(save, player, null, now + 1)).toBe(save);
    // The second phase: three kit nodes.
    const kit = placeTutorialSpawns(atStep('gatherKit'), player, null, now);
    expect(kit.tutorial.spawns.map((s) => s.materialId).sort()).toEqual(['bone', 'hide', 'meat']);
  });
});

describe('collecting a tutorial spawn', () => {
  const placed = () => placeTutorialSpawns(createInitialSave(), player, null, now);

  it('refuses what is out of reach or already picked up', () => {
    const save = placed();
    const [first] = shownTutorialSpawns(save);
    const far = { latitude: player.latitude + 0.01, longitude: player.longitude };
    expect(collectTutorialSpawn(save, first.id, far, now)).toMatchObject({ ok: false, reason: 'tooFar' });
    expect(collectTutorialSpawn(save, first.id, null, now)).toMatchObject({ ok: false, reason: 'tooFar' });
    const result = collectTutorialSpawn(save, first.id, player, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.materialId).toBe('wood');
    expect(result.save.materials.wood).toBe(1);
    expect(result.save.tutorial.lastPickupAt).toBe(now);
    expect(collectTutorialSpawn(result.save, first.id, player, now)).toMatchObject({ ok: false, reason: 'collected' });
  });

  it('collects from anywhere with the fallback, and counts the wood gathered', () => {
    let save = placed();
    for (const spawn of shownTutorialSpawns(save)) {
      const result = collectTutorialSpawn(save, spawn.id, null, now, { anywhere: true });
      if (!result.ok) throw new Error(result.reason);
      save = result.save;
    }
    expect(save.materials.wood).toBe(4);
    expect(save.tutorial.step).toBe('forgeSword');
    expect(shownTutorialSpawns(save)).toEqual([]);
  });
});

describe('the pick-up range', () => {
  it('is 50 m during the tutorial and back to the normal 30 m after', () => {
    const save = placeTutorialSpawns(createInitialSave(), player, null, now);
    expect(collectRadiusNow(save)).toBe(tutorialRules.collectRadiusMeters);
    expect(collectRadiusNow(save)).toBe(50);
    expect(gatheringConfig.collectRadiusMeters).toBe(30);
    const done: SaveData = { ...save, tutorial: { ...save.tutorial, step: 'done' } };
    expect(collectRadiusNow(done)).toBe(30);
  });

  it('reaches a node at 40 m during the tutorial, and refuses one at 55 m', () => {
    const save = placeTutorialSpawns(createInitialSave(), player, null, now);
    const node = shownTutorialSpawns(save)[0];
    const at40 = offsetPosition(node.position!, 40, 0); // 40 m from the node: inside the tutorial's 50 m
    expect(collectTutorialSpawn(save, node.id, at40, now).ok).toBe(true);
    const at55 = offsetPosition(node.position!, 55, 0);
    expect(collectTutorialSpawn(save, node.id, at55, now)).toMatchObject({ ok: false, reason: 'tooFar' });
  });
});

describe('the walking fallback', () => {
  const placed = () => placeTutorialSpawns(createInitialSave(), player, null, now);

  it('shows 30 seconds after a spawn, and waits 30 s again after each pickup', () => {
    const save = placed();
    expect(fallbackReady(save, now + 29_999, false)).toBe(false);
    expect(fallbackReady(save, now + 30_000, false)).toBe(true);
    // One node picked up: the fallback waits 30 s from that pickup, not from the spawn.
    const [first] = shownTutorialSpawns(save);
    const picked = collectTutorialSpawn(save, first.id, player, now + 10_000);
    if (!picked.ok) throw new Error(picked.reason);
    expect(fallbackReady(picked.save, now + 39_999, false)).toBe(false);
    expect(fallbackReady(picked.save, now + 40_000, false)).toBe(true);
  });

  it('shows at once while location is off, never once the step is over', () => {
    const save = placed();
    expect(fallbackReady(save, now, true)).toBe(true);
    const picked = collectFromHere(save, now);
    if (!picked.ok) throw new Error(picked.reason);
    expect(picked.save.tutorial.step).toBe('forgeSword');
    expect(fallbackReady(picked.save, now + 120_000, true)).toBe(false);
    expect(fallbackReady(picked.save, now + 120_000, false)).toBe(false);
  });

  it('collects every remaining node of the step at once', () => {
    const save = placed();
    const picked = collectFromHere(save, now);
    if (!picked.ok) throw new Error(picked.reason);
    expect(picked.gained).toHaveLength(4);
    expect(picked.save.materials.wood).toBe(4);
    expect(picked.save.tutorial.step).toBe('forgeSword');
    expect(shownTutorialSpawns(picked.save)).toEqual([]);
    expect(collectFromHere(picked.save, now)).toMatchObject({ ok: false, reason: 'collected', distance: Infinity });
  });
});

describe('respawning when the player drifts away', () => {
  it('moves the remaining nodes around the player once they are all more than 60 m away', () => {
    const save = placeTutorialSpawns(createInitialSave(), player, null, now);
    // Standing still: nothing to respawn.
    expect(placeTutorialSpawns(save, player, null, now + 1000)).toBe(save);
    // 100 m away from every node: they come back around the new position.
    const wandered = offsetPosition(player, 0, 100);
    const respawned = placeTutorialSpawns(save, wandered, null, now + 2000);
    expect(respawned).not.toBe(save);
    const nodes = shownTutorialSpawns(respawned);
    expect(nodes).toHaveLength(4);
    for (const node of nodes) {
      const distance = distanceMeters(wandered, node.position!);
      expect(distance).toBeGreaterThanOrEqual(tutorialRules.spawnMeters[0]);
      expect(distance).toBeLessThanOrEqual(tutorialRules.spawnMeters[1]);
    }
    // Within reach again: no further respawn.
    expect(placeTutorialSpawns(respawned, wandered, null, now + 3000)).toBe(respawned);
  });

  it('keeps what was already picked up, and respawns only the rest', () => {
    let save = placeTutorialSpawns(createInitialSave(), player, null, now);
    const [first] = shownTutorialSpawns(save);
    const picked = collectTutorialSpawn(save, first.id, player, now);
    if (!picked.ok) throw new Error(picked.reason);
    save = picked.save;
    expect(save.materials.wood).toBe(1);
    const wandered = offsetPosition(player, 0, 100);
    const respawned = placeTutorialSpawns(save, wandered, null, now + 2000);
    expect(respawned.tutorial.spawns).toHaveLength(4);
    expect(respawned.tutorial.spawns.every((s) => !s.collected)).toBe(true);
    expect(shownTutorialSpawns(respawned)).toHaveLength(4);
    // The gathered wood is not lost or duplicated.
    expect(respawned.materials.wood).toBe(1);
  });
});
