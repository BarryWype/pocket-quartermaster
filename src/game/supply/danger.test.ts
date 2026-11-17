import { supplyRules } from '@/content/supplyLines';
import { placeRules } from '@/content/places';

import { localDayIndex, localDayStart } from '../generation/localDays';
import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { cellAt, cellsAlong } from '../discovery/cells';
import { ambushChance, cellAmbusher, cellDangers, dangerContextOf, dangerLevel, dayDangers } from './danger';
import type { DangerContext } from './danger';
import { createInitialSave } from '../save';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const t0 = Date.UTC(2026, 10, 2, 12);
const ctx: DangerContext = { tier: 1, beatenPatrols: {}, usedPlaces: {} };

/** Cells spread over about a kilometre around the origin. */
const nearby = (() => {
  const rng = createRng('danger-cells');
  return Array.from({ length: 60 }, () =>
    cellAt({ latitude: origin.latitude + (rng.next() - 0.5) * 0.01, longitude: origin.longitude + (rng.next() - 0.5) * 0.015 }),
  );
})();

describe('cellDangers', () => {
  it('is deterministic', () => {
    expect(cellDangers(nearby, t0, ctx)).toEqual(cellDangers(nearby, t0, ctx));
  });

  it('drops a beaten patrol\'s contribution', () => {
    // Find a cell a patrol actually touches in some window, so the test has something to beat.
    let ambusher: ReturnType<typeof cellAmbusher> = null;
    let cell = '';
    let time = 0;
    for (let w = 0; w < 20 && !ambusher; w++) {
      time = t0 + w * 30 * 60_000;
      for (const candidate of nearby) {
        const found = cellAmbusher(candidate, time, ctx);
        if (found) {
          ambusher = found;
          cell = candidate;
          break;
        }
      }
    }
    expect(ambusher).not.toBeNull();
    const before = cellDangers([cell], time, ctx)[cell].score;
    const beaten: DangerContext = { ...ctx, beatenPatrols: { [ambusher!.id]: time + 1 } };
    expect(cellDangers([cell], time, beaten)[cell].score).toBeLessThan(before);
  });

  it('levels at the configured thresholds', () => {
    const [one, two, three] = supplyRules.danger.levelFrom;
    expect(dangerLevel(0)).toBe(0);
    expect(dangerLevel(one - 1)).toBe(0);
    expect(dangerLevel(one)).toBe(1);
    expect(dangerLevel(two)).toBe(2);
    expect(dangerLevel(three)).toBe(3);
    supplyRules.danger.ambushChance.forEach((chance, level) => expect(ambushChance(level as 0 | 1 | 2 | 3)).toBe(chance));
  });

  it('computes a 20-cell route in under 100 ms', () => {
    const route = cellsAlong(origin, offsetPosition(origin, 2500, 40)).slice(0, 20);
    const started = Date.now();
    const dangers = cellDangers(route, t0, ctx);
    const elapsed = Date.now() - started;
    expect(Object.keys(dangers)).toHaveLength(route.length);
    expect(elapsed).toBeLessThan(100);
  });
});

describe('dayDangers', () => {
  it('gives every crossing time within a day the same level', () => {
    const cell = nearby[0];
    const day = localDayIndex(t0, placeRules.changeHourLocal);
    const start = localDayStart(day, placeRules.changeHourLocal);
    const end = localDayStart(day + 1, placeRules.changeHourLocal);
    const level = dayDangers([cell], start + 3_600_000, ctx)[cell].level;
    for (const t of [start + 5 * 3_600_000, start + 12 * 3_600_000, end - 3_600_000]) {
      expect(dayDangers([cell], t, ctx)[cell].level).toBe(level);
    }
  });

  it('levels the rounded mean of the day\'s samples', () => {
    const cell = nearby[1];
    const day = localDayIndex(t0, placeRules.changeHourLocal);
    const start = localDayStart(day, placeRules.changeHourLocal);
    const end = localDayStart(day + 1, placeRules.changeHourLocal);
    const samples = supplyRules.danger.daySamples;
    let sum = 0;
    for (let k = 0; k < samples; k++) sum += cellDangers([cell], start + (k * (end - start)) / samples, ctx)[cell].score;
    const mean = Math.round(sum / samples);
    expect(dayDangers([cell], t0, ctx)[cell].level).toBe(dangerLevel(mean));
  });
});

describe('dangerContextOf', () => {
  it('takes the tier from the save', () => {
    const save = createInitialSave();
    expect(dangerContextOf(save).tier).toBe(1);
    expect(dangerContextOf({ ...save, clearedDungeons: ['banditStockade'] }).tier).toBe(2);
  });
});
