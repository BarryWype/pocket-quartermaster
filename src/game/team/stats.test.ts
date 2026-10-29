import { growthRules, newHero, xpToNextLevel } from '@/content/heroes';

import { createInitialSave, type SaveData } from '../save';
import type { HeroClassDef, HeroRoll, StatKey } from '../types';
import { addXp } from './team';
import { approachScore, baseHeroStats, classBaseStats, heroApproachBonus, pendingApproachPicks, pickApproach, rollFactors } from './stats';

/** Every stat rolled at the same 3d6 sum, so one sum shows in every factor. */
const rollOf = (sum: number): HeroRoll => ({
  base: { hp: sum, power: sum, magic: sum, armour: sum, resistance: sum, evasion: sum, speed: sum, crit: sum },
  growth: { hp: sum, power: sum, magic: sum, armour: sum, resistance: sum, evasion: sum, speed: sum, crit: sum },
});

describe('rollFactors', () => {
  it('pulls ±15% on the base and ±8% on the growth per 7.5 points of sum', () => {
    expect(rollFactors(rollOf(18)).base.power).toBeCloseTo(0.15);
    expect(rollFactors(rollOf(18)).growth.power).toBeCloseTo(0.08);
    expect(rollFactors(rollOf(3)).base.hp).toBeCloseTo(-0.15);
  });

  it('treats a missing roll as the average: no pull anywhere', () => {
    const factors = rollFactors(undefined);
    for (const stat of ['hp', 'power', 'magic', 'armour', 'resistance', 'evasion', 'speed', 'crit'] as StatKey[]) {
      expect(factors.base[stat]).toBe(0);
      expect(factors.growth[stat]).toBe(0);
    }
  });
});

describe('baseHeroStats', () => {
  it('grows primaries every level', () => {
    // Warrior primaries: hp, power, armour.
    expect(baseHeroStats('warrior', 2).hp).toBe(30 + 8);
    expect(baseHeroStats('warrior', 4).power).toBe(4 + 2 * 3);
    expect(baseHeroStats('warrior', 10).armour).toBe(3 + 9);
  });

  it('grows secondaries only at the milestones', () => {
    // Warrior magic is a secondary: 0 until 5, then +2 per milestone reached.
    expect(baseHeroStats('warrior', 4).magic).toBe(0);
    expect(baseHeroStats('warrior', 5).magic).toBe(2);
    expect(baseHeroStats('warrior', 9).magic).toBe(2);
    expect(baseHeroStats('warrior', 15).magic).toBe(6);
  });

  it('gives Luck at the cap level', () => {
    expect(baseHeroStats('warrior', 14).luck).toBe(0);
    expect(baseHeroStats('warrior', 15).luck).toBe(growthRules.luck);
  });

  it('applies the roll to the base and the growth', () => {
    // +15% base, +8% growth on every stat: hp 30 → 34.5, primary step 8 → 8.64.
    expect(baseHeroStats('warrior', 2, rollOf(18)).hp).toBeCloseTo(30 * 1.15 + 8 * 1.08);
    expect(baseHeroStats('warrior', 2, rollOf(3)).hp).toBeCloseTo(30 * 0.85 + 8 * 0.92);
  });

  it('grows a half-rate stat at half a primary step per level', () => {
    const def: HeroClassDef = {
      name: 'Fake',
      emoji: '🧪',
      rarity: 'common',
      family: 'fighter',
      poolTier: 1,
      baseStats: { hp: 20, power: 2, magic: 0, armour: 1, resistance: 1, evasion: 0, speed: 5, crit: 5 },
      primary: ['hp', 'power', 'armour'],
      halfRate: 'resistance',
      damageStat: 'power',
      approaches: { might: 3, finesse: 1, wits: 1, faith: 1, presence: 2 },
      keywords: [],
      threat: 1,
      abilities: [],
    };
    expect(classBaseStats(def, 3, undefined).resistance).toBeCloseTo(1 + 0.5 * 2);
  });
});

const heroAt = (level: number) => ({ ...newHero('h1', 'H', 'warrior', 'resilient'), level });

describe('approach picks', () => {
  const saveAt = (level: number): SaveData => ({ ...createInitialSave(), heroes: [heroAt(level)] });

  it('is pending at the approach milestones and spent picks come off', () => {
    expect(pendingApproachPicks(heroAt(4))).toBe(0);
    expect(pendingApproachPicks(heroAt(5))).toBe(1);
    expect(pendingApproachPicks(heroAt(10))).toBe(2);
    const picked = { ...heroAt(10), approachPicks: ['might' as const] };
    expect(pendingApproachPicks(picked)).toBe(1);
  });

  it('throws when nothing is pending or the approach is at the cap', () => {
    expect(() => pickApproach(saveAt(4), 'h1', 'might')).toThrow(/pending/);
    // Warrior Might base 3: with the roll's +1 and one pick it is at the cap
    // of 5, so the one pick still pending must go elsewhere.
    let save = saveAt(10);
    save = pickApproach(save, 'h1', 'might');
    save = pickApproach(save, 'h1', 'finesse');
    expect(save.heroes[0].approachPicks).toEqual(['might', 'finesse']);
    expect(() => pickApproach(save, 'h1', 'wits')).toThrow(/pending/);
    const capped: SaveData = {
      ...createInitialSave(),
      heroes: [{ ...heroAt(10), roll: { ...rollOf(10), approach: 'might' as const }, approachPicks: ['might' as const] }],
    };
    expect(pendingApproachPicks(capped.heroes[0])).toBe(1);
    expect(approachScore(capped.heroes[0], 'might')).toBe(5);
    expect(() => pickApproach(capped, 'h1', 'might')).toThrow(/already at/);
    expect(pickApproach(capped, 'h1', 'wits').heroes[0].approachPicks).toEqual(['might', 'wits']);
  });

  it('counts the roll bonus as +1', () => {
    const hero = { ...heroAt(5), roll: { ...rollOf(10), approach: 'wits' as const } };
    expect(heroApproachBonus(hero)).toEqual({ wits: 1 });
    expect(approachScore(hero, 'wits')).toBe(2);
  });
});

describe('addXp at the cap', () => {
  it('gives nothing at 15 and never goes past it', () => {
    const maxed = addXp(heroAt(15), 1000);
    expect(maxed.level).toBe(15);
    expect(maxed.xp).toBe(0);
    expect(maxed).toEqual(heroAt(15));
    // Just short of the cap: enough XP to pass it lands on 15 with no XP.
    const climb = addXp({ ...heroAt(14), xp: xpToNextLevel(14) - 1 }, 1000);
    expect(climb.level).toBe(15);
    expect(climb.xp).toBe(0);
  });
});
