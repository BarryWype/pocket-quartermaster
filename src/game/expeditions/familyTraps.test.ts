import { dungeons } from '@/content/dungeons';
import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { newHero } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { createInitialSave } from '@/game/save';
import type { Briefing, DungeonDef } from '@/game/types';

import { launchPlan } from './expeditions';
import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';

const trapsAt = (level: 1 | 2 | 3): Briefing => ({ threats: [{ id: 'traps', level }], restriction: null, opportunity: null });
/** A trap catching everyone, under a Traps threat of level 3, then a harmless boss. */
const trap: FightSetup = { traps: 1, boss: { hp: 1, damage: 0 }, options: { briefing: trapsAt(3) } };
const wounded = (f: FamilyFight) => f.fight.taken.a ?? 0;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family traps', () => {
  test.each<Case>([
    ['Cunning 1: a live trap’s wounds are halved', 'cunning', 1, trap,
      (on, off) => {
        expect(wounded(off)).toBeGreaterThan(0);
        expect(wounded(on)).toBeCloseTo(wounded(off) * R.cunning.trapTaken);
      }, 'cunning1', 'a spotted the trigger: the trap bit half as deep.', 'a a repéré le déclencheur : le piège a mordu deux fois moins fort.'],
    ['Cunning 1: no live trap, nothing to halve', 'cunning', 1, { ...trap, options: {} },
      (on) => expect(wounded(on)).toBe(0), 'cunning1', null, null],
    // Level 2 is one short of the level 3 threat: half its wounds, then Cunning 1 halves them again.
    ['Cunning 2: Cunning 1 still halves the trap', 'cunning', 2, trap,
      (on, off) => expect(wounded(on)).toBeCloseTo(wounded(off) * 0.5 * R.cunning.trapTaken), 'cunning1', 'a spotted the trigger: the trap bit half as deep.', null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  describe('Cunning 2: dungeon expeditions take 15% less time', () => {
    /** Thieves carry a Cunning tag each: four make Cunning 2, two Cunning 1. */
    const minutes = (thieves: number, dungeon: DungeonDef) => {
      const heroes = Array.from({ length: thieves }, (_, i) => newHero(`t${i}`, `t${i}`, 'thief', 'resilient'));
      const save = { ...createInitialSave(), heroes, tutorial: { ...createInitialSave().tutorial, step: 'done' as const } };
      return launchPlan(save, dungeon, heroes.map((h) => h.id)).minutes;
    };
    const overnight = dungeons.find((d) => d.overnight)!;

    test('a Cunning 2 party takes 15% less time', () => {
      expect(minutes(4, dungeonById.ratCellar)).toBeCloseTo(minutes(2, dungeonById.ratCellar) * (1 - R.cunning.timeCut));
    });
    test('Cunning 1 saves no time', () => {
      expect(minutes(2, dungeonById.ratCellar)).toBeCloseTo(dungeonById.ratCellar.durationMinutes);
    });
    test('a patrol takes its full time', () => {
      expect(minutes(4, overnight)).toBeCloseTo(minutes(2, overnight));
    });
  });
});
