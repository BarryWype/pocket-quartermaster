import { dungeons } from '@/content/dungeons';
import { secretRules } from '@/content/secrets';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing, SecretTip } from '../types';
import { launchUnderwater, underwaterBriefing, underwaterDungeonFor, underwaterLaunchProblem } from './dungeon';
import type { PlaceSpawn } from '../places/generate';
import { secretPlaceId } from './tips';

const ALL = ['bram', 'lyra', 'mira'];
const HOUR = 3_600_000;
const now = 0;
const anchor: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };
const BOSSES = dungeons.filter((d) => d.isBoss).map((d) => d.id);

const tip: SecretTip = {
  id: 'underwaterDungeon|dock-1',
  secret: 'underwaterDungeon',
  source: 'fishingDock',
  sourceId: 'dock-1',
  anchor,
  foundAt: now,
  expiresAt: now + secretRules.lifetimeHours * HOUR,
};

const place: PlaceSpawn = {
  id: secretPlaceId(tip),
  kind: 'underwaterDungeon',
  group: 'secret',
  tile: 'secret',
  position: anchor,
  startsAt: tip.foundAt,
  expiresAt: tip.expiresAt,
  roll: 0,
};

/** The tipped save at tier 1: one key in hand, the party's starting gear. */
const base = (): SaveData => ({
  ...createInitialSave(),
  tutorial: { ...createInitialSave().tutorial, step: 'done' },
  secretTips: [tip],
  keyFragments: 4,
  gear: [
    { uid: 'g1', itemId: 'sword1', quality: 'normal' },
    { uid: 'g2', itemId: 'bow1', quality: 'normal' },
    { uid: 'g3', itemId: 'wand1', quality: 'normal' },
    { uid: 'g4', itemId: 'mail1', quality: 'normal' },
  ],
  nextUid: 10,
});

/** Every tier revealed, for the tier 5 briefings and the vault's stockade. */
const veteran = (): SaveData => ({ ...base(), clearedDungeons: BOSSES });

/** The geared party, levelled so the deep fights are winnable. */
const strong = (save: SaveData, level: number): SaveData => {
  let geared = equip(save, 'bram', 'weapon', 'g1');
  geared = equip(geared, 'lyra', 'weapon', 'g2');
  geared = equip(geared, 'mira', 'weapon', 'g3');
  geared = equip(geared, 'bram', 'armor', 'g4');
  return { ...geared, heroes: geared.heroes.map((h) => ({ ...h, level })) };
};

/** Launches and resolves the tipped underwater dungeon over many seeds. */
const runs = (save: SaveData, level: number, count = 200) =>
  Array.from({ length: count }, (_, i) => {
    const launched = launchUnderwater({ ...strong(save, level), nextUid: 100 + i }, place, ALL, anchor, now);
    return resolveExpedition(launched, launched.expeditions[0]);
  });

describe('the underwater briefing', () => {
  it('starts with Underwater at the tier level and never repeats it', () => {
    const briefing = underwaterBriefing(base(), place);
    expect(underwaterDungeonFor(base()).id).toBe('underwater1');
    expect(briefing.threats[0]).toEqual({ id: 'underwater', level: secretRules.underwaterLevelByTier[0] });
    expect(briefing.threats.filter((t) => t.id === 'underwater')).toHaveLength(1);

    const deep = underwaterDungeonFor(veteran());
    const deepBriefing = underwaterBriefing(veteran(), place);
    expect(deep.tier).toBe(5);
    expect(deepBriefing.threats[0]).toEqual({ id: 'underwater', level: secretRules.underwaterLevelByTier[4] });
    expect(new Set(deepBriefing.threats.map((t) => t.id)).size).toBe(deepBriefing.threats.length);
    expect(deepBriefing.threats).toHaveLength(2);
  });

  it('is only Underwater at tier 1', () => {
    expect(underwaterBriefing(base(), place).threats).toEqual([
      { id: 'underwater', level: secretRules.underwaterLevelByTier[0] },
    ]);
  });
});

describe('launchUnderwater', () => {
  it('spends a key, uses the place up, and starts the tipped dungeon', () => {
    const save = strong(base(), 1);
    const next = launchUnderwater(save, place, ALL, anchor, now);
    expect(next.keyFragments).toBe(0);
    expect(next.usedPlaces[place.id]).toBe(place.expiresAt);
    expect(next.expeditions).toHaveLength(1);
    expect(next.expeditions[0].dungeonId).toBe('underwater1');
    expect(next.expeditions[0].briefing!.threats[0].id).toBe('underwater');
  });

  it('refuses a place with no tip, too far, or no key', () => {
    expect(underwaterLaunchProblem({ ...createInitialSave(), keyFragments: 4 }, place, anchor, now)).toBe('gone');
    expect(underwaterLaunchProblem(strong(base(), 1), place, far, now)).toBe('tooFar');
    const keyless = strong({ ...base(), keyFragments: 0 }, 1);
    expect(underwaterLaunchProblem(keyless, place, anchor, now)).toBe('noKey');
    expect(() => launchUnderwater(keyless, place, ALL, anchor, now)).toThrow();
  });
});

describe('the underwater run', () => {
  it('claims the prize on a win, with no first-win or first-clear', () => {
    const save = strong(base(), 15);
    const results = runs(save, 15);
    const wins = results.filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    for (const { report, save: after } of wins) {
      expect(report.prize).toBeDefined();
      expect(report.prize!.dropped.length).toBeGreaterThan(0);
      expect(report.firstWin).toBeUndefined();
      expect(report.firstTierClear).toBeUndefined();
      expect(after.firstWinDay).toBe(save.firstWinDay);
      expect(after.clearedDungeons).not.toContain('underwater1');
    }
  });
});

describe('the Sealed vault', () => {
  const briefing: Briefing = { threats: [], restriction: null, opportunity: 'sealedVault' };

  /** Launches and resolves a bandit stockade run under the vault's briefing over many seeds. */
  const vaultRuns = (save: SaveData, optIn: boolean, count = 100) =>
    Array.from({ length: count }, (_, i) => {
      const started = startExpedition(
        { ...save, nextUid: 100 + i },
        'banditStockade',
        ALL,
        0,
        1,
        undefined,
        { optIn },
        briefing,
      );
      return resolveExpedition(started, started.expeditions[0]);
    });

  it('spends its key at launch when opted in, and nothing otherwise', () => {
    const save = strong(veteran(), 3);
    const opted = startExpedition(save, 'banditStockade', ALL, 0, 1, undefined, { optIn: true }, briefing);
    expect(opted.keyFragments).toBe(0);
    const plain = startExpedition(save, 'banditStockade', ALL, 0, 1, undefined, { optIn: false }, briefing);
    expect(plain.keyFragments).toBe(4);
    const keyless = strong({ ...save, keyFragments: 0 }, 3);
    expect(() => startExpedition(keyless, 'banditStockade', ALL, 0, 1, undefined, { optIn: true }, briefing)).toThrow();
  });

  it('adds the prize to a won run, and none to a lost run with the key spent', () => {
    const save = strong(veteran(), 10);
    const results = vaultRuns(save, true);
    const wins = results.filter((r) => r.report.success);
    const losses = results.filter((r) => !r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    expect(losses.length).toBeGreaterThan(0);
    for (const { report } of wins) {
      expect(report.prize).toBeDefined();
      expect(report.prize!.dropped.length).toBeGreaterThan(0);
    }
    for (const { report, save: after } of losses) {
      expect(report.prize).toBeUndefined();
      expect(after.keyFragments).toBe(0);
    }
  });

  it('adds no prize without opting in', () => {
    const results = vaultRuns(strong(veteran(), 10), false).filter((r) => r.report.success);
    expect(results.length).toBeGreaterThan(0);
    for (const { report } of results) expect(report.prize).toBeUndefined();
  });
});
