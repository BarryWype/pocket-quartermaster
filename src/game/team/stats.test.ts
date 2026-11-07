import { growthRules, newHero, xpToNextLevel } from '@/content/heroes';

import { createInitialSave, type SaveData } from '../save';
import type { HeroClassDef, HeroRoll, StatKey } from '../types';
import { rollRecruit } from '../taverns/roll';
import { addXp, heroDamageStat, heroStats } from './team';
import {
  baseHeroStats,
  classBaseStats,
  rollFactors,
  rollGamblerPrimary,
} from './stats';

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
      icon: 0,
      rarity: 'common',
      family: 'fighter',
      familyTag: 'bulwark',
      poolTier: 1,
      baseStats: { hp: 20, power: 2, magic: 0, armour: 1, resistance: 1, evasion: 0, speed: 5, crit: 5 },
      primary: ['hp', 'power', 'armour'],
      halfRate: 'resistance',
      damageStat: 'power',
      keywords: [],
      threat: 1,
      abilities: [],
    };
    expect(classBaseStats(def, 3, undefined).resistance).toBeCloseTo(1 + 0.5 * 2);
  });
});

const heroAt = (level: number) => ({ ...newHero('h1', 'H', 'warrior', 'resilient'), level });

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

describe('half-rate damage stat', () => {
  it('grows half a step per level for the Smuggler, Porter and Cook (Power) and the Diplomat (Magic)', () => {
    for (const classId of ['smuggler', 'porter', 'cook'] as const) {
      // Half a step per level instead of the milestone steps.
      expect(baseHeroStats(classId, 5).power - baseHeroStats(classId, 1).power).toBe(4 * (growthRules.steps.power / 2));
    }
    expect(baseHeroStats('diplomat', 4).magic).toBe(3 + 3);
    expect(baseHeroStats('warrior', 4).magic).toBe(0);
  });
});

describe('flasks (wielder damage stat)', () => {
  const flaskSave = (classId: 'sorcerer' | 'warrior') => {
    const hero = { ...newHero('h1', 'H', classId, ''), equipment: { ...newHero('h1', 'H', classId, '').equipment, weapon: 'f1' } };
    const save: SaveData = {
      ...createInitialSave(),
      heroes: [hero],
      gear: [{ uid: 'f1', itemId: 'flasks1', rarity: 'common', roll: 10.5, affixes: [], rerolls: 0 }],
    };
    return { save, hero };
  };
  const bareStats = (classId: 'sorcerer' | 'warrior') => heroStats(createInitialSave(), newHero('h1', 'H', classId, ''));

  it("a flask's Power is added to the wielder's damage stat", () => {
    // flasks1 rolls 5 Power at the average dice; a magic class gets it as Magic.
    const mage = flaskSave('sorcerer');
    const withFlask = heroStats(mage.save, mage.hero);
    expect(withFlask.magic - bareStats('sorcerer').magic).toBeGreaterThan(4);
    expect(withFlask.magic - bareStats('sorcerer').magic).toBeLessThan(7);
    expect(withFlask.power).toBe(bareStats('sorcerer').power);
    // A power class gets it as Power.
    const fighter = flaskSave('warrior');
    const fighterStats = heroStats(fighter.save, fighter.hero);
    expect(fighterStats.power - bareStats('warrior').power).toBeGreaterThan(4);
    expect(fighterStats.power - bareStats('warrior').power).toBeLessThan(7);
    expect(fighterStats.magic).toBe(bareStats('warrior').magic);
  });

  it('heroDamageStat resolves a flask to the class damage stat', () => {
    expect(heroDamageStat(flaskSave('sorcerer').save, flaskSave('sorcerer').hero)).toBe('magic');
    expect(heroDamageStat(flaskSave('warrior').save, flaskSave('warrior').hero)).toBe('power');
  });
});

describe('the Gambler', () => {
  it('rolls a third primary stat at recruitment, never Speed or Crit, the same for an offer', () => {
    const seen = new Set<StatKey>();
    for (let i = 0; i < 200; i++) {
      const roll = rollRecruit(`offer${i}`, undefined, 'gambler');
      expect(roll.primary).toBe(rollRecruit(`offer${i}`, undefined, 'gambler').primary);
      seen.add(roll.primary!);
    }
    expect([...seen].sort()).toEqual(['armour', 'evasion', 'hp', 'magic', 'power', 'resistance']);
    expect(rollRecruit('offer1', undefined, 'thief').primary).toBeUndefined();
    expect(rollGamblerPrimary('x')).toBe(rollGamblerPrimary('x'));
  });

  it('grows the third primary every level, and rolls with Magic unarmed when it is Magic', () => {
    const roll = { ...rollOf(10.5), primary: 'magic' as const };
    expect(baseHeroStats('gambler', 4, roll).magic).toBe(3 + 3 * growthRules.steps.magic);
    expect(baseHeroStats('gambler', 4).magic).toBe(3);
    const hero = { ...newHero('g', 'G', 'gambler', ''), roll };
    expect(heroDamageStat({ ...createInitialSave(), heroes: [hero] }, hero)).toBe('magic');
  });
});
