import { offsetPosition } from '../generation/geo';
import { addGrab, dropIndex, legAt, moveGrab, removeAt, reorderStops, shiftStop, toggleStop } from './routeEdit';
import type { RoutePoint, StreetPath } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const at = (north: number, east: number) => offsetPosition(origin, north, east);
const via = (north: number, east: number): RoutePoint => ({ via: at(north, east) });

describe('toggleStop', () => {
  it('adds a pin as the last stop, and takes a stop already on off', () => {
    const draft: RoutePoint[] = [{ building: 'b1' }];
    expect(toggleStop(draft, { place: 'p1', position: at(10, 0) })).toEqual([{ building: 'b1' }, { place: 'p1', position: at(10, 0) }]);
    expect(toggleStop(draft, { building: 'b1' })).toEqual([]);
  });
});

describe('shiftStop', () => {
  it('jumps over grab points to the next stop, which keep their slots', () => {
    const draft: RoutePoint[] = [{ building: 'a' }, via(5, 5), { building: 'b' }];
    expect(shiftStop(draft, 0, 1)).toEqual([{ building: 'b' }, via(5, 5), { building: 'a' }]);
    expect(shiftStop(draft, 0, -1)).toBe(draft);
    expect(shiftStop(draft, 2, 1)).toBe(draft);
  });
});

describe('reorderStops', () => {
  it('moves a stop among the stops, the grab points staying put', () => {
    const draft: RoutePoint[] = [{ building: 'a' }, { building: 'b' }, via(1, 1), { building: 'c' }];
    expect(reorderStops(draft, 0, 2)).toEqual([{ building: 'b' }, { building: 'c' }, via(1, 1), { building: 'a' }]);
    expect(reorderStops(draft, 2, 0)).toEqual([{ building: 'c' }, { building: 'a' }, via(1, 1), { building: 'b' }]);
  });
});

describe('legAt', () => {
  // Hall at the origin → stop 1 at 100 m north → stop 2 at 100 m north, 100 m east → back home.
  const path: StreetPath = { points: [at(0, 0), at(50, 0), at(100, 0), at(100, 100), at(0, 100), at(0, 0)], stopAt: [2, 3], straightLegs: [] };

  it('finds the leg a tap lands on, and the nearest point of the line', () => {
    expect(legAt(path, at(30, 5))).toMatchObject({ leg: 0 });
    expect(legAt(path, at(105, 50))).toMatchObject({ leg: 1 });
    const back = legAt(path, at(50, 110))!;
    expect(back.leg).toBe(2);
    expect(back.meters).toBeCloseTo(10, 0);
    expect(back.point.longitude).toBeCloseTo(at(50, 100).longitude, 6);
  });

  it('a tap on a grab point’s leg counts the grab point as a route point', () => {
    const withVia: StreetPath = { ...path, stopAt: [1, 2, 3] };
    expect(legAt(withVia, at(80, 2))).toMatchObject({ leg: 1 });
  });
});

describe('grab points', () => {
  it('a grab point goes on its leg; a drop moves it; Remove takes it off', () => {
    const draft: RoutePoint[] = [{ building: 'a' }, { building: 'b' }];
    const grabbed = addGrab(draft, 1, at(50, 50));
    expect(grabbed).toEqual([{ building: 'a' }, { via: at(50, 50) }, { building: 'b' }]);
    expect(moveGrab(grabbed, 1, at(60, 60))[1]).toEqual({ via: at(60, 60) });
    expect(moveGrab(grabbed, 0, at(60, 60))).toBe(grabbed);
    expect(removeAt(grabbed, 1)).toEqual(draft);
  });
});

describe('dropIndex', () => {
  const chips = [
    { x: 0, width: 60 },
    { x: 66, width: 60 },
    { x: 132, width: 60 },
  ];
  it('drops a dragged chip by the middles it passed', () => {
    expect(dropIndex(chips, 0, 10)).toBe(0);
    expect(dropIndex(chips, 0, 80)).toBe(1);
    expect(dropIndex(chips, 0, 200)).toBe(2);
    expect(dropIndex(chips, 2, -140)).toBe(0);
  });
});
