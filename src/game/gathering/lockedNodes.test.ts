import { resources } from '@/content/resources';
import type { StaticSpawn } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { canGather, collectSpawn } from './gathering';
import { readSpawn, requiredPickaxeTier } from './lockedNodes';

const NOW = 1_000_000_000;
const at = { position: { latitude: 0, longitude: 0 }, speed: 0 };

/** An ore spawn of a resource that needs `pickaxeTier`. */
const oreSpawn = (resourceId: string, i: number): StaticSpawn => ({
  id: `ore:t:1:${i}`,
  kind: 'ore',
  resourceId,
  tile: 't',
  quantity: 1,
  boosted: false,
  expiresAt: NOW + 3_600_000,
  position: { latitude: 0, longitude: 0 },
});

/** Past the tutorial with pickaxes up to `tier`. */
const withPickaxes = (tier: number): SaveData => {
  const pickaxes = ['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe', 'steelPickaxe'].slice(0, tier);
  return { ...createInitialSave(), tools: pickaxes, tutorial: { step: 'done', woodSpot: null } };
};

describe('locked ore nodes', () => {
  it('converts about half of the locked nodes, deterministically per spawn id', () => {
    const save = withPickaxes(1); // stone and below minable; copper, iron and coal locked
    const locked = ['copper', 'iron', 'coal'].flatMap((resourceId) => Array.from({ length: 400 }, (_, i) => oreSpawn(resourceId, i)));
    const reads = locked.map((spawn) => readSpawn(save, spawn));
    const converted = reads.filter((r) => r.state === 'converted').length;
    expect(converted / locked.length).toBeGreaterThan(0.4);
    expect(converted / locked.length).toBeLessThan(0.6);
    // The same spawn always reads the same way for the same pickaxes.
    for (const spawn of locked.slice(0, 20)) {
      expect(readSpawn(save, spawn)).toEqual(readSpawn(save, spawn));
    }
  });

  it('converts to an ore the player can mine, weighted towards their highest tier', () => {
    const save = withPickaxes(2); // stone and copper minable, iron locked
    const counts: Record<string, number> = {};
    for (let i = 0; i < 600; i++) {
      const read = readSpawn(save, oreSpawn('iron', i));
      if (read.state !== 'converted') continue;
      counts[read.resourceId] = (counts[read.resourceId] ?? 0) + 1;
      // Always minable, never the locked ore itself.
      expect(resources.find((r) => r.id === read.resourceId)!.pickaxeTier).toBeLessThanOrEqual(2);
    }
    expect(Object.keys(counts).sort()).toEqual(['copper', 'stone']);
    // Copper (the higher tier) is the more common conversion.
    expect(counts.copper).toBeGreaterThan(counts.stone);
  });

  it('keeps locked nodes refused by collectSpawn, with the needed pickaxe tier known', () => {
    const save = withPickaxes(1);
    const iron = oreSpawn('iron', 0);
    if (readSpawn(save, iron).state === 'converted') {
      // This one happens to read as a minable ore: it gathers.
      const result = collectSpawn(save, iron, at, NOW);
      expect(result.ok).toBe(true);
    } else {
      expect(collectSpawn(save, iron, at, NOW)).toMatchObject({ ok: false, reason: 'needsTool' });
      expect(requiredPickaxeTier(iron)).toBe(3);
      expect(canGather(save, iron)).toBe(false);
    }
    // With the pickaxe gained, the node simply is its resource.
    const upgraded = withPickaxes(3);
    expect(readSpawn(upgraded, iron)).toEqual({ state: 'open', resourceId: 'iron' });
    expect(canGather(upgraded, iron)).toBe(true);
  });

  it('leaves every locked node greyed out without a pickaxe at all', () => {
    const save = withPickaxes(0);
    const stone = oreSpawn('stone', 0);
    expect(readSpawn(save, stone).state).toBe('locked');
    expect(collectSpawn(save, stone, at, NOW)).toMatchObject({ ok: false, reason: 'needsTool' });
  });
});
