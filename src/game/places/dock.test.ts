import { dockRules } from '@/content/placeActivities';

import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { fish, fishProblem } from './dock';
import type { PlaceSpawn } from './generate';

const position: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };
const now = 0;

const spawnOf = (suffix = '0:1'): PlaceSpawn => ({
  id: `place:fishingDock:tile:${suffix}`,
  kind: 'fishingDock',
  group: 'fishingDock',
  tile: 'tile',
  position,
  startsAt: 0,
  expiresAt: 1e15,
  roll: 0,
});

describe('fish', () => {
  it('catches fish within the rules once, then the dock is used up', () => {
    const { save, amount } = fish(createInitialSave(), spawnOf(), position, now);
    expect(amount).toBeGreaterThanOrEqual(dockRules.fish[0]);
    expect(amount).toBeLessThanOrEqual(dockRules.fish[1]);
    expect(save.materials.fish).toBe(amount);
    expect(fishProblem(save, spawnOf(), position, now)).toBe('gone');
    expect(() => fish(save, spawnOf(), position, now)).toThrow();
  });

  it('always catches the same amount at the same dock', () => {
    const first = fish(createInitialSave(), spawnOf(), position, now);
    const second = fish(createInitialSave(), spawnOf(), position, now);
    expect(second.amount).toBe(first.amount);
  });

  it('refuses docks that are not there or too far', () => {
    const save: SaveData = createInitialSave();
    expect(fishProblem(save, { ...spawnOf('1:1'), kind: 'market' }, position, now)).toBe('gone');
    expect(fishProblem(save, { ...spawnOf('1:2'), startsAt: 100 }, position, now)).toBe('gone');
    expect(fishProblem(save, { ...spawnOf('1:3'), expiresAt: -1 }, position, now)).toBe('gone');
    expect(fishProblem(save, spawnOf('1:4'), far, now)).toBe('tooFar');
  });
});
