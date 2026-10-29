import { growthRules } from '@/content/heroes';
import { recruitRules } from '@/content/roster';

import { createInitialSave, type SaveData } from '../save';
import { STAT_KEYS } from '../team/stats';
import type { HeroRoll, StatKey } from '../types';
import { recruitGrade, gradePriceMultiplier, rollRecruit, statArrows, type Grade } from './roll';
import { recruit, recruitPrice, tavernOffers } from './taverns';

const here = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 9, 26, 12);

/** A hand-built roll whose 16 sums total 168 + `delta`; `pair` overrides one stat's base and growth sums. */
const rollTotalling = (delta: number, stat: StatKey = 'hp', pair: [number, number] = [10.5, 10.5]): HeroRoll => {
  const rest = (STAT_KEYS.length * 2 * growthRules.roll.average + delta - pair[0] - pair[1]) / (STAT_KEYS.length * 2 - 2);
  const sums = (first: number) =>
    Object.fromEntries(STAT_KEYS.map((s) => [s, s === stat ? first : rest])) as Record<StatKey, number>;
  return { base: sums(pair[0]), growth: sums(pair[1]) };
};

describe('rollRecruit', () => {
  it('draws every sum in 3–18', () => {
    for (const id of ['tavern:a:0:0', 'tavern:b:3:1', 'tavern:c:9:2', 'tavern:d:1:0']) {
      const roll = rollRecruit(id);
      for (const sum of [...STAT_KEYS.map((s) => roll.base[s]), ...STAT_KEYS.map((s) => roll.growth[s])]) {
        expect(sum).toBeGreaterThanOrEqual(3);
        expect(sum).toBeLessThanOrEqual(18);
      }
      if (roll.approach) expect(['might', 'finesse', 'wits', 'faith', 'presence']).toContain(roll.approach);
    }
  });

  it('is deterministic per offer id, and different ids roll differently', () => {
    expect(rollRecruit('tavern:a:0:0')).toEqual(rollRecruit('tavern:a:0:0'));
    const ids = Array.from({ length: 20 }, (_, i) => `tavern:x:${i}:0`);
    expect(new Set(ids.map((id) => JSON.stringify(rollRecruit(id)))).size).toBe(ids.length);
  });
});

describe('recruitGrade', () => {
  it('grades the thresholds', () => {
    expect(recruitGrade(rollTotalling(18))).toBe('S');
    expect(recruitGrade(rollTotalling(17))).toBe('A');
    expect(recruitGrade(rollTotalling(6))).toBe('A');
    expect(recruitGrade(rollTotalling(5))).toBe('B');
    expect(recruitGrade(rollTotalling(-6))).toBe('B');
    expect(recruitGrade(rollTotalling(-7))).toBe('C');
  });

  it('spreads grades over many ids: rare S, common C', () => {
    const grades = Array.from({ length: 2000 }, (_, i) => recruitGrade(rollRecruit(`tavern:x:day:${i}`)));
    const share = (grade: Grade) => grades.filter((g) => g === grade).length / grades.length;
    expect(share('S')).toBeLessThan(0.15);
    expect(share('C')).toBeGreaterThan(0.15);
  });
});

describe('statArrows', () => {
  it('marks pairs 3 away from the 21 average', () => {
    expect(statArrows(rollTotalling(0, 'hp', [12, 12])).hp).toBe('up');
    expect(statArrows(rollTotalling(0, 'hp', [12, 11]))).toEqual({});
    expect(statArrows(rollTotalling(0, 'hp', [9, 9])).hp).toBe('down');
    expect(statArrows(rollTotalling(0, 'hp', [10, 9]))).toEqual({});
  });
});

describe('grade price', () => {
  it('multiplies the price: C < B < A < S, B today', () => {
    const price = (grade: Grade) => recruitPrice('common', 1, 3, true, 1, grade);
    expect(price('C')).toBeLessThan(price('B'));
    expect(price('B')).toBeLessThan(price('A'));
    expect(price('A')).toBeLessThan(price('S'));
    expect(price('B')).toBe(recruitPrice('common', 1, 3, true));
    expect(gradePriceMultiplier('B')).toBe(1);
  });
});

describe('offers and recruiting', () => {
  const save: SaveData = { ...createInitialSave(), clearedDungeons: ['banditStockade'], gold: 10_000 };

  it('gives every offer a roll and its grade', () => {
    const offers = tavernOffers(save, 'tavern:t:0', now);
    expect(offers).toHaveLength(recruitRules.offersPerTavern);
    for (const offer of offers) {
      expect(offer.roll).toEqual(rollRecruit(offer.id));
      expect(offer.grade).toBe(recruitGrade(offer.roll));
    }
  });

  it('stores the offer roll on the new hero, teaches no recipe and no mastery', () => {
    const offer = tavernOffers(save, 'tavern:t:0', now)[0];
    const after = recruit(save, offer, here, here);
    const hero = after.heroes[after.heroes.length - 1];
    expect(hero.roll).toEqual(offer.roll);
    expect(after.knownRecipes).toEqual(save.knownRecipes);
    expect(after.mastery).toEqual(save.mastery);
  });
});
