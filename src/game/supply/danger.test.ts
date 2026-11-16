import { supplyRules } from '@/content/supplyLines';

import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { cellAt, cellsAlong } from '../discovery/cells';
import { ambushChance, cellAmbusher, cellDangers, dangerContextOf, dangerLevel } from './danger';
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

describe('dangerContextOf', () => {
  it('takes the tier from the save', () => {
    const save = createInitialSave();
    expect(dangerContextOf(save).tier).toBe(1);
    expect(dangerContextOf({ ...save, clearedDungeons: ['banditStockade'] }).tier).toBe(2);
  });
});
