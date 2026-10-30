import { mapDistanceRange } from './treasure';

describe('treasure maps', () => {
  it('matches the CSV distance ranges', () => {
    expect(mapDistanceRange('common')).toEqual([200, 800]);
    expect(mapDistanceRange('rare')).toEqual([800, 1500]);
    expect(mapDistanceRange('legendary')).toEqual([1500, 3000]);
  });
});
