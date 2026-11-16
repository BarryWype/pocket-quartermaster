import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Camp, SupplyState, Terrain } from './types';
import { campProblem, foundCamp, packUpCamp } from './camps';
import { postHero } from './postings';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR_MS = 3_600_000;

const cellNear = (meters: number, bearing = 0) => cellAt(offsetPosition(origin, meters, bearing));

/** A save with the hall placed at the origin, some gold and wood, and the given extra supply. */
const save = (extra: Partial<SupplyState> = {}): SaveData => ({
  ...createInitialSave(),
  gold: supplyRules.camps.foundCost.gold,
  materials: { wood: supplyRules.camps.foundCost.materials[0].amount },
  supply: { ...emptySupply(now), hall: { cell: cellNear(0), movedAt: 0 }, ...extra },
});

const campAt = (cell: string, id = 'cx'): Camp => ({
  id,
  kind: 'trapper',
  cell,
  terrain: 'built',
  foundedAt: now,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

describe('campProblem', () => {
  it('needs a hall, the player standing in the cell, and known land terrain', () => {
    const cell = cellNear(100);
    expect(campProblem({ ...save(), supply: { ...save().supply, hall: null } }, 'trapper', cell, 'built', cell, now)).toBe('noHall');
    expect(campProblem(save(), 'trapper', cell, 'built', cellNear(200), now)).toBe('notHere');
    expect(campProblem(save(), 'trapper', cell, undefined, cell, now)).toBe('unknownTerrain');
    expect(campProblem(save(), 'trapper', cell, 'water', cell, now)).toBe('water');
  });

  it('keeps timber to green cells', () => {
    const cell = cellNear(100);
    expect(campProblem(save(), 'timber', cell, 'waterside', cell, now)).toBe('notGreen');
    expect(campProblem(save(), 'timber', cell, 'green', cell, now)).toBeNull();
  });

  it('allows a trapper on any land terrain', () => {
    for (const terrain of ['green', 'waterside', 'built'] as Terrain[]) {
      expect(campProblem(save(), 'trapper', cellNear(100), terrain, cellNear(100), now)).toBeNull();
    }
  });

  it('refuses a second camp in a cell', () => {
    const cell = cellNear(100);
    const taken = save({ camps: [campAt(cell)] });
    expect(campProblem(taken, 'trapper', cell, 'built', cell, now)).toBe('occupied');
  });

  it('fills up at the configured camp count, counting cooling-down slots', () => {
    const two = save({ camps: [campAt(cellNear(100)), campAt(cellNear(300))] });
    expect(campProblem(two, 'trapper', cellNear(500), 'built', cellNear(500), now)).toBeNull();
    const cooling = save({ camps: [campAt(cellNear(100)), campAt(cellNear(300))], slotsFreeAt: [now + HOUR_MS] });
    expect(campProblem(cooling, 'trapper', cellNear(500), 'built', cellNear(500), now)).toBe('full');
    const expired = save({ camps: [campAt(cellNear(100)), campAt(cellNear(300))], slotsFreeAt: [now] });
    expect(campProblem(expired, 'trapper', cellNear(500), 'built', cellNear(500), now)).toBeNull();
  });

  it('keeps camps within the hall\'s reach', () => {
    const far = cellAt(offsetPosition(origin, supplyRules.camps.maxHallMeters + 500, 0));
    expect(campProblem(save(), 'trapper', far, 'built', far, now)).toBe('tooFar');
  });

  it('needs the gold and the materials', () => {
    const cell = cellNear(100);
    expect(campProblem({ ...save(), gold: save().gold - 1 }, 'trapper', cell, 'built', cell, now)).toBe('cost');
    expect(campProblem({ ...save(), materials: {} }, 'trapper', cell, 'built', cell, now)).toBe('cost');
  });
});

describe('foundCamp', () => {
  it('pays the cost and appends the camp with the next id', () => {
    const cell = cellNear(100);
    const founded = foundCamp(save(), 'timber', cell, 'green', cell, now);
    const camp = founded.supply.camps[0];
    expect(camp).toMatchObject({ id: 'c1', kind: 'timber', cell, terrain: 'green', foundedAt: now, heroId: null, postedAt: null, stock: {}, progress: 0, made: 0, settledAt: now, inspectedUntil: 0, closedUntil: 0 });
    expect(founded.supply.nextId).toBe(2);
    expect(founded.gold).toBe(save().gold - supplyRules.camps.foundCost.gold);
    expect(founded.materials).toEqual({});
    expect(() => foundCamp(founded, 'timber', cellNear(300), 'green', cellNear(300), now)).toThrow();
  });

  it('free founding skips the standing and cost checks only', () => {
    const cell = cellNear(100);
    const broke = { ...save(), gold: 0, materials: {} };
    const founded = foundCamp(broke, 'trapper', cell, 'built', cellNear(999), now, { free: true });
    expect(founded.supply.camps).toHaveLength(1);
    expect(founded.gold).toBe(0);
    // Full and tooFar still apply.
    const full = save({ camps: [campAt(cellNear(100)), campAt(cellNear(300))], slotsFreeAt: [now + HOUR_MS] });
    expect(() => foundCamp(full, 'trapper', cellNear(500), 'built', cellNear(500), now, { free: true })).toThrow(/full/);
    const far = cellAt(offsetPosition(origin, supplyRules.camps.maxHallMeters + 500, 0));
    expect(() => foundCamp(save(), 'trapper', far, 'built', far, now, { free: true })).toThrow(/tooFar/);
  });
});

describe('packUpCamp', () => {
  it('removes the camp, frees its slot after the cooldown, and prunes expired slots', () => {
    const cell = cellNear(100);
    const founded = foundCamp(save(), 'trapper', cell, 'built', cell, now);
    const packed = packUpCamp({ ...founded, supply: { ...founded.supply, slotsFreeAt: [now] } }, 'c1', now + HOUR_MS);
    expect(packed.supply.camps).toEqual([]);
    expect(packed.supply.slotsFreeAt).toEqual([now + HOUR_MS + supplyRules.camps.packUpCooldownHours * HOUR_MS]);
    expect(() => packUpCamp(packed, 'c1', now)).toThrow();
  });

  it('settles a posted hero’s trade hours before the camp goes', () => {
    const cell = cellNear(100);
    const founded = foundCamp(save(), 'timber', cell, 'green', cell, now);
    const posted = postHero(founded, 'c1', 'bram', now);
    const packed = packUpCamp(posted, 'c1', now + 5 * HOUR_MS);
    expect(packed.supply.camps).toEqual([]);
    expect(packed.heroes.find((h) => h.id === 'bram')!.trade.hours).toBeCloseTo(5);
  });
});
