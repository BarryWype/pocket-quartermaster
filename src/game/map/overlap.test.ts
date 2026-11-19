import { offsetPosition } from '../generation/geo';
import { metersPerPoint, overlapping } from './overlap';

const origin = { latitude: -41.2865, longitude: 174.7762 };

describe('overlapping markers', () => {
  it('a point covers about 0.9 m at zoom 17 in Wellington, and twice that a zoom level out', () => {
    expect(metersPerPoint(origin.latitude, 17)).toBeCloseTo(0.45, 1);
    expect(metersPerPoint(origin.latitude, 16)).toBeCloseTo(2 * metersPerPoint(origin.latitude, 17), 6);
  });

  it('a tap lands on the markers within 40 points of the tapped one, nearest first, the tapped one leading', () => {
    const mpp = 1; // one metre per point
    const hit = { id: 'smithy', position: origin };
    const markers = [
      hit,
      { id: 'far', position: offsetPosition(origin, 100, 0) },
      { id: 'touching', position: offsetPosition(origin, 30, 0) },
      { id: 'onTop', position: offsetPosition(origin, 5, 0) },
    ];
    expect(overlapping(hit, markers, mpp).map((m) => m.id)).toEqual(['smithy', 'onTop', 'touching']);
  });

  it('zoomed in, the same markers no longer overlap', () => {
    const hit = { id: 'a', position: origin };
    const other = { id: 'b', position: offsetPosition(origin, 10, 0) };
    expect(overlapping(hit, [hit, other], metersPerPoint(origin.latitude, 16))).toHaveLength(2);
    expect(overlapping(hit, [hit, other], metersPerPoint(origin.latitude, 20))).toHaveLength(1);
  });
});
