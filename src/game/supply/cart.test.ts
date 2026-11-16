import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { currentHp } from '../team/health';
import { isAway } from '../team/team';
import { emptySupply } from './state';
import type { Camp, CartEvent } from './types';
import {
  cartCapacity,
  cartNextEventAt,
  cartPositionAt,
  cartProblem,
  cartSpeedMps,
  crewProblem,
  routeCells,
  routePreview,
  setCrew,
  setRoute,
  settleCart,
  startCart,
  stopCart,
} from './cart';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;
const MINUTE = 60_000;

const cellNear = (meters: number, bearing = 0) => cellAt(offsetPosition(origin, meters, bearing));

const campAt = (cell: string, id: string, stock: Record<string, number>): Camp => ({
  id,
  kind: 'trapper',
  cell,
  quality: 2,
  foundedAt: now,
  heroId: null,
  postedAt: null,
  stock,
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

/** A save with the hall at the origin and two stocked camps. */
const baseSave = (): SaveData => {
  const hallCell = cellNear(0);
  const camps = [campAt(cellNear(300), 'c1', { wood: 8 }), campAt(cellNear(600, 90), 'c2', { game: 6 })];
  return { ...createInitialSave(), supply: { ...emptySupply(now), hall: { cell: hallCell, moves: [] }, camps } };
};

const readySave = () => setRoute(setCrew(baseSave(), 'bram', ['lyra'], now), [{ camp: 'c1' }, { camp: 'c2' }], now);

beforeEach(() => {
  // No ambushes unless a test forces them.
  jest.replaceProperty(supplyRules.danger, 'ambushChance', [0, 0, 0, 0]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a full loop', () => {
  it('delivers the camps’ stock up to capacity into materials, and logs it', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    expect(loop.events.filter((event) => event.kind === 'camp')).toHaveLength(2);
    const done = settleCart(started, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    const capacity = supplyRules.cart.capacity;
    const deliveredTotal = Object.values(line.delivered).reduce((sum, amount) => sum + amount, 0);
    expect(deliveredTotal).toBeLessThanOrEqual(capacity);
    expect(line.delivered.wood).toBeGreaterThanOrEqual(8);
    expect(line.delivered.game).toBeGreaterThanOrEqual(6);
    expect(done.materials.wood).toBe((started.materials.wood ?? 0) + line.delivered.wood);
    expect(done.materials.game).toBe((started.materials.game ?? 0) + line.delivered.game);
    expect(line.ambush).toBeNull();
    // The camps were emptied into the cart.
    expect(done.supply.camps.find((camp) => camp.id === 'c1')!.stock.wood ?? 0).toBeLessThan(1);
  });

  it('replays eight hours in one call exactly like settling every ten minutes', () => {
    const started = startCart(readySave(), now);
    const end = now + 8 * HOUR;
    const onePass = settleCart(started, end);
    let stepped = started;
    for (let t = now + 10 * MINUTE; t <= end; t += 10 * MINUTE) stepped = settleCart(stepped, t);
    expect(onePass).toEqual(stepped);
  });

  it('keeps the cargo of camps already visited aboard when settled halfway', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const firstCamp = loop.events.find((event) => event.kind === 'camp')!;
    const half = settleCart(started, firstCamp.at + 1);
    expect(half.supply.cart.loop).not.toBeNull();
    expect(half.supply.cart.cargo.wood).toBeGreaterThanOrEqual(8);
    const done = settleCart(half, loop.endsAt);
    expect(done.supply.cart.log.find((entry) => entry.n === 1)!.delivered.wood).toBeGreaterThanOrEqual(8);
  });

  it('applies a route changed mid-loop from the next departure', () => {
    const started = startCart(readySave(), now);
    const changed = setRoute(started, [{ camp: 'c2' }], now);
    expect(changed.supply.cart.nextRoute).toEqual([{ camp: 'c2' }]);
    const done = settleCart(changed, started.supply.cart.loop!.endsAt);
    expect(done.supply.cart.route).toEqual([{ camp: 'c2' }]);
    expect(done.supply.cart.nextRoute).toBeNull();
    const nextLoop = done.supply.cart.loop!;
    expect(nextLoop.events.filter((event) => event.kind === 'camp').map((event) => (event as { campId: string }).campId)).toEqual(['c2']);
  });

  it('loads nothing from a camp removed while the cart is on its way, and the loop goes on', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const withoutC2: SaveData = { ...started, supply: { ...started.supply, camps: started.supply.camps.filter((camp) => camp.id !== 'c2') } };
    const done = settleCart(withoutC2, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    expect(line.delivered.game ?? 0).toBe(0);
    expect(line.delivered.wood).toBeGreaterThanOrEqual(8);
  });
});

describe('ambushes', () => {
  it('a won ambush after a camp keeps the cargo and pays its rewards and HP at loop end', () => {
    jest.restoreAllMocks();
    // Seed search over hall placements with a strong crew: the ambush roll is seeded per cell,
    // so moving the hall changes the crossed cells; find one with a won ambush after the first camp.
    const strong = (save: SaveData): SaveData => ({
      ...save,
      heroes: save.heroes.map((hero) => ({ ...hero, level: 12, xp: 0, exhaustedUntil: 0 })),
    });
    const placed = (offset: number): SaveData => {
      const hallCell = cellNear(offset);
      const camps = [campAt(cellNear(offset + 300), 'c1', { wood: 8 }), campAt(cellNear(offset + 600, 90), 'c2', { game: 6 })];
      const withCamps: SaveData = { ...createInitialSave(), supply: { ...emptySupply(now), hall: { cell: hallCell, moves: [] }, camps } };
      return setRoute(setCrew(withCamps, 'bram', ['lyra', 'mira'], now), [{ camp: 'c1' }, { camp: 'c2' }], now);
    };
    let started = startCart(strong(placed(0)), now);
    let ambush: Extract<CartEvent, { kind: 'ambush' }> | undefined;
    for (let k = 0; k < 400 && !ambush; k++) {
      const candidate = startCart(strong(placed(k * 17)), now);
      const loop = candidate.supply.cart.loop!;
      const firstCamp = loop.events.find((event) => event.kind === 'camp');
      const found = loop.events.find((event) => event.kind === 'ambush' && event.won === true && firstCamp && event.at > firstCamp.at);
      if (found && found.kind === 'ambush') {
        started = candidate;
        ambush = found;
      }
    }
    expect(ambush).toBeDefined();
    const loop = started.supply.cart.loop!;
    // Halfway, after the camp but before the ambush: the cargo is aboard.
    const half = settleCart(started, ambush!.at - 1);
    expect(Object.values(half.supply.cart.cargo).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(0);
    const done = settleCart(half, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === loop.n)!;
    expect(line.ambush).toEqual({ cell: ambush!.cell, kind: ambush!.patrolKind, won: true });
    // The cargo was not emptied: everything loaded before the ambush is delivered.
    expect(Object.values(line.delivered).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(0);
    // The fight's HP was applied at loop end.
    const expected = done.heroes.map((hero) => ambush!.hp.find((h) => h.heroId === hero.id)?.hp ?? currentHp(done, hero, loop.endsAt));
    expect(done.heroes.map((hero) => currentHp(done, hero, loop.endsAt))).toEqual(expected);
  });

  it('an ambush with nobody aboard is lost: the cargo is gone and the cart returns empty after the configured minutes', () => {
    jest.replaceProperty(supplyRules.danger, 'ambushChance', [1, 1, 1, 1]);
    const empty = setCrew(readySave(), null, [], now);
    const started = startCart(empty, now);
    const loop = started.supply.cart.loop!;
    const ambush = loop.events.find((event) => event.kind === 'ambush')!;
    expect(ambush.kind === 'ambush' && ambush.won).toBeNull();
    expect(loop.endsAt).toBe(ambush.at + supplyRules.cart.lostReturnMinutes * MINUTE);
    const done = settleCart(started, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    expect(line.delivered).toEqual({});
    expect(line.ambush!.won).toBeNull();
    expect(done.supply.cart.cargo).toEqual({});
  });
});

describe('crew and parking', () => {
  it('a hurt crew parks the cart with waitingForCrew, and startCart starts it again', () => {
    const started = startCart(setRoute(setCrew(baseSave(), 'bram', ['lyra'], now), [{ camp: 'c1' }], now), now);
    const exhausted = {
      ...started,
      heroes: started.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, exhaustedUntil: now + 48 * HOUR } : hero)),
    };
    const done = settleCart(exhausted, started.supply.cart.loop!.endsAt);
    expect(done.supply.cart.loop).toBeNull();
    expect(done.supply.cart.waitingForCrew).toBe(true);
    expect(cartProblem(done, now + 2 * HOUR)).toBe('crewHurt');
    const healed = { ...done, heroes: done.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, exhaustedUntil: 0 } : hero)) };
    const restarted = startCart(healed, now + 2 * HOUR);
    expect(restarted.supply.cart.loop).not.toBeNull();
    expect(restarted.supply.cart.waitingForCrew).toBe(false);
  });

  it('a Teamster driver raises speed and capacity by level, and gains the loop’s hours as trade hours', () => {
    const base = baseSave();
    const plain = setCrew(base, 'bram', [], now);
    const teamster = setCrew(base, 'mira', [], now);
    const noDriver = setCrew(base, null, [], now);
    const level = 0; // fresh trade: level 1, first bonus entry
    expect(cartSpeedMps(teamster)).toBeCloseTo((supplyRules.cart.speedKmh * (1 + supplyRules.cart.teamster.speed[level]) * 1000) / 3600);
    expect(cartSpeedMps(plain)).toBeCloseTo((supplyRules.cart.speedKmh * 1000) / 3600);
    expect(cartSpeedMps(noDriver)).toBeCloseTo((supplyRules.cart.speedKmh * supplyRules.cart.noDriverSpeed * 1000) / 3600);
    expect(cartCapacity(teamster)).toBeCloseTo(supplyRules.cart.capacity * (1 + supplyRules.cart.teamster.capacity[level]));
    const started = startCart(setRoute(teamster, [{ camp: 'c1' }], now), now);
    const loop = started.supply.cart.loop!;
    const done = settleCart(started, loop.endsAt);
    const hours = done.heroes.find((hero) => hero.id === 'mira')!.trade.hours;
    expect(hours).toBeCloseTo((loop.endsAt - loop.startedAt) / HOUR);
  });

  it('crew heroes are away only while a loop runs, and the crew cannot change while running', () => {
    const parked = readySave();
    expect(isAway(parked, 'bram')).toBe(false);
    const started = startCart(parked, now);
    expect(isAway(started, 'bram')).toBe(true);
    expect(isAway(started, 'lyra')).toBe(true);
    expect(isAway(started, 'mira')).toBe(false);
    expect(crewProblem(started, 'mira', [], now)).toBe('running');
    expect(() => setCrew(started, 'mira', [], now)).toThrow(/running/);
    const stopped = stopCart(started, now);
    expect(stopped.supply.cart.nextRoute).toEqual([]);
    const home = settleCart(stopped, started.supply.cart.loop!.endsAt);
    expect(home.supply.cart.loop).toBeNull();
    expect(isAway(home, 'bram')).toBe(false);
  });
});

describe('routePreview', () => {
  it('matches 1 − Π(1 − p) over the crossed cells, each at its real danger level', () => {
    jest.restoreAllMocks();
    const save = baseSave();
    const waypoint = cellNear(900, 200);
    const route = [{ camp: 'c1' }, { cell: waypoint }] as ({ camp: string } | { cell: string })[];
    const preview = routePreview(save, route, now);
    const crossed = routeCells(preview.points);
    expect(crossed).toContain(waypoint);
    let none = 1;
    for (const cell of crossed) {
      const entry = preview.cells.find((c) => c.cell === cell)!;
      const level = entry.level as 0 | 1 | 2 | 3;
      none *= 1 - supplyRules.danger.ambushChance[level];
    }
    expect(preview.ambushChance).toBeCloseTo(1 - none);
  });
});

describe('position and tick', () => {
  it('cartPositionAt walks the polyline and cartNextEventAt gives the next event or the end', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const at = cartPositionAt(loop, loop.startedAt + 1000);
    expect(at).not.toBeNull();
    expect(cartPositionAt(loop, loop.endsAt)).toBeNull();
    expect(cartPositionAt(loop, loop.startedAt - 3000)).toEqual(loop.points[0]);
    expect(cartNextEventAt(started.supply.cart)).toBe(loop.events[0].at);
    const settled = settleCart(started, loop.events[0].at);
    expect(cartNextEventAt(settled.supply.cart)).toBe(loop.events[1].at);
  });
});

describe('performance', () => {
  it('replays eight hours with two camps in under 500 ms', () => {
    const started = startCart(readySave(), now);
    const began = Date.now();
    settleCart(started, now + 8 * HOUR);
    expect(Date.now() - began).toBeLessThan(500);
  });
});
