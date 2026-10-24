import { offsetPosition } from '../generation/geo';
import { acceptFix, type GpsFix } from './locationFilter';

const origin = { latitude: -41.2865, longitude: 174.7762 };

function fix(northMeters: number, seconds: number, extra: Partial<GpsFix> = {}): GpsFix {
  return {
    position: offsetPosition(origin, northMeters, 0),
    accuracy: 10,
    speed: null,
    timestamp: seconds * 1000,
    ...extra,
  };
}

describe('acceptFix', () => {
  it('accepts the first accurate reading', () => {
    expect(acceptFix(null, fix(0, 0))).toEqual(fix(0, 0));
  });

  it('rejects readings with poor accuracy', () => {
    expect(acceptFix(null, fix(0, 0, { accuracy: 120 }))).toBeNull();
  });

  it('rejects impossible jumps', () => {
    expect(acceptFix(fix(0, 0), fix(2000, 10))).toBeNull();
  });

  it('rejects out-of-order readings', () => {
    expect(acceptFix(fix(0, 10), fix(5, 5))).toBeNull();
  });

  it('fills in speed from the distance travelled when the GPS has none', () => {
    expect(acceptFix(fix(0, 0), fix(30, 10))?.speed).toBeCloseTo(3, 1);
  });

  it('keeps the GPS speed when reported', () => {
    expect(acceptFix(fix(0, 0), fix(30, 10, { speed: 2.5 }))?.speed).toBe(2.5);
  });
});
