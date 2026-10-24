import { animalPositionAt, createAnimalPath } from './animalPaths';
import { distanceMeters } from './geo';
import { createRng } from './rng';
import { tileAt } from './tiles';

const tile = tileAt({ latitude: -41.2865, longitude: 174.7762 }, 7);

describe('animal paths', () => {
  const path = createAnimalPath(tile, createRng('animal'), 4, 20);

  it('is the same for the same seed', () => {
    expect(createAnimalPath(tile, createRng('animal'), 4, 20)).toEqual(path);
  });

  it('gives the same position for the same time', () => {
    expect(animalPositionAt(path, 123_456)).toEqual(animalPositionAt(path, 123_456));
  });

  it('stays inside its tile', () => {
    for (let t = 0; t < path.loopMs; t += 30_000) {
      expect(tileAt(animalPositionAt(path, t), 7)).toBe(tile);
    }
  });

  it('moves over time and loops back', () => {
    const start = animalPositionAt(path, 0);
    expect(distanceMeters(start, animalPositionAt(path, 60_000))).toBeGreaterThan(1);
    expect(distanceMeters(start, animalPositionAt(path, path.loopMs))).toBeLessThan(0.01);
  });
});
