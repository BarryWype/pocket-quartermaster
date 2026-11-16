import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { dayKey } from '../rewards/chests';
import { createInitialSave, type SaveData } from '../save';
import { isAway } from '../team/team';
import { startCart } from './cart';
import {
  debugRaid,
  defendProblem,
  defenderHomeAt,
  raidAnnouncedAt,
  raidTravelMs,
  resolveRaid,
  rollRaidDay,
  sendDefenders,
  settleRaids,
} from './raids';
import { settleNetwork } from './settle';
import { emptySupply } from './state';
import type { Camp, Raid } from './types';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };
const hallCell = cellAt(origin);
const campCell = cellAt(offsetPosition(origin, 800, 0));
/** 08:00 local: a raid rolled now can land later today. */
const morning = new Date(2026, 10, 16, 8, 0).getTime();

const camp = (extra: Partial<Camp> = {}): Camp => ({
  id: 'c1',
  kind: 'timber',
  cell: campCell,
  quality: 2,
  foundedAt: 0,
  heroId: null,
  postedAt: null,
  stock: { wood: 10 },
  progress: 0,
  made: 0,
  settledAt: morning,
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

/** A save with a hall, one stocked camp, and a player seed whose roll for `now`'s day lands a raid (or not). */
const network = (now = morning, hits = true, campExtra: Partial<Camp> = {}): SaveData => {
  const today = dayKey(new Date(now));
  let seed = 0;
  while (createRng(`raid|p${seed}|${today}`).chance(supplyRules.raids.dailyChance) !== hits) seed++;
  const base = createInitialSave(`p${seed}`);
  return { ...base, supply: { ...emptySupply(now), hall: { cell: hallCell, moves: [] }, camps: [camp(campExtra)] } };
};

/** A raid on the camp, set by hand, landing at `landsAt`. */
const withRaid = (save: SaveData, landsAt: number, extra: Partial<Raid> = {}): SaveData => ({
  ...save,
  supply: { ...save.supply, raidDay: dayKey(new Date(morning)), raid: { campId: 'c1', kind: 'goblins', tier: 1, landsAt, defenders: [], result: null, ...extra } },
});

const levelled = (save: SaveData, level: number): SaveData => ({ ...save, heroes: save.heroes.map((hero) => ({ ...hero, level })) });

describe('rolling the day', () => {
  it('rolls once per day: a second settle the same day changes nothing', () => {
    const rolled = rollRaidDay(network(), morning);
    expect(rolled.supply.raidDay).toBe(dayKey(new Date(morning)));
    expect(rolled.supply.raid).not.toBeNull();
    const cleared = { ...rolled, supply: { ...rolled.supply, raid: null } };
    expect(rollRaidDay(cleared, morning + HOUR)).toBe(cleared);
  });

  it('lands later today, at least the announcement lead away, by a patrol kind of the tier', () => {
    const raid = rollRaidDay(network(), morning).supply.raid!;
    expect(raid.landsAt).toBeGreaterThanOrEqual(morning + supplyRules.raids.announceHours * HOUR);
    expect(dayKey(new Date(raid.landsAt))).toBe(dayKey(new Date(morning)));
    expect(raid.campId).toBe('c1');
  });

  it('a day whose roll misses has no raid', () => {
    expect(rollRaidDay(network(morning, false), morning).supply.raid).toBeNull();
  });

  it('no raid when no camp will hold stock', () => {
    const empty = network(morning, true, { stock: {}, closedUntil: morning + 48 * HOUR });
    expect(rollRaidDay(empty, morning).supply.raid).toBeNull();
  });

  it('after an absence of two days, nothing lands before the lead plus the quiet hours', () => {
    const save = network();
    const back = { ...save, supply: { ...save.supply, lastOpenAt: morning - 3 * 24 * HOUR } };
    const raid = rollRaidDay(back, morning).supply.raid!;
    const { announceHours, returnQuietHours } = supplyRules.raids;
    expect(raid.landsAt).toBeGreaterThanOrEqual(morning + (announceHours + returnQuietHours) * HOUR);
  });
});

describe('the announcement', () => {
  it('comes 2 h before landing, and 4 h with a level 1 Watchman posted at the target', () => {
    const save = withRaid(network(), morning + 6 * HOUR);
    expect(raidAnnouncedAt(save, save.supply.raid!)).toBe(morning + 4 * HOUR);
    const watched: SaveData = {
      ...save,
      heroes: save.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, trade: { id: 'watchman', hours: 0 } } : hero)),
      supply: { ...save.supply, camps: [camp({ heroId: 'bram', postedAt: morning })] },
    };
    expect(raidAnnouncedAt(watched, watched.supply.raid!)).toBe(morning + 2 * HOUR);
  });
});

describe('defending', () => {
  const announced = () => withRaid(network(), morning + HOUR);

  it('walks from the hall at the configured speed', () => {
    const save = announced();
    const expected = (800 / ((supplyRules.raids.walkKmh * 1000) / 3600)) * 1000;
    expect(raidTravelMs(save, 'c1')).toBeGreaterThan(expected * 0.9);
    expect(raidTravelMs(save, 'c1')).toBeLessThan(expected * 1.1);
    const sent = sendDefenders(save, ['bram'], morning);
    expect(sent.supply.raid!.defenders[0].arrivesAt).toBe(morning + raidTravelMs(save, 'c1'));
    expect(isAway(sent, 'bram')).toBe(true);
  });

  it('refuses a party that would arrive too late, too many heroes, and busy ones', () => {
    const save = announced();
    expect(defendProblem(save, ['bram'], morning + HOUR - MINUTE)).toBe('tooLate');
    const four = { ...save, heroes: [...save.heroes, { ...save.heroes[0], id: 'h9' }] };
    expect(defendProblem(four, ['bram', 'lyra', 'mira', 'h9'], morning)).toBe('tooMany');
    const posted = { ...save, supply: { ...save.supply, camps: [camp({ heroId: 'bram', postedAt: morning })] } };
    expect(defendProblem(posted, ['bram'], morning)).toBe('busy');
  });

  it('is not possible before the announcement', () => {
    const save = withRaid(network(), morning + 6 * HOUR);
    expect(defendProblem(save, ['bram'], morning)).toBe('notAnnounced');
  });
});

describe('the landing', () => {
  it('a defended raid won keeps the stock and pays the defenders', () => {
    const save = levelled(withRaid(network(), morning + HOUR), 12);
    const sent = sendDefenders(save, ['bram', 'lyra', 'mira'], morning);
    const landed = resolveRaid(sent);
    expect(landed.supply.raid!.result).toEqual({ won: true, fighters: ['bram', 'lyra', 'mira'] });
    expect(landed.supply.camps[0].stock.wood).toBeGreaterThanOrEqual(10);
    expect(landed.supply.raidLog.at(-1)).toMatchObject({ won: true, lost: {} });
    // The patrol loot roll is paid: every defender gains XP.
    for (const hero of landed.heroes) expect(hero.xp).toBeGreaterThan(sent.heroes.find((h) => h.id === hero.id)!.xp);
  });

  it('an undefended raid takes the stock and closes the camp', () => {
    const landsAt = morning + HOUR;
    const landed = resolveRaid(withRaid(network(), landsAt));
    expect(landed.supply.camps[0].stock).toEqual({});
    expect(landed.supply.camps[0].closedUntil).toBe(landsAt + supplyRules.raids.closedHours * HOUR);
    expect(landed.supply.raidLog.at(-1)!.won).toBeNull();
    expect(landed.supply.raidLog.at(-1)!.lost.wood).toBeGreaterThanOrEqual(10);
  });

  it('a posted hero who loses comes home hurt and is no longer posted', () => {
    const save = withRaid(network(morning, true, { heroId: 'mira', postedAt: morning }), morning + HOUR, { kind: 'trolls', tier: 5 });
    const landed = resolveRaid(save);
    expect(landed.supply.raid!.result!.won).toBe(false);
    expect(landed.supply.camps[0].heroId).toBeNull();
    expect(landed.supply.camps[0].stock).toEqual({});
  });

  it('defenders are away until they have walked back, then the raid clears', () => {
    const save = levelled(withRaid(network(), morning + HOUR), 12);
    const sent = sendDefenders(save, ['bram'], morning);
    const raid = sent.supply.raid!;
    const home = defenderHomeAt(raid, raid.defenders[0]);
    const landed = settleRaids(sent, raid.landsAt);
    expect(isAway(landed, 'bram')).toBe(true);
    const back = settleRaids(landed, home);
    expect(back.supply.raid).toBeNull();
    expect(isAway(back, 'bram')).toBe(false);
  });

  it('a cart calling at the camp before the landing keeps its cargo', () => {
    const save = network(morning, true, { stock: { wood: 10 } });
    const started = startCart({ ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route: [{ camp: 'c1' }] } } }, morning);
    const call = started.supply.cart.loop!.events.find((event) => event.kind === 'camp')!;
    const raided = withRaid(started, call.at + MINUTE);
    const settled = settleNetwork(raided, call.at + 2 * MINUTE);
    const aboard = settled.supply.cart.cargo.wood ?? settled.supply.cart.log.at(-1)?.delivered.wood ?? 0;
    expect(aboard).toBeGreaterThanOrEqual(10);
    expect(settled.supply.raidLog.at(-1)!.lost.wood ?? 0).toBeLessThan(10);
  });
});

describe('debug', () => {
  it('raids the camp two minutes from now', () => {
    const raid = debugRaid(network(), 'c1', morning).supply.raid!;
    expect(raid.landsAt).toBe(morning + 2 * MINUTE);
    expect(raid.campId).toBe('c1');
  });
});
