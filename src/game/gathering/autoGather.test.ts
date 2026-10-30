import { gatheringConfig } from '@/content/gatheringConfig';
import { spawnConfig } from '@/content/spawnConfig';

import { offsetPosition } from '../generation/geo';
import type { AnimalSpawn, LatLng, Spawn, StaticSpawn } from '../generation/types';
import { lureSpawns } from '../rewards/lures';
import { createInitialSave, type SaveData } from '../save';
import {
  appendFixes,
  clearProcessed,
  emptyBuffer,
  markWalksSeen,
  playbackRoute,
  processWalkPath,
  recordWalk,
  shouldAutoStop,
  walkToShow,
  type WalkFix,
} from './autoGather';
import { collectSpawn, localDayKey } from './gathering';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const t0 = Date.UTC(2026, 9, 20, 12);
const HOUR = 3_600_000;
const auto = gatheringConfig.autoGather;

/** Past the tutorial with the wooden pickaxe, and the day's walking bonus spent (it has its own tests). */
const player = (tools = ['woodPickaxe']): SaveData => ({
  ...createInitialSave(),
  tools,
  tutorial: { ...createInitialSave().tutorial, step: 'done' },
  freshGathers: { day: localDayKey(t0), used: gatheringConfig.walkingBonus.gathers },
});

const at = (north: number, east: number) => offsetPosition(origin, north, east);

function fix(north: number, east: number, seconds: number, extra: Partial<WalkFix> = {}): WalkFix {
  return { position: at(north, east), accuracy: 5, timestamp: t0 + seconds * 1000, stepsCounted: false, ...extra };
}

function node(id: string, position: LatLng, extra: Partial<StaticSpawn> = {}): StaticSpawn {
  return { id, kind: 'wood', resourceId: 'tree', tile: 'abc', quantity: 2, boosted: false, expiresAt: t0 + HOUR, position, ...extra };
}

/** A fixed set of spawns, whatever the place; generation has its own tests. */
const only = (spawns: Spawn[]) => () => spawns;

/** 200 m east in 150 s (1.33 m/s): the fixes are far apart, nodes sit along the way. */
const eastWalk = [fix(0, 0, 0), fix(0, 200, 150)];

describe('processWalkPath', () => {
  it('collects a node near the segment between two far-apart fixes, not one 35 m away', () => {
    const near = node('wood:near', at(15, 100));
    const far = node('wood:far', at(35, 100));
    const { save, summary } = processWalkPath(player(), eastWalk, { spawnsAt: only([near, far]) });
    expect(Object.keys(save.collected)).toEqual(['wood:near']);
    expect(summary.nodes).toBe(1);
    expect(save.materials).toEqual({ wood: 2 });
  });

  it('collects in path order and never twice, even when the path comes back', () => {
    const first = node('wood:first', at(5, 50));
    const second = node('wood:second', at(5, 150));
    const there = [...eastWalk, fix(0, 0, 300)];
    const { save, summary } = processWalkPath(player(), there, { spawnsAt: only([second, first]) });
    expect(summary.nodes).toBe(2);
    expect(save.materials).toEqual({ wood: 4 });
    expect(Object.keys(save.collected)).toEqual(['wood:first', 'wood:second']);
  });

  it('collects a node again once it has respawned in a new window', () => {
    const windowMs = spawnConfig.kinds.wood.windowMinutes * 60_000;
    const window = (timeMs: number) => Math.floor(timeMs / windowMs);
    const respawning = (_: LatLng, timeMs: number) => [
      node(`wood:abc:${window(timeMs)}:0`, at(5, 100), { expiresAt: (window(timeMs) + 1) * windowMs }),
    ];
    const start = Math.ceil(t0 / windowMs) * windowMs - 100_000;
    const walks = [0, 1].map((i) => [
      { ...fix(0, 0, 0), timestamp: start + i * windowMs - 75_000 },
      { ...fix(0, 200, 0), timestamp: start + i * windowMs + 75_000 },
    ]);
    const { summary } = processWalkPath(player(), walks.flat(), { spawnsAt: respawning, config: { ...gatheringConfig, autoGather: { ...auto, maxSegmentSeconds: windowMs } } });
    expect(summary.nodes).toBe(2);
  });

  it('uses the fixes’ times to decide which nodes existed, whenever it runs', () => {
    const gone = node('wood:gone', at(5, 100), { expiresAt: t0 + 30_000 });
    const later = node('wood:later', at(5, 100), { expiresAt: t0 + 5 * 60_000 });
    const { save } = processWalkPath(player(), eastWalk, { spawnsAt: only([gone, later]) });
    // Passed at ~75 s: the first node had gone by then, the second still stood (though both are gone now).
    expect(Object.keys(save.collected)).toEqual(['wood:later']);
  });

  it('gives the same result on the real world spawns, run after run', () => {
    const route = playbackRoute(origin, t0, { minutes: 20 });
    const first = processWalkPath(player(), route);
    const again = processWalkPath(player(), route);
    expect(first.summary.nodes).toBeGreaterThan(0);
    expect(again.save.collected).toEqual(first.save.collected);
    expect(again.save.materials).toEqual(first.save.materials);
  });

  it('ignores inaccurate fixes, segments faster than a run, jumps and gaps', () => {
    const fixes = [
      fix(0, 0, 0),
      fix(0, 50, 30, { accuracy: 40 }),
      fix(0, 60, 45),
      fix(0, 160, 55), // 100 m in 10 s: a bike or a car
      fix(0, 560, 200), // 400 m: a GPS jump
      fix(0, 580, 1000), // 10 minutes later: a new path
      fix(0, 600, 1015),
    ];
    const along = [node('wood:slow', at(5, 30)), node('wood:fast', at(5, 110)), node('wood:jump', at(5, 300))];
    const { summary, save } = processWalkPath(player(), fixes, { spawnsAt: only(along) });
    expect(summary.ignored).toEqual({ accuracy: 1, speed: 1, jump: 1, gap: 1 });
    expect(Object.keys(save.collected)).toEqual(['wood:slow']);
    expect(summary.distanceMeters).toBe(80);
  });

  it('applies the pickaxe rules', () => {
    const stone = node('ore:abc:1:0', at(5, 100), { kind: 'ore', resourceId: 'stone' });
    expect(processWalkPath(player([]), eastWalk, { spawnsAt: only([stone]) }).summary.nodes).toBe(0);
    expect(processWalkPath(player(), eastWalk, { spawnsAt: only([stone]) }).save.materials).toEqual({ stone: 2 });
  });

  it('collects the lure’s spawns', () => {
    const lure = { id: 'lure1', activatedAt: t0 - 60_000, center: origin };
    const herb = lureSpawns(lure, t0).find((s): s is StaticSpawn => s.kind === 'herb')!;
    const walk = [
      { ...fix(0, 0, 0), position: offsetPosition(herb.position, 0, -60) },
      { ...fix(0, 0, 60), position: offsetPosition(herb.position, 0, 60) },
    ];
    const save = { ...player(), activeLure: lure };
    expect(herb.id in processWalkPath(save, walk).save.collected).toBe(true);
  });

  it('catches a moving animal at its position at the time', () => {
    const deer: AnimalSpawn = {
      id: 'animal:abc:1:0',
      kind: 'animal',
      resourceId: 'deer',
      tile: 'abc',
      quantity: 1,
      boosted: false,
      expiresAt: t0 + HOUR,
      path: { waypoints: [at(10, 100)], loopMs: 60_000, phaseMs: 0 },
    };
    expect(processWalkPath(player(), eastWalk, { spawnsAt: only([deer]) }).summary.nodes).toBe(1);
  });

  it('yields exactly what a manual gather of the same node does, walking bonus included', () => {
    const tree = node('wood:abc:1:0', at(5, 100));
    const fresh = { ...player(), freshGathers: { day: '', used: 0 } };
    const manual = collectSpawn(fresh, tree, { position: at(0, 100), speed: 1.4 }, t0 + 75_000);
    if (!manual.ok) throw new Error(manual.reason);
    const { save, summary } = processWalkPath(fresh, eastWalk, { spawnsAt: only([tree]) });
    expect(save.materials).toEqual(manual.save.materials);
    expect(summary.gained).toEqual(manual.gained);
    expect(save.freshGathers).toEqual(manual.save.freshGathers);
  });

  it('estimates steps from distance only where the pedometer wasn’t counting', () => {
    const background = processWalkPath(player(), eastWalk, { spawnsAt: only([]), estimateSteps: true });
    expect(background.summary).toMatchObject({ steps: Math.round(200 / auto.strideMeters), stepsEstimated: true });
    expect(background.save.steps).toEqual({ day: localDayKey(t0 + 150_000), count: Math.round(200 / auto.strideMeters) });

    // The app's pedometer counted these: no estimate on top.
    const counted = eastWalk.map((f) => ({ ...f, stepsCounted: true }));
    const measured = processWalkPath(player(), counted, { spawnsAt: only([]), estimateSteps: true });
    expect(measured.summary.steps).toBe(0);
    expect(measured.save.steps).toEqual(player().steps);
  });

  it('shows measured steps where the pedometer keeps history, without adding an estimate', () => {
    const { save, summary } = processWalkPath(player(), eastWalk, { spawnsAt: only([]), measuredSteps: 310 });
    expect(summary).toMatchObject({ steps: 310, stepsEstimated: false });
    expect(save.steps).toEqual(player().steps);
  });

  it('does not gather twice when the same fixes come again, and joins the next batch up', () => {
    const tree = node('wood:a', at(5, 100));
    const first = processWalkPath(player(), eastWalk, { spawnsAt: only([tree]) });
    const again = processWalkPath(first.save, eastWalk, { spawnsAt: only([node('wood:b', at(5, 100))]) });
    expect(again.summary).toMatchObject({ nodes: 0, distanceMeters: 0, ignored: { stale: 2 } });
    expect(again.save.materials).toEqual(first.save.materials);

    const next = processWalkPath(first.save, [fix(0, 300, 225)], { spawnsAt: only([node('wood:c', at(5, 250))]) });
    expect(next.summary).toMatchObject({ nodes: 1, distanceMeters: 100 });
  });

  it('summarises the walk', () => {
    const { summary } = processWalkPath(player(), eastWalk, { spawnsAt: only([node('wood:a', at(5, 100))]), autoStopped: true });
    expect(summary).toEqual({
      startedAt: t0,
      endedAt: t0 + 150_000,
      distanceMeters: 200,
      nodes: 1,
      gained: [{ materialId: 'wood', amount: 2 }],
      steps: 0,
      stepsEstimated: false,
      ignored: {},
      autoStopped: true,
    });
  });
});

describe('walk history', () => {
  const summary = processWalkPath(player(), eastWalk, { spawnsAt: only([node('wood:a', at(5, 100))]) }).summary;

  it('keeps the newest walks and shows the latest unseen one that gathered something', () => {
    let save = player();
    for (let i = 0; i < auto.historySize + 2; i++) save = recordWalk(save, { ...summary, startedAt: i });
    expect(save.autoGather.history).toHaveLength(auto.historySize);
    expect(save.autoGather.history[0].startedAt).toBe(auto.historySize + 1);
    expect(walkToShow(save)?.startedAt).toBe(auto.historySize + 1);
    expect(walkToShow(markWalksSeen(save))).toBeNull();
    expect(walkToShow(recordWalk(save, { ...summary, nodes: 0, gained: [] }))).toBeNull();
  });

  it('skips walks that went nowhere', () => {
    expect(recordWalk(player(), { ...summary, distanceMeters: 0 }).autoGather.history).toEqual([]);
  });
});

describe('walk buffer', () => {
  it('skips fixes while standing still and remembers the last movement', () => {
    const buffer = appendFixes(emptyBuffer(t0), [fix(0, 0, 0), fix(0, 3, 15), fix(0, 20, 30)], t0 + 30_000);
    expect(buffer.fixes).toHaveLength(2);
    expect(buffer.lastMovedAt).toBe(t0 + 30_000);
    expect(shouldAutoStop(buffer, t0 + 30_000 + 29 * 60_000, 30)).toBe(false);
    expect(shouldAutoStop(buffer, t0 + 30_000 + 30 * 60_000, 30)).toBe(true);
  });

  it('still measures movement from the last fix once processed fixes are cleared', () => {
    const walked = appendFixes(emptyBuffer(t0), [fix(0, 0, 0), fix(0, 20, 15)], t0 + 15_000);
    const cleared = clearProcessed(walked, t0 + 15_000);
    const standing = appendFixes(cleared, [fix(0, 23, 30), fix(0, 18, 45)], t0 + 45_000);
    expect(standing.fixes).toEqual([]);
    expect(standing.lastMovedAt).toBe(t0 + 15_000);
  });

  it('does not take inaccurate fixes for movement', () => {
    const drift = appendFixes(emptyBuffer(t0), [fix(0, 0, 0), fix(0, 60, 15, { accuracy: 80 }), fix(0, 5, 30)], t0 + 30_000);
    expect(drift.fixes).toHaveLength(2);
    expect(drift.lastMovedAt).toBe(t0);
  });

  it('is capped by size and age', () => {
    const route = Array.from({ length: auto.bufferMaxFixes + 50 }, (_, i) => fix(0, i * 15, i * 10));
    const now = t0 + route.length * 10_000;
    expect(appendFixes(emptyBuffer(t0), route, now).fixes).toHaveLength(auto.bufferMaxFixes);
    const old = appendFixes(emptyBuffer(t0), [fix(0, 0, 0), fix(0, 50, 60)], t0 + auto.bufferHours * HOUR + 30_000);
    expect(old.fixes).toHaveLength(1);
  });

  it('is cleared of what was processed', () => {
    const buffer = appendFixes(emptyBuffer(t0), [...eastWalk, fix(0, 300, 225)], t0);
    const { save } = processWalkPath(player(), buffer.fixes.slice(0, 2), { spawnsAt: only([]) });
    expect(clearProcessed(buffer, save.autoGather.processedUntil).fixes).toEqual([fix(0, 300, 225)]);
  });
});
