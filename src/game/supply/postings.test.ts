import { supplyRules } from '@/content/supplyLines';

import { assignProblem } from '../jobs/jobs';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Building } from './types';
import { buildingStockTotal } from './production';
import { collectBuilding, collectProblem, postHero, postProblem, recallPosted } from './postings';
import { isBusy, isPosted } from '../team/team';

// The job engine is generic; the only job left in the game is the outdoor gatherer, so these tests use a plain station
// of their own.
jest.mock('@/content/jobs', () => {
  const actual = jest.requireActual('@/content/jobs');
  const woodcutter = { id: 'woodcutter', name: 'Woodcutter', produces: 'wood', ratePerHour: 0.3, opensAtTier: 1, emoji: '🪓' };
  return { ...actual, jobs: [woodcutter, ...actual.jobs], jobById: { ...actual.jobById, woodcutter } };
});

const origin = { latitude: -41.2865, longitude: 174.7762 };
const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);

const buildingIn = (id: string, extra: Partial<Building> = {}): Building => ({
  id,
  kind: 'farm',
  siteId: `site-${id}`,
  position: origin,
  quality: 2,
  builtAt: now,
  expiresAt: now + 6 * 24 * HOUR,
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

const saveWith = (buildings: Building[], heroes?: SaveData['heroes']): SaveData => ({
  ...createInitialSave(),
  ...(heroes ? { heroes } : {}),
  supply: { ...emptySupply(now), buildings },
});

describe('postProblem', () => {
  it('needs a known building and a known hero', () => {
    const save = saveWith([buildingIn('b1')]);
    expect(postProblem(save, 'nope', 'bram', now)).toBe('unknown');
    expect(postProblem(save, 'b1', 'nobody', now)).toBe('unknown');
  });

  it('a building holds one hero at a time', () => {
    const save = postHero(saveWith([buildingIn('b1')]), 'b1', 'bram', now);
    expect(postProblem(save, 'b1', 'lyra', now)).toBe('taken');
    expect(postProblem(save, 'b1', 'bram', now)).toBeNull();
  });

  it('a busy hero cannot be posted', () => {
    const working = saveWith([buildingIn('b1')], [{ ...createInitialSave().heroes[0], job: { jobId: 'woodcutter', since: now, tired: false } }]);
    expect(postProblem(working, 'b1', 'bram', now)).toBe('busy');
    const posted = postHero(saveWith([buildingIn('b1'), buildingIn('b2')]), 'b1', 'bram', now);
    expect(postProblem(posted, 'b2', 'bram', now)).toBe('busy');
  });
});

describe('postHero and recallPosted', () => {
  it('posting sets the hero and the time, and makes them busy', () => {
    const save = postHero(saveWith([buildingIn('b1')]), 'b1', 'bram', now);
    expect(save.supply.buildings[0]).toMatchObject({ heroId: 'bram', postedAt: now });
    expect(isPosted(save, 'bram')).toBe(true);
    expect(isBusy(save, 'bram')).toBe(true);
    expect(() => postHero(save, 'b1', 'lyra', now)).toThrow(/taken/);
  });

  it('a posted hero cannot take a guild job', () => {
    const save = postHero(saveWith([buildingIn('b1')]), 'b1', 'bram', now);
    expect(assignProblem(save, 'bram', 'woodcutter', now)).toBe('working');
  });

  it('recalling settles, frees the hero and throws when nobody is posted', () => {
    const posted = postHero(saveWith([buildingIn('b1', { kind: 'herbGarden' })]), 'b1', 'bram', now);
    const recalled = recallPosted(posted, 'bram', now + 5 * HOUR);
    expect(recalled.supply.buildings[0]).toMatchObject({ heroId: null, postedAt: null });
    expect(isBusy(recalled, 'bram')).toBe(false);
    // The matching trade's hours accrued over the posted span before the recall.
    expect(recalled.heroes.find((h) => h.id === 'bram')!.trade.hours).toBeCloseTo(5);
    expect(() => recallPosted(recalled, 'bram', now)).toThrow(/posted/);
    expect(() => recallPosted(recalled, 'nobody', now)).toThrow(/Unknown/);
  });
});

describe('collectProblem and collectBuilding', () => {
  const stocked = (): SaveData => saveWith([buildingIn('b1', { stock: { grain: 3 }, progress: 0.5 })]);

  it('needs a known building, the player in range, and stock on hand', () => {
    const save = stocked();
    const at = save.supply.buildings[0].position;
    expect(collectProblem(save, 'nope', at, now)).toBe('unknown');
    expect(collectProblem(save, 'b1', offsetPosition(at, supplyRules.production.collectMeters + 50, 0), now)).toBe('tooFar');
    expect(collectProblem(saveWith([buildingIn('b1')]), 'b1', at, now)).toBe('empty');
    expect(collectProblem(save, 'b1', at, now)).toBeNull();
  });

  it('collecting moves the stock, keeps the fraction and inspects the building', () => {
    const save = stocked();
    const at = save.supply.buildings[0].position;
    const collected = collectBuilding(save, 'b1', at, now);
    expect(collected.materials.grain).toBe(3);
    expect(collected.supply.buildings[0]).toMatchObject({ stock: {}, progress: 0.5 });
    expect(collected.supply.buildings[0].inspectedUntil).toBe(now + supplyRules.production.inspectHours * HOUR);
    expect(buildingStockTotal(collected.supply.buildings[0])).toBe(0);
    expect(() => collectBuilding(collected, 'b1', at, now)).toThrow(/empty/);
  });
});

describe('postHero settling', () => {
  it('settles before re-posting, so the hours already put in are kept', () => {
    const posted = postHero(saveWith([buildingIn('b1', { kind: 'herbGarden' })]), 'b1', 'bram', now);
    const again = postHero(posted, 'b1', 'bram', now + 10 * HOUR);
    expect(again.supply.buildings[0]).toMatchObject({ heroId: 'bram', postedAt: now + 10 * HOUR });
    expect(again.heroes.find((h) => h.id === 'bram')!.trade.hours).toBeCloseTo(10);
  });
});
