import { supplyRules } from '@/content/supplyLines';

import { assignProblem } from '../jobs/jobs';
import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Camp } from './types';
import { campStockTotal } from './production';
import { collectCamp, collectProblem, postHero, postProblem, recallPosted } from './postings';
import { isBusy, isPosted } from '../team/team';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);

const campIn = (id: string, extra: Partial<Camp> = {}): Camp => ({
  id,
  kind: 'timber',
  cell: cellAt(origin),
  terrain: 'green',
  foundedAt: now,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

const saveWith = (camps: Camp[], heroes?: SaveData['heroes']): SaveData => ({
  ...createInitialSave(),
  ...(heroes ? { heroes } : {}),
  supply: { ...emptySupply(now), camps },
});

describe('postProblem', () => {
  it('needs a known camp and a known hero', () => {
    const save = saveWith([campIn('c1')]);
    expect(postProblem(save, 'nope', 'bram', now)).toBe('unknown');
    expect(postProblem(save, 'c1', 'nobody', now)).toBe('unknown');
  });

  it('a camp holds one hero at a time', () => {
    const save = postHero(saveWith([campIn('c1')]), 'c1', 'bram', now);
    expect(postProblem(save, 'c1', 'lyra', now)).toBe('taken');
    expect(postProblem(save, 'c1', 'bram', now)).toBeNull();
  });

  it('a busy hero cannot be posted', () => {
    const working = saveWith([campIn('c1')], [{ ...createInitialSave().heroes[0], job: { jobId: 'woodcutter', since: now, tired: false } }]);
    expect(postProblem(working, 'c1', 'bram', now)).toBe('busy');
    const posted = postHero(saveWith([campIn('c1'), campIn('c2')]), 'c1', 'bram', now);
    expect(postProblem(posted, 'c2', 'bram', now)).toBe('busy');
  });
});

describe('postHero and recallPosted', () => {
  it('posting sets the hero and the time, and makes them busy', () => {
    const save = postHero(saveWith([campIn('c1')]), 'c1', 'bram', now);
    expect(save.supply.camps[0]).toMatchObject({ heroId: 'bram', postedAt: now });
    expect(isPosted(save, 'bram')).toBe(true);
    expect(isBusy(save, 'bram')).toBe(true);
    expect(() => postHero(save, 'c1', 'lyra', now)).toThrow(/taken/);
  });

  it('a posted hero cannot take a guild job', () => {
    const save = postHero(saveWith([campIn('c1')]), 'c1', 'bram', now);
    expect(assignProblem(save, 'bram', 'woodcutter', now)).toBe('working');
  });

  it('recalling settles, frees the hero and throws when nobody is posted', () => {
    const posted = postHero(saveWith([campIn('c1')]), 'c1', 'bram', now);
    const recalled = recallPosted(posted, 'bram', now + 5 * HOUR);
    expect(recalled.supply.camps[0]).toMatchObject({ heroId: null, postedAt: null });
    expect(isBusy(recalled, 'bram')).toBe(false);
    // The matching trade's hours accrued over the posted span before the recall.
    expect(recalled.heroes.find((h) => h.id === 'bram')!.trade.hours).toBeCloseTo(5);
    expect(() => recallPosted(recalled, 'bram', now)).toThrow(/posted/);
    expect(() => recallPosted(recalled, 'nobody', now)).toThrow(/Unknown/);
  });
});

describe('collectProblem and collectCamp', () => {
  const stocked = (): SaveData => saveWith([campIn('c1', { stock: { wood: 3 }, progress: 0.5 })]);

  it('needs a known camp, the player in range, and stock on hand', () => {
    const save = stocked();
    const centre = tileCenter(save.supply.camps[0].cell);
    expect(collectProblem(save, 'nope', centre, now)).toBe('unknown');
    expect(collectProblem(save, 'c1', offsetPosition(centre, supplyRules.production.collectMeters + 50, 0), now)).toBe('tooFar');
    expect(collectProblem(saveWith([campIn('c1')]), 'c1', centre, now)).toBe('empty');
    expect(collectProblem(save, 'c1', centre, now)).toBeNull();
  });

  it('collecting moves the stock, keeps the fraction and inspects the camp', () => {
    const save = stocked();
    const centre = tileCenter(save.supply.camps[0].cell);
    const collected = collectCamp(save, 'c1', centre, now);
    expect(collected.materials.wood).toBe(3);
    expect(collected.supply.camps[0]).toMatchObject({ stock: {}, progress: 0.5 });
    expect(collected.supply.camps[0].inspectedUntil).toBe(now + supplyRules.production.inspectHours * HOUR);
    expect(campStockTotal(collected.supply.camps[0])).toBe(0);
    expect(() => collectCamp(collected, 'c1', centre, now)).toThrow(/empty/);
  });
});

describe('postHero settling', () => {
  it('settles before re-posting, so the hours already put in are kept', () => {
    const posted = postHero(saveWith([campIn('c1')]), 'c1', 'bram', now);
    const again = postHero(posted, 'c1', 'bram', now + 10 * HOUR);
    expect(again.supply.camps[0]).toMatchObject({ heroId: 'bram', postedAt: now + 10 * HOUR });
    expect(again.heroes.find((h) => h.id === 'bram')!.trade.hours).toBeCloseTo(10);
  });
});
