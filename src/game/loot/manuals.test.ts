import { xpToNextLevel } from '@/content/heroes';

import { createInitialSave } from '../save';
import { manualXp, readManual } from './manuals';

describe('training manuals', () => {
  it('gives the manual XP below the tier band cap', () => {
    // A common manual at tier 1: 60 XP, a hero from level 1 can take all of it.
    expect(manualXp({ level: 1, xp: 0 }, 'common', 1)).toBe(60);
    // Part-way through level 2: the cap is the XP still needed to reach level 3.
    expect(manualXp({ level: 2, xp: 25 }, 'common', 1)).toBe(xpToNextLevel(2) - 25);
  });

  it('caps at the top of the tier band', () => {
    const legendaryAtTier1 = 400;
    const fromLevel1 = xpToNextLevel(1) + xpToNextLevel(2);
    expect(manualXp({ level: 1, xp: 0 }, 'legendary', 1)).toBe(Math.min(legendaryAtTier1, fromLevel1));
    expect(manualXp({ level: 1, xp: 0 }, 'legendary', 1)).toBeLessThan(legendaryAtTier1);
  });

  it('gives nothing to a hero already at the top', () => {
    expect(manualXp({ level: 3, xp: 0 }, 'legendary', 1)).toBe(0);
    expect(manualXp({ level: 3, xp: 50 }, 'common', 1)).toBe(0);
    expect(manualXp({ level: 15, xp: 0 }, 'legendary', 5)).toBe(0);
  });
});

describe('readManual', () => {
  it('raises the hero by the capped XP and uses the manual up', () => {
    const base = createInitialSave();
    const save = { ...base, manuals: { common: 1 }, heroes: base.heroes.map((h) => ({ ...h, level: 1, xp: 0 })) };
    const hero = save.heroes[0];
    const next = readManual(save, hero.id, 'common');
    expect(next.manuals.common).toBe(0);
    const after = next.heroes[0];
    expect(after.level > hero.level || after.xp > hero.xp).toBe(true);
    expect(after.level).toBeLessThanOrEqual(3);
    expect(() => readManual(next, hero.id, 'common')).toThrow();
  });
});
