import { distanceMeters, offsetPosition } from './geo';

const wellington = { latitude: -41.2865, longitude: 174.7762 };

describe('geo', () => {
  it('measures distance between two points', () => {
    const auckland = { latitude: -36.8485, longitude: 174.7633 };
    expect(distanceMeters(wellington, auckland) / 1000).toBeCloseTo(493, -1);
    expect(distanceMeters(wellington, wellington)).toBe(0);
  });

  it('offsets a position by metres north and east', () => {
    expect(distanceMeters(wellington, offsetPosition(wellington, 100, 0))).toBeCloseTo(100, 0);
    expect(distanceMeters(wellington, offsetPosition(wellington, 0, 100))).toBeCloseTo(100, 0);
    expect(offsetPosition(wellington, 0, 100).longitude).toBeGreaterThan(wellington.longitude);
  });
});
