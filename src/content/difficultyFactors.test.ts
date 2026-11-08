import { dungeons } from '@/content/dungeons';
import { PATROL_KINDS } from '@/game/patrols/generate';
import { tierChain } from '@/game/dungeons/unlock';
import { placeFightRules } from '@/content/placeFights';

import { dungeonFactors, patrolFactors, placeFactors } from './difficultyFactors';

// The generated factor file's shape: every fitted source has its entry, so
// enemies.ts never falls back to a hand-tuned literal.

describe('difficultyFactors', () => {
  it('gives every chain dungeon a factor', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      for (const dungeon of tierChain(tier).filter((d) => (d.chainIndex ?? 6) < 6)) {
        expect(dungeonFactors[dungeon.id]).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every tier boss key', () => {
    for (const key of ['banditStockadeBoss', 'ogreQuarry', 'drownedCrypt', 'giantsHall', 'dragonLairBoss']) expect(dungeonFactors[key]).toBeGreaterThan(0);
  });

  it('gives every patrol kind a factor per tier', () => {
    for (const kind of PATROL_KINDS) expect(patrolFactors[kind]).toHaveLength(5);
    expect(Object.keys(patrolFactors)).toHaveLength(PATROL_KINDS.length);
  });

  it('gives every fight event kind a factor per tier', () => {
    const kinds = Object.keys(placeFightRules.kinds) as (keyof typeof placeFactors)[];
    for (const kind of kinds) expect(placeFactors[kind]).toHaveLength(5);
    expect(Object.keys(placeFactors)).toHaveLength(kinds.length);
  });

  it('only names dungeons that exist', () => {
    for (const id of Object.keys(dungeonFactors)) expect(dungeons.some((d) => d.id === id || id === 'dragonLairBoss' || id === 'banditStockadeBoss')).toBe(true);
  });
});
