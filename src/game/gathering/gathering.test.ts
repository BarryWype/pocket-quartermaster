import { gatheringConfig } from '@/content/gatheringConfig';

import { offsetPosition } from '../generation/geo';
import type { AnimalSpawn, StaticSpawn } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { canGather, collectSpawn, isFleeing, localDayKey, pickaxeTier, pruneCollected } from './gathering';
import { readSpawn } from './lockedNodes';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;

/** Past the tutorial, with the wooden pickaxe and the day's walking bonus spent (it has its own tests). */
const withPickaxe = (tools = ['woodPickaxe']): SaveData => ({
  ...createInitialSave(),
  tools,
  tutorial: { ...createInitialSave().tutorial, step: 'done' },
  freshGathers: { day: localDayKey(now), used: gatheringConfig.walkingBonus.gathers },
});

function oreSpawn(resourceId: string, i = 0): StaticSpawn {
  return {
    id: `ore:abc:1:${resourceId}:${i}`,
    kind: 'ore',
    resourceId,
    tile: 'abc',
    quantity: 2,
    boosted: false,
    expiresAt: now + 60_000,
    position: offsetPosition(origin, 10, 0),
  };
}

const stoneSpawn = oreSpawn('stone');

const treeSpawn: StaticSpawn = { ...stoneSpawn, id: 'wood:abc:1:0', kind: 'wood', resourceId: 'tree' };

const deerSpawn: AnimalSpawn = {
  id: 'animal:abc:1:0',
  kind: 'animal',
  resourceId: 'deer',
  tile: 'abc',
  quantity: 1,
  boosted: false,
  expiresAt: now + 60_000,
  path: { waypoints: [offsetPosition(origin, 5, 0)], loopMs: 60_000, phaseMs: 0 },
};

const walking = { position: origin, speed: 1.4 };

describe('collectSpawn', () => {
  it('adds the yield to the inventory and marks the spawn collected', () => {
    const result = collectSpawn(withPickaxe(), stoneSpawn, walking, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.gained).toEqual([{ materialId: 'stone', amount: 2 }]);
    expect(result.save.materials).toEqual({ stone: 2 });
    expect(result.save.collected).toEqual({ [stoneSpawn.id]: stoneSpawn.expiresAt });
  });

  it('cannot collect the same spawn twice in a window', () => {
    const first = collectSpawn(withPickaxe(), stoneSpawn, walking, now);
    if (!first.ok) throw new Error(first.reason);
    expect(collectSpawn(first.save, stoneSpawn, walking, now)).toMatchObject({ ok: false, reason: 'collected' });
  });

  it('requires the player to be within range', () => {
    const far = { position: offsetPosition(origin, -40, 0), speed: 1 };
    const result = collectSpawn(withPickaxe(), stoneSpawn, far, now);
    expect(result).toMatchObject({ ok: false, reason: 'tooFar' });
    if (!result.ok) expect(result.distance).toBeCloseTo(50, 0);
  });

  it('refuses expired spawns', () => {
    expect(collectSpawn(withPickaxe(), stoneSpawn, walking, stoneSpawn.expiresAt)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('gives every material an animal yields', () => {
    const result = collectSpawn(withPickaxe(), deerSpawn, walking, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.materials).toEqual({ hide: 2, bone: 1, meat: 1 });
  });

  it('makes animals flee from fast players but not ore', () => {
    const driving = { position: origin, speed: 12 };
    expect(collectSpawn(withPickaxe(), deerSpawn, driving, now)).toMatchObject({ ok: false, reason: 'fled' });
    expect(collectSpawn(withPickaxe(), stoneSpawn, driving, now).ok).toBe(true);
  });

  it('refuses ore the pickaxe cannot mine, when the node reads locked', () => {
    // Locked ore reads converted (minable) or locked by its spawn id's hash (see lockedNodes.test.ts).
    const save = withPickaxe();
    const reads = Array.from({ length: 50 }, (_, i) => oreSpawn('copper', i)).map((spawn) => ({ spawn, read: readSpawn(save, spawn) }));
    const locked = reads.find((r) => r.read.state === 'locked')!;
    expect(collectSpawn(save, locked.spawn, walking, now)).toMatchObject({ ok: false, reason: 'needsTool' });
    const converted = reads.find((r) => r.read.state === 'converted')!;
    const result = collectSpawn(save, converted.spawn, walking, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.gained).toEqual([{ materialId: 'stone', amount: 2 }]);
  });
});

describe('tool gating', () => {
  it('gathers wood and animals from the start, ores behind the pickaxe', () => {
    const fresh = createInitialSave();
    expect(canGather(fresh, treeSpawn)).toBe(true);
    expect(canGather(fresh, stoneSpawn)).toBe(false);
    expect(canGather(fresh, deerSpawn)).toBe(true);
  });

  it('opens each ore at its pickaxe tier, locked ones by their spawn id’s hash', () => {
    expect(canGather(withPickaxe(), stoneSpawn)).toBe(true);
    // A copper node with a wooden pickaxe gathers only if it reads converted.
    const save = withPickaxe();
    for (let i = 0; i < 30; i++) {
      const spawn = oreSpawn('copper', i);
      expect(canGather(save, spawn)).toBe(readSpawn(save, spawn).state !== 'locked');
    }
    const stonePick = withPickaxe(['woodPickaxe', 'stonePickaxe']);
    expect(canGather(stonePick, oreSpawn('copper'))).toBe(true);
    for (let i = 0; i < 30; i++) {
      const spawn = oreSpawn('iron', i);
      expect(canGather(stonePick, spawn)).toBe(readSpawn(stonePick, spawn).state !== 'locked');
    }
    const ironPick = withPickaxe(['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe']);
    expect(canGather(ironPick, oreSpawn('coal'))).toBe(true);
  });

  it('uses the best pickaxe owned', () => {
    expect(pickaxeTier(createInitialSave())).toBe(0);
    expect(pickaxeTier(withPickaxe(['woodPickaxe', 'copperPickaxe']))).toBe(3);
  });
});

describe('helpers', () => {
  it('treats unknown speed as standing still', () => {
    expect(isFleeing(null)).toBe(false);
    expect(isFleeing(3)).toBe(false);
    expect(isFleeing(8)).toBe(true);
  });

  it('prunes collected entries once their window has ended', () => {
    expect(pruneCollected({ a: now - 1, b: now + 1 }, now)).toEqual({ b: now + 1 });
  });
});
