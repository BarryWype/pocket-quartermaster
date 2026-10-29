import { gatheringConfig } from '@/content/gatheringConfig';
import { patrolRules } from '@/content/patrols';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters, offsetPosition } from '../generation/geo';
import type { LatLng, Spawn, StaticSpawn } from '../generation/types';
import { backgroundStep, snapshotBackground, type BackgroundAlert, type PatrolSettings } from '../patrols/escort';
import { patrolPositionAt } from '../patrols/generate';
import { findSpawn, HOME, tierTeam } from '../patrols/testHelpers';
import { createInitialSave, type SaveData } from '../save';
import type { WalkEffect } from '../types';
import { pruneExpired } from '../upkeep';
import { processWalkPath, type WalkFix } from './autoGather';
import { collectSpawn, localDayKey } from './gathering';
import {
  activeWalkEffects,
  animalSpawns,
  endWalkEffect,
  patrolRulesAt,
  replacesActive,
  startWalkEffect,
  trackedRange,
  walkEffectAt,
  walkEffectSpawns,
  walkKind,
} from './walkEffects';

const origin: LatLng = HOME;
const t0 = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const HOUR = 3_600_000;

/** Past the tutorial with the wooden pickaxe, and the day's walking bonus spent (it has its own tests). */
const player = (walkEffects: WalkEffect[] = []): SaveData => ({
  ...createInitialSave(),
  tools: ['woodPickaxe'],
  tutorial: { step: 'done', woodSpot: null },
  freshGathers: { day: localDayKey(t0), used: gatheringConfig.walkingBonus.gathers },
  walkEffects,
});

const stocked = (consumables: Record<string, number>): SaveData => ({ ...createInitialSave(), consumables: { ...consumables } });

const at = (north: number, east: number) => offsetPosition(origin, north, east);

function fix(north: number, east: number, seconds: number): WalkFix {
  return { position: at(north, east), accuracy: 5, timestamp: t0 + seconds * 1000, stepsCounted: false };
}

function node(id: string, position: LatLng, extra: Partial<StaticSpawn> = {}): StaticSpawn {
  return { id, kind: 'wood', resourceId: 'tree', tile: 'abc', quantity: 2, boosted: false, expiresAt: t0 + HOUR, position, ...extra };
}

const only = (spawns: Spawn[]) => () => spawns;

/** Three 200 m walks along the same line, before, inside and after a window starting 10 minutes in. */
const window = { start: t0 + 10 * MIN, end: t0 + 40 * MIN };
const walksAroundWindow = [0, 11 * 60, 45 * 60].map((seconds) => [fix(0, 0, seconds), fix(0, 200, seconds + 150)]);

const effect = (itemId: string, startedAt: number, endsAt: number): WalkEffect => ({
  id: 'walk1',
  itemId,
  startedAt,
  endsAt,
  center: origin,
});

describe('using a walking consumable', () => {
  it('takes one from the stock and runs for its configured minutes', () => {
    const save = startWalkEffect(stocked({ foragersTonic: 1 }), 'foragersTonic', origin, t0);
    expect(save.consumables.foragersTonic).toBe(0);
    expect(save.nextUid).toBe(2);
    expect(save.walkEffects).toEqual([{ id: 'walk1', itemId: 'foragersTonic', startedAt: t0, endsAt: t0 + 30 * MIN, center: origin }]);
    expect(activeWalkEffects(save, t0 + 29 * MIN)).toEqual(save.walkEffects);
    expect(activeWalkEffects(save, t0 + 30 * MIN)).toEqual([]);
  });

  it('lasts 15 minutes for the musk, 30 for the others', () => {
    const minutes: Record<string, number> = { foragersTonic: 30, huntersMusk: 15, prospectorsDraught: 30, trackersEye: 30 };
    for (const [itemId, mins] of Object.entries(minutes)) {
      const kind = walkKind(itemId)!;
      const save = startWalkEffect(stocked({ [itemId]: 1 }), itemId, origin, t0);
      expect(walkEffectAt(save.walkEffects, kind, t0 + mins * MIN - 1)?.itemId).toBe(itemId);
      expect(walkEffectAt(save.walkEffects, kind, t0 + mins * MIN)).toBeNull();
    }
  });

  it('restarts the same item from now, one entry only; different items coexist', () => {
    let save = startWalkEffect(stocked({ foragersTonic: 2, trackersEye: 1 }), 'foragersTonic', origin, t0);
    expect(replacesActive(save, 'foragersTonic', t0 + 5 * MIN)).toBe(true);
    save = startWalkEffect(save, 'foragersTonic', origin, t0 + 10 * MIN);
    expect(save.consumables.foragersTonic).toBe(0);
    expect(save.walkEffects).toHaveLength(1);
    expect(save.walkEffects[0]).toMatchObject({ id: 'walk2', startedAt: t0 + 10 * MIN, endsAt: t0 + 40 * MIN });

    save = startWalkEffect(save, 'trackersEye', origin, t0 + 10 * MIN);
    expect(save.walkEffects).toHaveLength(2);
    expect(activeWalkEffects(save, t0 + 11 * MIN)).toHaveLength(2);
  });

  it('refuses a non-walk item and an empty stock', () => {
    expect(() => startWalkEffect(stocked({ jerky: 1 }), 'jerky', origin, t0)).toThrow();
    expect(() => startWalkEffect(stocked({ foragersTonic: 0 }), 'foragersTonic', origin, t0)).toThrow();
  });

  it('ends an effect at once when asked (debug)', () => {
    const save = endWalkEffect(startWalkEffect(stocked({ trackersEye: 1 }), 'trackersEye', origin, t0), 'trackersEye', t0 + MIN);
    expect(activeWalkEffects(save, t0 + MIN)).toEqual([]);
  });
});

describe('forage', () => {
  it('reaches 10 m further only for fixes inside its window', () => {
    const far = node('wood:far', at(25, 100));
    const { save, summary } = processWalkPath(player([effect('foragersTonic', window.start, window.end)]), walksAroundWindow.flat(), {
      spawnsAt: only([far]),
    });
    expect(Object.keys(save.collected)).toEqual(['wood:far']);
    expect(summary.gained).toEqual([{ materialId: 'wood', amount: 2 }]);
  });
});

describe('prospect', () => {
  const draught = () => effect('prospectorsDraught', window.start, window.end);
  const ore = (id: string) => node(id, at(5, 100), { kind: 'ore', resourceId: 'stone' });

  it('gives one more per ore node only inside its window, auto-gathered like tapped', () => {
    const walks = [0, 11 * 60, 45 * 60].map((seconds) => [fix(0, 0, seconds), fix(0, 200, seconds + 150)]);
    const amounts = walks.map((walk, i) =>
      processWalkPath(player([draught()]), walk, { spawnsAt: only([ore(`ore:${i}`)]) }).save.materials.stone,
    );
    expect(amounts).toEqual([2, 3, 2]);
  });

  it('gives one more on a tap too, after the walking bonus', () => {
    const before = collectSpawn(player([draught()]), ore('ore:before'), { position: at(0, 100), speed: 1.4 }, window.start - MIN);
    const inside = collectSpawn(player([draught()]), ore('ore:inside'), { position: at(0, 100), speed: 1.4 }, t0 + 20 * MIN);
    if (!before.ok || !inside.ok) throw new Error([before, inside].map((r) => !r.ok && r.reason).join());
    expect(before.gained).toEqual([{ materialId: 'stone', amount: 2 }]);
    expect(inside.gained).toEqual([{ materialId: 'stone', amount: 3 }]);

    const fresh = { ...player([draught()]), freshGathers: { day: localDayKey(t0), used: 0 } };
    const boosted = collectSpawn(fresh, ore('ore:fresh'), { position: at(0, 100), speed: 1.4 }, t0 + 20 * MIN);
    if (!boosted.ok) throw new Error(boosted.reason);
    expect(boosted.gained).toEqual([{ materialId: 'stone', amount: 4 }]);
  });
});

describe('musk', () => {
  const musk = () => effect('huntersMusk', window.start, t0 + 25 * MIN);
  const rules = gatheringConfig.walkEffects.musk;

  it('draws animals around its centre only while it runs, the same each time', () => {
    const inside = walkEffectSpawns([musk()], t0 + 11 * MIN);
    expect(inside).toHaveLength(rules.animals);
    inside.forEach((spawn) => {
      expect(spawn.tile).toBe('walk1');
      expect(spawn.expiresAt).toBe(musk().endsAt);
      expect(distanceMeters(origin, spawn.path.waypoints[0])).toBeLessThanOrEqual(rules.radiusMeters + 41);
    });
    expect(walkEffectSpawns([musk()], window.start - MIN)).toEqual([]);
    expect(walkEffectSpawns([musk()], t0 + 25 * MIN)).toEqual([]);
    expect(walkEffectSpawns([musk()], t0 + 12 * MIN)).toEqual(inside);
  });

  it('starts the animals at the moment it was used, so a walk processed later still gathers them', () => {
    const musk = () => effect('huntersMusk', window.start, t0 + 25 * MIN);
    const fromMusk = (_point: LatLng, timeMs: number) => walkEffectSpawns([musk()], timeMs);
    const animal = walkEffectSpawns([musk()], t0 + 11 * MIN)[0];
    const spot = spawnPositionAt(animal, t0 + 11 * MIN);
    const through = (seconds: number) => [
      { position: offsetPosition(spot, 0, -60), accuracy: 5, timestamp: t0 + seconds * 1000, stepsCounted: false },
      { position: offsetPosition(spot, 0, 60), accuracy: 5, timestamp: t0 + seconds * 1000 + 60_000, stepsCounted: false },
    ];
    const inside = processWalkPath(player([musk()]), through(11 * 60), { spawnsAt: fromMusk });
    expect(animal.id in inside.save.collected).toBe(true);
    const before = processWalkPath(player([musk()]), through(0), { spawnsAt: fromMusk });
    expect(Object.keys(before.save.collected)).toEqual([]);
  });
});

describe('animalSpawns (shared with the lure)', () => {
  it('is fixed by its seed and start', () => {
    const args = { id: 'lure1', center: origin, start: t0, end: t0 + 30 * MIN, count: 2, radius: 100, seed: 'lure1' };
    expect(animalSpawns(args)).toEqual(animalSpawns({ ...args, seed: 'lure1' }));
    expect(animalSpawns(args)).not.toEqual(animalSpawns({ ...args, start: t0 + MIN }));
  });
});

describe('track', () => {
  const eye = () => effect('trackersEye', window.start, window.end);

  it('doubles patrol visibility only inside its window', () => {
    expect(patrolRulesAt(patrolRules, [eye()], t0 + 20 * MIN).visibleMeters).toBe(patrolRules.visibleMeters * 2);
    expect(patrolRulesAt(patrolRules, [eye()], window.start - MIN)).toBe(patrolRules);
    expect(patrolRulesAt(patrolRules, [eye()], window.end)).toBe(patrolRules);
  });

  it('lets the background see and alert on a patrol from twice as far, fix by fix', () => {
    const { spawn: goblins, at: patrolAt } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll === 'current');
    const settings: PatrolSettings = { escortHeroId: null, alertFor: 'all', patrolAlerts: true, escortAlerts: false };
    const save = (effect: WalkEffect | null) => ({ ...tierTeam(), walkEffects: effect ? [effect] : [] });
    const spotted = (alerts: ReturnType<typeof backgroundStep>['alerts']) =>
      alerts.filter((a): a is Extract<BackgroundAlert, { kind: 'patrolSpotted' }> => a.kind === 'patrolSpotted');
    // 495 m off to the south-east: past the usual 300 m sight, inside the doubled one (and so is everything else here).
    const off = (time: number) => ({ position: offsetPosition(patrolPositionAt(goblins, time), -350, 350), timestamp: time });

    const withTrack = backgroundStep(
      snapshotBackground(save({ ...eye(), startedAt: patrolAt - MIN, endsAt: patrolAt + 10 * MIN }), settings, patrolAt - MIN),
      [off(patrolAt)],
      patrolAt,
    );
    expect(withTrack.state.firstSeen[goblins.id]).toBe(patrolAt);
    const alerts = spotted(withTrack.alerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].distance).toBeGreaterThan(patrolRules.visibleMeters);

    // The window ended a minute before the fix: back to the usual range.
    const ended = backgroundStep(
      snapshotBackground(save({ ...eye(), startedAt: patrolAt - 10 * MIN, endsAt: patrolAt - MIN }), settings, patrolAt - MIN),
      [off(patrolAt)],
      patrolAt,
    );
    expect(ended.state.firstSeen[goblins.id]).toBeUndefined();
    expect(spotted(ended.alerts)).toEqual([]);

    const without = backgroundStep(snapshotBackground(save(null), settings, patrolAt - MIN), [off(patrolAt)], patrolAt);
    expect(without.state.firstSeen[goblins.id]).toBeUndefined();
    expect(spotted(without.alerts)).toEqual([]);

    // Within one walk, the rules are picked fix by fix: unseen just before the window, seen at the fix inside it.
    const midWalk = backgroundStep(
      snapshotBackground(save({ ...eye(), startedAt: patrolAt - MIN, endsAt: patrolAt + 10 * MIN }), settings, patrolAt - 2 * MIN),
      [off(patrolAt - 2 * MIN), off(patrolAt)],
      patrolAt,
    );
    expect(midWalk.state.firstSeen[goblins.id]).toBe(patrolAt);
  });

  it('doubles only rare ore, by unlocked tier', () => {
    const ore = (resourceId: string): Spawn => ({
      id: `ore:${resourceId}`,
      kind: 'ore',
      resourceId,
      tile: 'abc',
      quantity: 1,
      boosted: false,
      expiresAt: t0 + HOUR,
      position: origin,
    });
    const tree: Spawn = {
      id: 'wood:tree',
      kind: 'wood',
      resourceId: 'tree',
      tile: 'abc',
      quantity: 1,
      boosted: false,
      expiresAt: t0 + HOUR,
      position: origin,
    };

    // Fresh save: only tier 1 unlocked, so every ore is rare.
    const fresh = trackedRange({ ...player(), walkEffects: [eye()] }, t0 + 20 * MIN);
    expect(['stone', 'copper', 'iron', 'coal'].map((id) => fresh(ore(id)))).toEqual([2, 2, 2, 2]);
    expect(fresh(tree)).toBe(1);
    // Without the effect nothing is widened.
    expect(trackedRange(player(), t0)(ore('coal'))).toBe(1);

    // Tier 3 unlocked (the tier-2 boss cleared): copper and up are rare.
    const tier3 = trackedRange({ ...player([eye()]), clearedDungeons: ['ogreQuarry'] }, t0 + 20 * MIN);
    expect(['stone', 'copper', 'iron', 'coal'].map((id) => tier3(ore(id)))).toEqual([1, 2, 2, 2]);
  });
});

describe('pruning', () => {
  it('keeps an ended effect until the walk processing passes its end, then drops it', () => {
    const tonic = effect('foragersTonic', t0, t0 + 30 * MIN);
    const save = { ...player([tonic]), autoGather: { processedUntil: t0 + 10 * MIN, anchor: null, history: [] } };
    const buffer = gatheringConfig.autoGather.bufferHours * HOUR;

    expect(pruneExpired(save, t0 + 20 * MIN).walkEffects).toEqual([tonic]); // still running
    expect(pruneExpired(save, t0 + 31 * MIN).walkEffects).toEqual([tonic]); // ended, not processed past yet
    const processed = { ...save, autoGather: { ...save.autoGather, processedUntil: t0 + 30 * MIN } };
    expect(pruneExpired(processed, t0 + 31 * MIN).walkEffects).toEqual([]);
    // Or once the buffer has passed, processed or not.
    expect(pruneExpired(save, t0 + 30 * MIN + buffer).walkEffects).toEqual([tonic]);
    expect(pruneExpired(save, t0 + 30 * MIN + buffer + 1).walkEffects).toEqual([]);
  });
});
