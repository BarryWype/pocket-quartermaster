import { heroClasses, newHero } from '@/content/heroes';
import { recruitRules, rosterRules } from '@/content/roster';

import { createInitialSave, type SaveData } from '../save';
import { claimFreePick, freePickClasses, freePickProblem } from './freePick';
import { offerLevel, recruitPool } from './taverns';

const afterBoss = (extra: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), clearedDungeons: ['banditStockade'], ...extra });
const familyOf = (classId: keyof typeof heroClasses) => heroClasses[classId].familyTag;

describe('the free pick', () => {
  it('offers three classes of the next tier’s pool, of three families the roster has none of', () => {
    const save = afterBoss();
    const choices = freePickClasses(save);
    expect(choices).toHaveLength(recruitRules.freePick.choices);
    const pool = recruitPool(recruitRules.freePick.poolTier).map((p) => p.classId);
    const held = new Set(save.heroes.map((h) => familyOf(h.classId)));
    for (const classId of choices) {
      expect(pool).toContain(classId);
      expect(held.has(familyOf(classId))).toBe(false);
    }
    expect(new Set(choices.map(familyOf)).size).toBe(choices.length);
    expect(freePickClasses(save)).toEqual(choices);
  });

  it('takes families the roster has only when too few others are left', () => {
    const pool = recruitPool(recruitRules.freePick.poolTier).map((p) => p.classId);
    // A roster of one hero of every family but one.
    const families = [...new Set(pool.map(familyOf))];
    const heroes = families.slice(1).map((family, i) => newHero(`h${i}`, 'X', pool.find((c) => familyOf(c) === family)!, 'tough'));
    const choices = freePickClasses(afterBoss({ heroes }));
    expect(choices).toHaveLength(3);
    expect(choices.map(familyOf)).toContain(families[0]);
    expect(new Set(choices.map(familyOf)).size).toBe(3);
  });

  it('adds the chosen hero for free at the offers’ level and is then gone', () => {
    const save = { ...afterBoss(), gold: 7 };
    const [classId] = (save.freePick = freePickClasses(save));
    const after = claimFreePick(save, classId);
    const hero = after.heroes.at(-1)!;
    expect(hero.classId).toBe(classId);
    expect(hero.level).toBe(offerLevel(save));
    expect(after.gold).toBe(7);
    expect(after.freePick).toBeNull();
    expect(freePickProblem(after, classId)).toBe('none');
  });

  it('waits while the roster is full', () => {
    const save = afterBoss();
    save.freePick = freePickClasses(save);
    const cap = rosterRules.startCap + rosterRules.perBoss;
    const full = { ...save, heroes: Array.from({ length: cap }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough')) };
    expect(freePickProblem(full, save.freePick[0])).toBe('rosterFull');
    expect(() => claimFreePick(full, save.freePick![0])).toThrow();
  });
});
