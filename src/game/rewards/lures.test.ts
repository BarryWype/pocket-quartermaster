import { lureRules } from '@/content/gatheringConfig';

import { distanceMeters } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { pruneExpired } from '../upkeep';
import { activateLure, isLureActive, lureSpawns } from './lures';

const here = { latitude: -41.2865, longitude: 174.7762 };
const MIN = 60_000;
const DURATION = lureRules.durationMinutes * MIN;
const stocked = (lures = 2): SaveData => ({ ...createInitialSave(), lures });

describe('lures', () => {
  it('uses one lure and runs for its duration', () => {
    const save = activateLure(stocked(), here, 0);
    expect(save.lures).toBe(1);
    expect(isLureActive(save, DURATION - MIN)).toBe(true);
    expect(isLureActive(save, DURATION)).toBe(false);
  });

  it('allows one at a time and needs one in stock', () => {
    const save = activateLure(stocked(), here, 0);
    expect(() => activateLure(save, here, MIN)).toThrow();
    expect(() => activateLure(stocked(0), here, 0)).toThrow();
    expect(activateLure(save, here, DURATION + MIN).lures).toBe(0);
  });

  it('draws extra herbs and animals nearby, the same each time, until it ends', () => {
    const save = activateLure(stocked(), here, 0);
    const spawns = lureSpawns(save.activeLure, MIN);
    expect(spawns.filter((s) => s.kind === 'herb')).toHaveLength(lureRules.herbs);
    expect(spawns.filter((s) => s.kind === 'animal')).toHaveLength(lureRules.animals);
    spawns.forEach((s) => {
      const point = s.kind === 'animal' ? s.path.waypoints[0] : s.position;
      expect(distanceMeters(here, point)).toBeLessThanOrEqual(lureRules.radiusMeters + 41);
      expect(s.expiresAt).toBe(DURATION);
    });
    expect(lureSpawns(save.activeLure, 2 * MIN)).toEqual(spawns);
    expect(lureSpawns(save.activeLure, DURATION)).toEqual([]);
    expect(pruneExpired(save, DURATION).activeLure).toBeNull();
  });
});
