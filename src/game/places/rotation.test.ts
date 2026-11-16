import { placeGroups, placeRules } from '@/content/places';

import { localDayIndex, localDayStart } from '../generation/localDays';
import { tilesAround } from '../generation/tiles';
import { generateTilePlaces, type PlaceSpawn } from './generate';

const HOUR_MS = 3_600_000;
const wellington = { latitude: -41.2865, longitude: 174.7762 };
const fightGroup = placeGroups.find((g) => g.id === 'fightEvents')!;
const rotatingGroups = placeGroups.filter((g) => g.id !== 'fightEvents');
const tiles = tilesAround(wellington, 5);

// A year, sampled every 3 h (an hour stride is the ideal; this one keeps the test quick).
const START = Date.UTC(2026, 2, 1);
const END = Date.UTC(2027, 2, 1);
const SAMPLE_MS = 3 * HOUR_MS;

// A phase holds a third of the places; the bands leave room for the seeded split.
const THIRD_MIN = 0.28;
const THIRD_MAX = 0.38;
// One phase of three is replaced at a change hour.
const CHANGE_SHARE_MAX = 0.40;

const liveAt = (spawns: PlaceSpawn[], t: number) => spawns.filter((s) => s.startsAt <= t && t < s.expiresAt);

const daysOf = new Map(rotatingGroups.map((group) => [group.id, group.windowHours / 24]));

const allSpawnsAt = (t: number) =>
  rotatingGroups.flatMap((group) => tiles.flatMap((tile) => generateTilePlaces(group, tile, t)));

describe('the six-day place rotation', () => {
  it('spreads live places evenly over the three age thirds at every sample', () => {
    // A place only turns at the change hour (the boundary the next test walks day by day),
    // so one generation per local day serves every sample within it.
    const cache = new Map<string, PlaceSpawn[]>();
    const spawnsOn = (t: number) => {
      const day = localDayIndex(t, placeRules.changeHourLocal);
      return rotatingGroups.flatMap((group) =>
        tiles.flatMap((tile) => {
          const key = `${group.id}|${tile}|${day}`;
          const cached = cache.get(key);
          if (cached) return cached;
          const spawns = generateTilePlaces(group, tile, t);
          cache.set(key, spawns);
          return spawns;
        }),
      );
    };
    const violations: string[] = [];
    for (let t = START; t < END; t += SAMPLE_MS) {
      const live = liveAt(spawnsOn(t), t);
      const thirds = [0, 0, 0];
      for (const spawn of live) {
        // Age in local days: a window bends by an hour across daylight saving, so raw milliseconds would misplace a third.
        const age = (localDayIndex(t, placeRules.changeHourLocal) - localDayIndex(spawn.startsAt, placeRules.changeHourLocal)) / daysOf.get(spawn.group)!;
        thirds[Math.min(2, Math.floor(age * 3))] += 1;
      }
      for (const [i, count] of thirds.entries()) {
        const share = count / live.length;
        if (share < THIRD_MIN || share > THIRD_MAX) violations.push(`t=${new Date(t).toISOString()} third=${i} share=${share.toFixed(3)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('replaces at most one phase group at each local day change hour', () => {
    const violations: string[] = [];
    const firstDay = localDayIndex(START, placeRules.changeHourLocal);
    const lastDay = localDayIndex(END, placeRules.changeHourLocal);
    for (let day = firstDay; day <= lastDay; day++) {
      const before = localDayStart(day, placeRules.changeHourLocal) - 1;
      const after = localDayStart(day, placeRules.changeHourLocal);
      const liveBefore = new Set(liveAt(allSpawnsAt(before), before).map((s) => s.id));
      const liveAfter = new Set(liveAt(allSpawnsAt(after), after).map((s) => s.id));
      let gone = 0;
      for (const id of liveBefore) if (!liveAfter.has(id)) gone += 1;
      const share = liveBefore.size === 0 ? 0 : gone / liveBefore.size;
      if (share > CHANGE_SHARE_MAX) violations.push(`day=${day} replaced=${share.toFixed(3)}`);
    }
    expect(violations).toEqual([]);
  });

  it('keeps fight events on their own 24 h random-phase windows', () => {
    const fightTiles = tilesAround(wellington, fightGroup.precision);
    const spawns = fightTiles.flatMap((tile) => generateTilePlaces(fightGroup, tile, START));
    expect(spawns.length).toBeGreaterThan(0);
    for (const spawn of spawns) {
      expect(spawn.expiresAt - spawn.startsAt).toBe(fightGroup.windowHours * HOUR_MS);
    }
    // Random phases: the slots of a tile do not all start on the same local hour.
    const startHours = new Set(spawns.map((s) => new Date(s.startsAt).getHours()));
    expect(startHours.size).toBeGreaterThan(1);
  });
});
