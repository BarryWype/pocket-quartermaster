import { dungeons } from '@/content/dungeons';
import { rotationRules } from '@/content/rotation';

import { dailyRotation, rotationDay } from '../game/dungeons/rotation';

const START = rotationDay(rotationRules.startDay);
// A fixed "today" late in the year the rules start, so the day count is stable.
const TODAY = rotationDay(Date.UTC(2026, 10, 30));

/**
 * The timing test for issue 17's rotation suspect: what one cold replay of the
 * daily rotation costs — every day since `startDay`, five tiers, three
 * briefings per tier. The numbers are logged, not asserted; run before and
 * after a change and compare. The cold path is the same before and after the
 * fix (a full replay); what the fix changes is that a screen's first render no
 * longer pays it (see rotation.ts).
 */
describe('rotation timings (logged, not asserted)', () => {
  it('measures the cold replay and the warm re-read', () => {
    expect(TODAY - START).toBeGreaterThan(300);
    // A copy of the dungeon list skips the kept history: the same work a cold
    // call pays, however often the test file has run before.
    const cold = Date.now();
    const rotation = dailyRotation(TODAY, [...dungeons]);
    const coldMs = Date.now() - cold;
    console.log(`[rotationPerf] cold replay of ${TODAY - START} days: ${coldMs}ms`);

    const warm = Date.now();
    const again = dailyRotation(TODAY, [...dungeons]);
    const warmMs = Date.now() - warm;
    console.log(`[rotationPerf] replay again (no kept history): ${warmMs}ms`);

    expect(rotation.day).toBe(TODAY);
    expect(again).toEqual(rotation);
    expect(coldMs).toBeGreaterThan(0);
  });
});
