import { classSpecials } from '@/content/classSpecials';
import { specialRules } from '@/content/specials';
import type { HeroClassId } from '@/game/types';

import { createRng } from '../generation/rng';
import { isRareSpecial, rollSpecial, rolledSpecial } from './specials';

describe('rollSpecial', () => {
  it('is deterministic per seed', () => {
    expect(rollSpecial(createRng('seed'), 'warrior')).toBe(rollSpecial(createRng('seed'), 'warrior'));
  });

  it('rolls the rare share of the time over many seeds', () => {
    let rare = 0;
    const rolls = 5000;
    for (let i = 0; i < rolls; i++) {
      if (isRareSpecial('warrior', rollSpecial(createRng(`rare|${i}`), 'warrior'))) rare++;
    }
    expect(rare / rolls).toBeGreaterThan(specialRules.rareChance - 0.02);
    expect(rare / rolls).toBeLessThan(specialRules.rareChance + 0.02);
  });

  it('reaches every common and the rare of every class', () => {
    for (const classId of Object.keys(classSpecials) as HeroClassId[]) {
      const pool = classSpecials[classId];
      const seen = new Set<string>();
      for (let i = 0; i < 2000 && seen.size < 4; i++) seen.add(rollSpecial(createRng(`pool|${classId}|${i}`), classId));
      expect([...seen]).toEqual(expect.arrayContaining([...pool.common, pool.rare]));
    }
  });

  it('rolls the same special for the same hero id', () => {
    expect(rolledSpecial('h1', 'cleric')).toBe(rolledSpecial('h1', 'cleric'));
    expect([...classSpecials.cleric.common, classSpecials.cleric.rare]).toContain(rolledSpecial('h1', 'cleric'));
  });
});
