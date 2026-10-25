import { offsetPosition } from '../generation/geo';
import type { AnimalSpawn, StaticSpawn } from '../generation/types';
import { createInitialSave } from '../save';
import { collectSpawn, isFleeing, pruneCollected } from './gathering';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;

const ironSpawn: StaticSpawn = {
  id: 'ore:abc:1:0',
  kind: 'ore',
  resourceId: 'iron',
  tile: 'abc',
  quantity: 2,
  boosted: false,
  expiresAt: now + 60_000,
  position: offsetPosition(origin, 10, 0),
};

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

const treeSpawn: StaticSpawn = { ...ironSpawn, id: 'ore:abc:1:1', resourceId: 'tree', quantity: 1 };

const walking = { position: origin, speed: 1.4 };
const withTools = (...tools: string[]) => ({ ...createInitialSave(), tools });
const miner = withTools('copperPickaxe');

describe('collectSpawn', () => {
  it('adds the yield to the inventory and marks the spawn collected', () => {
    const result = collectSpawn(miner, ironSpawn, walking, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.gained).toEqual([{ materialId: 'ironOre', amount: 2 }]);
    expect(result.save.materials).toEqual({ ironOre: 2 });
    expect(result.save.collected).toEqual({ [ironSpawn.id]: ironSpawn.expiresAt });
  });

  it('cannot collect the same spawn twice in a window', () => {
    const first = collectSpawn(miner, ironSpawn, walking, now);
    if (!first.ok) throw new Error(first.reason);
    expect(collectSpawn(first.save, ironSpawn, walking, now)).toMatchObject({ ok: false, reason: 'collected' });
  });

  it('requires the player to be within range', () => {
    const far = { position: offsetPosition(origin, -40, 0), speed: 1 };
    const result = collectSpawn(miner, ironSpawn, far, now);
    expect(result).toMatchObject({ ok: false, reason: 'tooFar' });
    if (!result.ok) expect(result.distance).toBeCloseTo(50, 0);
  });

  it('refuses expired spawns', () => {
    expect(collectSpawn(miner, ironSpawn, walking, ironSpawn.expiresAt)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('gathers trees without a tool', () => {
    const result = collectSpawn(createInitialSave(), treeSpawn, walking, now);
    expect(result).toMatchObject({ ok: true, gained: [{ materialId: 'wood', amount: 1 }] });
  });

  it('needs a strong enough pickaxe for ore', () => {
    expect(collectSpawn(createInitialSave(), ironSpawn, walking, now)).toMatchObject({
      ok: false,
      reason: 'needsPickaxe',
      requiredPickaxe: 3,
    });
    expect(collectSpawn(withTools('woodPickaxe', 'stonePickaxe'), ironSpawn, walking, now).ok).toBe(false);
    expect(collectSpawn(withTools('ironPickaxe'), ironSpawn, walking, now).ok).toBe(true);
  });

  it('gives extra materials with the steel pickaxe', () => {
    const result = collectSpawn(withTools('steelPickaxe'), ironSpawn, walking, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.gained).toEqual([{ materialId: 'ironOre', amount: 3 }]);
  });

  it('gives every material an animal yields', () => {
    const result = collectSpawn(createInitialSave(), deerSpawn, walking, now);
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.materials).toEqual({ hide: 2, bone: 1, meat: 1 });
  });

  it('makes animals flee from fast players but not ore', () => {
    const driving = { position: origin, speed: 12 };
    expect(collectSpawn(createInitialSave(), deerSpawn, driving, now)).toMatchObject({ ok: false, reason: 'fled' });
    expect(collectSpawn(miner, ironSpawn, driving, now).ok).toBe(true);
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
