import { gathererRules } from '@/content/jobs';

import { gathererPace } from './gathererPace';

// The gatherer's measured pace stays inside the rules' limit, moving or still.

const pace = gathererPace();
const cap = 60 / gathererRules.minMinutesPerNode + 1e-9;

describe('gathererPace', () => {
  it('gathers at most one node per minMinutesPerNode while still', () => {
    expect(pace.stillPerHour).toBeGreaterThan(0);
    expect(pace.stillPerHour).toBeLessThanOrEqual(cap);
  });

  it('gathers at most one node per minMinutesPerNode while walking', () => {
    expect(pace.walkingPerHour).toBeGreaterThan(0);
    expect(pace.walkingPerHour).toBeLessThanOrEqual(cap);
  });
});
