import { processWalkPath, playbackRoute, type WalkFix } from '../gathering/autoGather';
import { localDayKey } from '../gathering/gathering';
import { stepsRecorded } from '../rewards/chests';
import { questEvent, refreshWalks } from '../quests/progress';
import type { Quest } from '../quests/types';
import { createInitialSave, type SaveData } from '../save';
import { HOME } from './testHelpers';
import { snapshotPocketCounts, stepPocketCounts, type PocketCounts } from './pocketCounts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Local noon, so a 30-minute walk never rolls the day over. */
const noon = (day: number) => new Date(2026, 9, day, 12).getTime();

const quest = (over: Partial<Quest>): Quest => ({
  id: 'q',
  objective: 'walk',
  band: 'short',
  arrivedAt: 0,
  expiresAt: noon(20) + 2 * DAY,
  acceptedAt: 0,
  amount: 1,
  progress: 0,
  target: null,
  doneAt: null,
  seen: true,
  ...over,
});

const withQuests = (save: SaveData, quests: Quest[]): SaveData => ({
  ...save,
  quests: { ...save.quests, list: [...save.quests.list, ...quests] },
});

/** The route in n nearly equal batches, fed one by one. */
const batches = (fixes: WalkFix[], n: number): WalkFix[][] => {
  const size = Math.ceil(fixes.length / n);
  return Array.from({ length: n }, (_, i) => fixes.slice(i * size, (i + 1) * size)).filter((b) => b.length > 0);
};

describe('pocket counts', () => {
  it('matches the app for a walk quest that completes', () => {
    const endAt = noon(20);
    const route = playbackRoute(HOME, endAt);
    const save = withQuests(createInitialSave(), [quest({ id: 'w', amount: 2000, stepsAtAccept: 0 })]);
    const prediction = snapshotPocketCounts(save, endAt - 30 * 60_000);
    let alerts: ReturnType<typeof stepPocketCounts>['alerts'] = [];
    let counts = prediction;
    for (const batch of batches(route, 3)) {
      const step = stepPocketCounts(counts, batch, [], endAt);
      counts = step.counts;
      alerts = [...alerts, ...step.alerts];
    }
    // The route crosses the 2000-step chest too, like the app.
    expect(alerts).toEqual([
      { kind: 'chestReady', chestId: 'steps2000', steps: 2000 },
      { kind: 'questReady', questId: 'w', objective: 'walk' },
    ]);

    const app = refreshWalks(processWalkPath(save, route, { estimateSteps: true, spawnsAt: () => [] }).save, endAt);
    expect(app.quests.list.find((q) => q.id === 'w')!.doneAt).not.toBeNull();
    expect(counts.stepsAtHandOff + Math.round(counts.metersByDay[prediction.day]! / 0.75)).toBe(
      stepsRecorded(app, localDayKey(endAt)),
    );
  });

  it('stays quiet for a walk that falls short, like the app', () => {
    const endAt = noon(20);
    const route = playbackRoute(HOME, endAt);
    const save = withQuests(createInitialSave(), [quest({ id: 'w', amount: 3000, stepsAtAccept: 0 })]);
    let counts = snapshotPocketCounts(save, endAt - 30 * 60_000);
    let alerts: ReturnType<typeof stepPocketCounts>['alerts'] = [];
    for (const batch of batches(route, 3)) {
      const step = stepPocketCounts(counts, batch, [], endAt);
      counts = step.counts;
      alerts = [...alerts, ...step.alerts];
    }
    // No quest alert, but the chest still opens.
    expect(alerts).toEqual([{ kind: 'chestReady', chestId: 'steps2000', steps: 2000 }]);
    const app = refreshWalks(processWalkPath(save, route, { estimateSteps: true, spawnsAt: () => [] }).save, endAt);
    expect(app.quests.list.find((q) => q.id === 'w')!.doneAt).toBeNull();
  });

  it('alerts once for a step chest the walk opens, never for an opened one', () => {
    const endAt = noon(20);
    const day = localDayKey(endAt);
    const near = { ...createInitialSave(), steps: { day, count: 1900 }, stepsTotal: 1900 };
    let counts = snapshotPocketCounts(near, endAt);
    const first = stepPocketCounts(counts, playbackRoute(HOME, endAt, { minutes: 10 }), [], endAt);
    expect(first.alerts).toEqual([{ kind: 'chestReady', chestId: 'steps2000', steps: 2000 }]);
    const second = stepPocketCounts(first.counts, playbackRoute(HOME, endAt + 10 * 60_000, { minutes: 10 }), [], endAt + 10 * 60_000);
    expect(second.alerts).toEqual([]);

    const opened = { ...near, chests: { day, opened: ['steps2000'] } };
    expect(stepPocketCounts(snapshotPocketCounts(opened, endAt), playbackRoute(HOME, endAt, { minutes: 10 }), [], endAt).alerts).toEqual([]);
  });

  it('counts escort wins for a patrol quest, none once it lapses', () => {
    const endAt = noon(20);
    const save = withQuests(createInitialSave(), [quest({ id: 'p', objective: 'patrols', amount: 2 })]);
    const counts = snapshotPocketCounts(save, endAt);
    const win1 = endAt + 60_000;
    const win2 = endAt + 2 * 60_000;
    expect(stepPocketCounts(counts, [], [win1], endAt).alerts).toEqual([]);
    const done = stepPocketCounts(counts, [], [win1, win2], endAt);
    expect(done.alerts).toEqual([{ kind: 'questReady', questId: 'p', objective: 'patrols' }]);

    const lapsing = withQuests(createInitialSave(), [
      quest({ id: 'p', objective: 'patrols', amount: 1, expiresAt: endAt + HOUR }),
    ]);
    expect(
      stepPocketCounts(snapshotPocketCounts(lapsing, endAt), [], [endAt + HOUR + 60_000], endAt + HOUR + 60_000).alerts,
    ).toEqual([]);

    let app = save;
    app = questEvent(app, { kind: 'patrolWon' }, win1);
    app = questEvent(app, { kind: 'patrolWon' }, win2);
    expect(app.quests.list.find((q) => q.id === 'p')!.doneAt).not.toBeNull();
  });

  it('adds no steps for fixes the pedometer counted or that were too inaccurate', () => {
    const endAt = noon(20);
    for (const route of [
      playbackRoute(HOME, endAt, { stepsCounted: true }),
      playbackRoute(HOME, endAt).map((fix) => ({ ...fix, accuracy: 50 })),
    ]) {
      const save = withQuests(createInitialSave(), [quest({ id: 'w', amount: 100, stepsAtAccept: 0 })]);
      const { counts, alerts } = stepPocketCounts(snapshotPocketCounts(save, endAt - 30 * 60_000), route, [], endAt);
      expect(alerts).toEqual([]);
      expect(Object.values(counts.metersByDay)).toEqual([]);
      const app = processWalkPath(save, route, { estimateSteps: true, spawnsAt: () => [] }).save;
      expect(stepsRecorded(app, localDayKey(endAt))).toBe(0);
    }
  });

  it('resets the chest figures when the day rolls over', () => {
    const endAt = noon(20);
    const save = { ...createInitialSave(), steps: { day: localDayKey(endAt), count: 2500 }, stepsTotal: 2500 };
    const counts = snapshotPocketCounts(save, endAt);
    const { counts: today } = stepPocketCounts(counts, [], [], endAt);
    const { counts: tomorrow } = stepPocketCounts(today, [], [], noon(21));
    expect(tomorrow.day).toBe(localDayKey(noon(21)));
    expect(tomorrow.stepsAtHandOff).toBe(0);
    expect(tomorrow.chestsOpened).toEqual([]);
    expect(tomorrow.chestsAlerted).toEqual([]);
  });

  it('carries alerted lists over from the previous snapshot, only what still applies', () => {
    const endAt = noon(20);
    const day = localDayKey(endAt);
    const save = withQuests(createInitialSave(), [
      quest({ id: 'live', objective: 'patrols', amount: 2 }),
      quest({ id: 'done', objective: 'patrols', amount: 1, doneAt: endAt - 60_000 }),
    ]);
    const previous: PocketCounts = {
      day,
      stepsAtHandOff: 0,
      metersByDay: {},
      processedUntil: 0,
      anchor: null,
      chestsOpened: [],
      chestsAlerted: ['steps2000'],
      quests: [],
      questsAlerted: ['live', 'done'],
    };
    const counts = snapshotPocketCounts(save, endAt, previous);
    expect(counts.chestsAlerted).toEqual(['steps2000']);
    expect(counts.questsAlerted).toEqual(['live']);
    const otherDay = snapshotPocketCounts(save, endAt, { ...previous, day: '2000-01-01' });
    expect(otherDay.chestsAlerted).toEqual([]);
  });
});
