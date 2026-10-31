import { rotationRules } from '@/content/rotation';

import { checkpointOf, dailyRotation, replayRotation, rotationFromCheckpoint, rotationDay, warmRotationUpTo } from './rotation';

const START = rotationDay(rotationRules.startDay);
const TODAY = START + 333;

describe('checkpointed rotation replays', () => {
  it('gives today\'s rotation identically to the full replay, for every day of the last 60 and spot days', () => {
    // The checkpoint every warm day must resume from: 60 days back, plus the start's edge cases.
    const checkpoint = checkpointOf(TODAY - 60);
    const days = [
      ...Array.from({ length: 61 }, (_, i) => TODAY - 60 + i),
      TODAY + 40,
      TODAY + 200,
    ];
    for (const day of days) {
      expect(rotationFromCheckpoint(day, checkpoint)).toEqual(replayRotation(day));
    }
  });

  it('hold at the very start too, where yesterday is nothing', () => {
    const start = checkpointOf(START);
    expect(start).toEqual({ day: START, yesterday: null, lastSeen: {} });
    expect(rotationFromCheckpoint(START + 5, start)).toEqual(replayRotation(START + 5));
    // A day before the start keeps its direct pick (unchanged behaviour).
    expect(dailyRotation(START - 3)).toEqual(replayRotation(START - 3));
  });

  it('resume from a one-day-old checkpoint exactly', () => {
    const checkpoint = checkpointOf(TODAY);
    expect(rotationFromCheckpoint(TODAY, checkpoint)).toEqual(replayRotation(TODAY));
    expect(rotationFromCheckpoint(TODAY + 1, checkpoint)).toEqual(replayRotation(TODAY + 1));
  });
});

describe('the sliced rotation warm-up', () => {
  it('leaves a partly warmed history cheap and exact for a screen that arrives early', () => {
    // A screen asking before the warm-up is done pays only the missing days,
    // and gets the same answer as the full replay.
    expect(warmRotationUpTo(START + 40, 15)).toBe(START + 14);
    expect(dailyRotation(START + 100)).toEqual(replayRotation(START + 100));
  });

  it('reaches the same rotation as the full replay, however it is sliced', () => {
    // The module history continues from the previous test; warmed 20 days at a time.
    let reached = -1;
    while (reached < TODAY) reached = warmRotationUpTo(TODAY, 20);
    expect(reached).toBe(TODAY);
    expect(dailyRotation(TODAY)).toEqual(replayRotation(TODAY));
    // And the days it passed on the way are exact too.
    expect(dailyRotation(START + 17)).toEqual(replayRotation(START + 17));
    expect(dailyRotation(TODAY - 1)).toEqual(replayRotation(TODAY - 1));
    // Later days still extend exactly.
    expect(dailyRotation(TODAY + 3)).toEqual(replayRotation(TODAY + 3));
  });
});
