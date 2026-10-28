import { patrolRules } from '@/content/patrols';

import { offsetPosition } from '../generation/geo';
import { tileAt, tileBounds } from '../generation/tiles';
import { generateTilePatrols, isPatrolKind, patrolPositionAt, patrolTier, pruneByWindow } from './generate';
import { HOME, T0 } from './testHelpers';
import { fleesAt, hasFled, inEngageRange, isGone, isVisible } from './visibility';

const tile = tileAt(HOME, patrolRules.precision);
const many = Array.from({ length: 4000 }, (_, w) => generateTilePatrols(tile, 100_000 + w)).flat();

describe('patrol generation', () => {
  it('is the same for the same tile and window', () => {
    expect(generateTilePatrols(tile, 5)).toEqual(generateTilePatrols(tile, 5));
    expect(generateTilePatrols(tile, 5)).not.toEqual(generateTilePatrols(tile, 6));
  });

  it('spawns about one per tile per window, a sixth of them travellers', () => {
    expect(many.length / 4000).toBeGreaterThan(0.9);
    expect(many.length / 4000).toBeLessThan(1.1);
    const travellers = many.filter((s) => !isPatrolKind(s.kind)).length / many.length;
    expect(travellers).toBeGreaterThan(0.15);
    expect(travellers).toBeLessThan(0.25);
  });

  it('rolls tiers 60/30/10 around the highest unlocked tier', () => {
    const patrols = many.filter((s) => isPatrolKind(s.kind));
    const share = (roll: string) => patrols.filter((s) => s.tierRoll === roll).length / patrols.length;
    expect(share('current')).toBeCloseTo(0.6, 1);
    expect(share('below')).toBeCloseTo(0.3, 1);
    expect(share('elite')).toBeCloseTo(0.1, 1);
    const below = patrols.find((s) => s.tierRoll === 'below')!;
    const elite = patrols.find((s) => s.tierRoll === 'elite')!;
    expect(patrolTier(below, 3)).toEqual({ tier: 2, elite: false });
    expect(patrolTier(below, 1)).toEqual({ tier: 1, elite: false });
    expect(patrolTier(elite, 3)).toEqual({ tier: 3, elite: true });
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
    const goblins = many.find((s) => s.kind === 'goblins')!;
    const herd = many.find((s) => s.kind === 'herd')!;
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
