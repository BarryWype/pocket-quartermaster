import { cullIds, sameIds } from './culling';
import type { LatLng } from './types';

const at = (latitude: number, longitude: number): LatLng => ({ latitude, longitude });
const item = (id: string, position: LatLng) => ({ id, position });
// A view about 1.2 km tall and 1 km wide around Wellington's centre.
const BOUNDS: [west: number, south: number, east: number, north: number] = [174.771, -41.292, 174.781, -41.281];

describe('marker culling', () => {
  it('draws everything inside the bounds, and nothing far outside', () => {
    const items = [
      item('centre', at(-41.2865, 174.776)),
      item('west-edge', at(-41.2865, 174.7715)),
      item('east-edge', at(-41.2865, 174.7805)),
      item('far', at(-41.2, 174.8)),
    ];
    expect(cullIds(items, BOUNDS, [])).toEqual(['centre', 'west-edge', 'east-edge']);
  });

  it('draws inside the margin too: about a quarter of the view beyond each side', () => {
    // The margin is 0.0025 degrees of longitude (a quarter of the 0.01 view) and 0.00275 of latitude.
    const items = [
      item('just-inside', at(-41.283, 174.7735)), // inside the western margin
      item('just-outside', at(-41.276, 174.776)), // past the northern margin
    ];
    expect(cullIds(items, BOUNDS, [])).toEqual(['just-inside']);
  });

  it('always draws the selected patrol and the open panel place, wherever they stand', () => {
    const items = [item('patrol', at(-41.2, 174.8)), item('place', at(-41.25, 174.85)), item('far', at(-40.9, 175.0))];
    expect(cullIds(items, BOUNDS, ['patrol', 'place'])).toEqual(['patrol', 'place']);
  });

  it('draws everything until the map has said where it looks', () => {
    const items = [item('a', at(-41.2, 174.8)), item('b', at(-40.9, 175.0))];
    expect(cullIds(items, null, [])).toEqual(['a', 'b']);
  });

  it('detects an unchanged set of ids, so the caller can skip the update', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameIds(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(sameIds([], [])).toBe(true);
  });
});
