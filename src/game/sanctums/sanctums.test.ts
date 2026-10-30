import { sanctumRules, sanctums } from '@/content/sanctums';

import { shardId, stoneId } from '../elements';
import { distanceMeters } from '../generation/geo';
import { tilesAround } from '../generation/tiles';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { pruneExpired } from '../upkeep';
import {
  challengeProblem,
  challengeSanctum,
  generateSanctumsAround,
  sanctumById,
  sanctumDungeon,
  type SanctumSpawn,
} from './sanctums';

const here = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;
const now = Date.UTC(2026, 9, 26, 12);
const ALL = ['bram', 'lyra', 'mira'];

const spawn = (sanctumId = 'emberForge'): SanctumSpawn => ({
  id: `sanctum:${sanctumId}:test:1:0`,
  sanctumId,
  position: here,
  expiresAt: now + DAY,
});

function party(sigils: number[], strong = false): SaveData {
  let save: SaveData = { ...createInitialSave(), sigils };
  if (strong) {
    save = {
      ...save,
      heroes: save.heroes.map((h) => ({ ...h, level: 9 })),
      gear: ['sword5', 'bow5', 'wand5', 'mail5', 'mail5', 'mail5'].map((itemId, i) => ({ uid: `g${i}`, itemId, quality: 'normal' })),
    };
    ALL.forEach((id, i) => {
      save = equip(save, id, 'weapon', `g${i}`);
      save = equip(save, id, 'armor', `g${i + 3}`);
    });
  }
  return save;
}

describe('Sanctum generation', () => {
  it('places a set number of Sanctums of random kinds per tile around the player', () => {
    const spawns = generateSanctumsAround(here, now);
    const tiles = tilesAround(here, sanctumRules.precision).length;
    expect(spawns.length).toBeGreaterThanOrEqual(tiles * sanctumRules.perTile[0]);
    expect(spawns.length).toBeLessThanOrEqual(tiles * sanctumRules.perTile[1]);
    for (const sanctum of sanctums) expect(spawns.filter((s) => s.sanctumId === sanctum.id).length).toBeGreaterThan(0);
  });

  it('usually has one within a few hundred metres, and only a few in sight', () => {
    const days = Array.from({ length: 30 }, (_, d) => generateSanctumsAround(here, now + d * DAY).map((s) => distanceMeters(here, s.position)));
    const nearest = days.map((ds) => Math.min(...ds)).sort((a, b) => a - b);
    expect(nearest[15]).toBeLessThan(700);
    const inSight = days.map((ds) => ds.filter((d) => d <= sanctumRules.visibilityMeters).length).sort((a, b) => a - b);
    expect(inSight[15]).toBeGreaterThanOrEqual(2);
    expect(inSight[15]).toBeLessThanOrEqual(8);
  });

  it('is the same for everyone in a window and changes after it', () => {
    expect(generateSanctumsAround(here, now)).toEqual(generateSanctumsAround(here, now + 3_600_000));
    const nextDay = generateSanctumsAround(here, now + DAY);
    expect(nextDay.map((s) => s.id)).not.toEqual(generateSanctumsAround(here, now).map((s) => s.id));
  });

  it('refreshes at the end of a 24 hour window', () => {
    const first = generateSanctumsAround(here, now)[0];
    expect(first.expiresAt % DAY).toBe(0);
    expect(first.expiresAt).toBeGreaterThan(now);
    expect(first.expiresAt).toBeLessThanOrEqual(now + DAY);
  });

  it('usually has every Sanctum type within a few kilometres', () => {
    const spawns = generateSanctumsAround(here, now);
    for (const sanctum of sanctums) {
      const nearest = Math.min(...spawns.filter((s) => s.sanctumId === sanctum.id).map((s) => distanceMeters(here, s.position)));
      expect(nearest).toBeLessThan(7000);
    }
  });
});

describe('challenging a Sanctum', () => {
  it('needs a Sigil of the chosen tier, range, and heroes at home', () => {
    expect(challengeProblem(party([]), spawn(), 1, ALL, here, now)).toBe('noSigil');
    expect(challengeProblem(party([2]), spawn(), 1, ALL, here, now)).toBe('noSigil');
    const far = { latitude: here.latitude + 0.01, longitude: here.longitude };
    expect(challengeProblem(party([1]), spawn(), 1, ALL, far, now)).toBe('tooFar');
    expect(challengeProblem(party([1]), spawn(), 1, [], here, now)).toBe('noHeroes');
    const away: SaveData = {
      ...party([1]),
      expeditions: [{ id: 'x', dungeonId: 'ratCellar', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
    };
    expect(challengeProblem(away, spawn(), 1, ALL, here, now)).toBe('heroAway');
    expect(challengeProblem(party([1]), spawn(), 1, ALL, here, now)).toBeNull();
  });

  it('allows one attempt per Sanctum spawn, win or lose, until it refreshes', () => {
    for (const strong of [true, false]) {
      const { save, result } = challengeSanctum(party([1, 1], strong), spawn(), 1, ALL, here, now);
      expect(result.win).toBe(strong);
      expect(save.sigils).toEqual([1]);
      expect(challengeProblem(save, spawn(), 1, ALL, here, now)).toBe('used');
      expect(pruneExpired(save, now + DAY).usedSanctums).toEqual({});
    }
  });

  it('is decided by the Sanctum and the save, so it is deterministic', () => {
    const a = challengeSanctum(party([1]), spawn(), 1, ALL, here, now);
    const b = challengeSanctum(party([1]), spawn(), 1, ALL, here, now);
    expect(a).toEqual(b);
    expect(a.result.log.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the chosen Sigil tier for the guardian', () => {
    expect(sanctumDungeon(sanctumById.emberForge, 3).boss.hp).toBeGreaterThan(sanctumDungeon(sanctumById.emberForge, 1).boss.hp);
    expect(sanctumDungeon(sanctumById.emberForge, 1).boss.element).toBe('fire');
    const { save } = challengeSanctum(party([1, 3]), spawn(), 3, ALL, here, now);
    expect(save.sigils).toEqual([1]);
  });
});

describe('Sanctum rewards', () => {
  it('pays shards or stones of the Sanctum element by tier, for wins and losses', () => {
    sanctumRules.rewards.forEach((tierRewards, i) => {
      const tier = i + 1;
      for (const strong of [true, false]) {
        const { save, result } = challengeSanctum(party([tier], strong), spawn('sunkenGrotto'), tier, ALL, here, now);
        const expected = tierRewards[result.win ? 'win' : 'loss'];
        expect(result.reward).toEqual({ element: 'water', ...expected, xp: expect.any(Number) });
        expect(save.materials[shardId('water')] ?? 0).toBe(expected.shards);
        expect(save.materials[stoneId('water')] ?? 0).toBe(expected.stones);
      }
    });
  });

  it('merges a tenth shard into a stone', () => {
    const save = { ...party([1], true), materials: { fireShard: 8 } };
    expect(challengeSanctum(save, spawn(), 1, ALL, here, now).save.materials).toEqual({ fireShard: 1, fireStone: 1 });
  });
});
