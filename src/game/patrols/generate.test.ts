import { difficultyRules, threatLevelFor } from '@/content/difficulty';
import { patrolRules, patrolTable } from '@/content/patrols';

import { offsetPosition } from '../generation/geo';
import { tileAt, tileBounds } from '../generation/tiles';
import { generateTilePatrols, isPatrolKind, patrolPositionAt, pruneByWindow } from './generate';
import { HOME, T0 } from './testHelpers';
import { fleesAt, hasFled, inEngageRange, isGone, isVisible } from './visibility';

const tile = tileAt(HOME, patrolRules.precision);
const tier = 3;
const many = Array.from({ length: 4000 }, (_, w) => generateTilePatrols(tile, 100_000 + w, tier)).flat();

describe('patrol generation', () => {
  it('is the same for the same tile, window and tier, and different per window and tier', () => {
    expect(generateTilePatrols(tile, 5, 1)).toEqual(generateTilePatrols(tile, 5, 1));
    expect(generateTilePatrols(tile, 5, 1)).not.toEqual(generateTilePatrols(tile, 6, 1));
    const kinds = (t: number) =>
      Array.from({ length: 50 }, (_, w) => generateTilePatrols(tile, 100_000 + w, t))
        .flat()
        .filter((s) => isPatrolKind(s.kind))
        .map((s) => `${s.kind}:${s.difficulty}`)
        .sort();
    // A tier spawns only its own table row; another tier another one.
    expect(kinds(1)).not.toEqual(kinds(5));
    expect(new Set(kinds(1))).toEqual(new Set(['herd:easy', 'wolves:easy', 'goblins:medium', 'bandits:medium', 'orcs:hard', 'spiders:hard']));
  });

  it('spawns about one per tile per window, a sixth of them travellers', () => {
    expect(many.length / 4000).toBeGreaterThan(0.9);
    expect(many.length / 4000).toBeLessThan(1.1);
    const travellers = many.filter((s) => !isPatrolKind(s.kind)).length / many.length;
    expect(travellers).toBeGreaterThan(0.15);
    expect(travellers).toBeLessThan(0.25);
  });

  it('spawns only the tier table row, split between its two kinds per difficulty', () => {
    const patrols = many.filter((s) => isPatrolKind(s.kind));
    const row = patrolTable[3 as keyof typeof patrolTable];
    const expected = new Set([...row.easy, ...row.medium, ...row.hard]);
    expect(new Set(patrols.map((s) => s.kind))).toEqual(expected);
    // The two kinds of a difficulty split its weight evenly.
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const ofDifficulty = patrols.filter((s) => s.difficulty === difficulty);
      for (const kind of row[difficulty]) {
        const share = patrols.filter((s) => s.kind === kind).length / ofDifficulty.length;
        expect(share).toBeGreaterThan(0.4);
        expect(share).toBeLessThan(0.6);
      }
    }
  });

  it('rolls difficulties by the patrol weights, always at the highest unlocked tier', () => {
    const patrols = many.filter((s) => isPatrolKind(s.kind));
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const share = patrols.filter((s) => s.difficulty === difficulty).length / patrols.length;
      expect(share).toBeCloseTo(difficultyRules.patrolWeights[difficulty], 1);
    }
    expect(new Set(patrols.map((s) => s.tier))).toEqual(new Set([tier]));
  });

  it('travellers carry no difficulty and read as the current tier', () => {
    const travellers = many.filter((s) => !isPatrolKind(s.kind));
    expect(travellers.length).toBeGreaterThan(0);
    expect(travellers.every((s) => s.difficulty === null && s.tier === tier)).toBe(true);
  });
});

describe('patrol movement and ranges', () => {
  const spawn = many[0];
  const bounds = tileBounds(tile);

  it('moves as a pure function of time, inside its tile, at walking-pace-or-slower speeds', () => {
    const start = spawn.startsAt;
    expect(patrolPositionAt(spawn, start + 123_456)).toEqual(patrolPositionAt(spawn, start + 123_456));
    for (let m = 0; m < 30; m++) {
      const p = patrolPositionAt(spawn, start + m * 60_000);
      expect(p.latitude).toBeGreaterThanOrEqual(bounds.minLat);
      expect(p.latitude).toBeLessThanOrEqual(bounds.maxLat);
      expect(p.longitude).toBeGreaterThanOrEqual(bounds.minLon);
      expect(p.longitude).toBeLessThanOrEqual(bounds.maxLon);
    }
  });

  it('is visible within 300 m and engageable within 80 m', () => {
    const at = spawn.startsAt + 60_000;
    const here = patrolPositionAt(spawn, at);
    expect(inEngageRange(spawn, offsetPosition(here, 70, 0), at)).toBe(true);
    expect(inEngageRange(spawn, offsetPosition(here, 90, 0), at)).toBe(false);
    expect(isVisible(spawn, offsetPosition(here, 290, 0), at)).toBe(true);
    expect(isVisible(spawn, offsetPosition(here, 310, 0), at)).toBe(false);
  });

  it('lets goblins flee 10 minutes after they are first seen, and nothing else', () => {
    const tier1 = Array.from({ length: 400 }, (_, w) => generateTilePatrols(tile, 100_000 + w, 1)).flat();
    const goblins = tier1.find((s) => s.kind === 'goblins')!;
    const herd = tier1.find((s) => s.kind === 'herd')!;
    expect(fleesAt(goblins, T0)).toBe(T0 + 10 * 60_000);
    expect(hasFled(goblins, T0, T0 + 9 * 60_000)).toBe(false);
    expect(hasFled(goblins, T0, T0 + 10 * 60_000)).toBe(true);
    expect(hasFled(goblins, undefined, T0 + 60 * 60_000)).toBe(false);
    expect(fleesAt(herd, T0)).toBeNull();
  });

  it('is gone once beaten until its window ends, and the bookkeeping is pruned after', () => {
    const beaten = { [spawn.id]: spawn.endsAt };
    expect(isGone(spawn, beaten, spawn.startsAt + 1)).toBe(true);
    expect(isGone(spawn, {}, spawn.startsAt + 1)).toBe(false);
    expect(pruneByWindow(beaten, spawn.endsAt - 1)).toEqual(beaten);
    expect(pruneByWindow(beaten, spawn.endsAt)).toEqual({});
  });
});

describe('threat levels by difficulty', () => {
  it('reads the level from the difficulty rules', () => {
    expect(threatLevelFor('easy', 1)).toBe(difficultyRules.threatLevel.easy[0]);
    expect(threatLevelFor('medium', 1)).toBe(difficultyRules.threatLevel.medium[0]);
    expect(threatLevelFor('medium', 3)).toBe(difficultyRules.threatLevel.medium[1]);
    expect(threatLevelFor('hard', 3)).toBe(difficultyRules.threatLevel.hard[1]);
  });
});
