import { mainRewardRules } from '@/content/mainRewards';

import { distanceMeters } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { pruneExpired } from '../upkeep';
import { activateLure, isLureActive, lureSpawns } from './lures';

const here = { latitude: -41.2865, longitude: 174.7762 };
const MIN = 60_000;
const stocked = (lures = 2): SaveData => ({ ...createInitialSave(), lures });

describe('lures', () => {
  it('uses one lure and runs for 30 minutes', () => {
    const save = activateLure(stocked(), here, 0);
    expect(save.lures).toBe(1);
    expect(isLureActive(save, 29 * MIN)).toBe(true);
    expect(isLureActive(save, 30 * MIN)).toBe(false);
  });

  it('allows one at a time and needs one in stock', () => {
    const save = activateLure(stocked(), here, 0);
    expect(() => activateLure(save, here, MIN)).toThrow();
    expect(() => activateLure(stocked(0), here, 0)).toThrow();
    expect(activateLure(save, here, 31 * MIN).lures).toBe(0);
  });

  it('draws extra herbs and animals nearby, the same each time, until it ends', () => {
    const save = activateLure(stocked(), here, 0);
    const spawns = lureSpawns(save.activeLure, MIN);
    const { herbs, animals, radiusMeters } = mainRewardRules.lure;
    expect(spawns.filter((s) => s.kind === 'herb')).toHaveLength(herbs);
    expect(spawns.filter((s) => s.kind === 'animal')).toHaveLength(animals);
    spawns.forEach((s) => {
      const point = s.kind === 'animal' ? s.path.waypoints[0] : s.position;
      expect(distanceMeters(here, point)).toBeLessThanOrEqual(radiusMeters + 41);
      expect(s.expiresAt).toBe(30 * MIN);
    });
    expect(lureSpawns(save.activeLure, 2 * MIN)).toEqual(spawns);
    expect(lureSpawns(save.activeLure, 30 * MIN)).toEqual([]);
    expect(pruneExpired(save, 30 * MIN).activeLure).toBeNull();
  });
});
