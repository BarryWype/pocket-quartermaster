import { walkableRules } from '@/content/walkable';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { snapToWalkable, type WalkableTile } from '../generation/walkable';
import { createInitialSave, type SaveData } from '../save';
import { collectFromHere, collectTutorialSpawn, fallbackReady, placeTutorialSpawns, shownTutorialSpawns } from './spawns';

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
  it('places one node per material, 15–30 m away, 8 m apart, on walkable spots', () => {
    const save = placeTutorialSpawns(createInitialSave(), player, tile, now);
    const spawns = save.tutorial.spawns;
    expect(spawns).toHaveLength(4);
    expect(shownTutorialSpawns(save).map((s) => s.materialId)).toEqual(['wood', 'wood', 'wood', 'wood']);
    for (const spawn of spawns) {
      const distance = distanceMeters(player, spawn.position!);
      expect(distance).toBeGreaterThanOrEqual(15);
      expect(distance).toBeLessThanOrEqual(30);
      expect(snapToWalkable(tile, spawn.position!, walkableRules.maxSnapMeters)).not.toBeNull();
    }
    for (const [a, b] of spawns.flatMap((a, i) => spawns.slice(i + 1).map((b) => [a, b] as const))) {
      expect(distanceMeters(a.position!, b.position!)).toBeGreaterThanOrEqual(8);
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

describe('the walking fallback', () => {
  const placed = () => placeTutorialSpawns(createInitialSave(), player, null, now);

  it('shows a minute after a spawn, and waits a minute again after each pickup', () => {
    const save = placed();
    expect(fallbackReady(save, now + 59_999, false)).toBe(false);
    expect(fallbackReady(save, now + 60_000, false)).toBe(true);
    const picked = collectFromHere(save, now + 60_000);
    if (!picked.ok) throw new Error(picked.reason);
    expect(fallbackReady(picked.save, now + 119_999, false)).toBe(false);
    expect(fallbackReady(picked.save, now + 120_000, false)).toBe(true);
  });

  it('shows at once while location is off, never once the step is over', () => {
    const save = placed();
    expect(fallbackReady(save, now, true)).toBe(true);
    let done = save;
    for (let i = 0; i < save.tutorial.spawns.length; i++) {
      const picked = collectFromHere(done, now + i);
      if (!picked.ok) throw new Error(picked.reason);
      done = picked.save;
    }
    expect(done.tutorial.step).toBe('forgeSword');
    expect(fallbackReady(done, now + 120_000, true)).toBe(false);
    expect(fallbackReady(done, now + 120_000, false)).toBe(false);
  });

  it('collects one node per call, and the phase finishes after as many calls as nodes', () => {
    let save = placed();
    for (let i = 0; i < save.tutorial.spawns.length; i++) {
      const picked = collectFromHere(save, now + i);
      if (!picked.ok) throw new Error(picked.reason);
      save = picked.save;
    }
    expect(save.materials.wood).toBe(4);
    expect(save.tutorial.step).toBe('forgeSword');
    expect(collectFromHere(save, now)).toMatchObject({ ok: false, reason: 'collected', distance: Infinity });
  });
});
