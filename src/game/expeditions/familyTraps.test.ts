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
    // A boss of 1000 HP and a hero whose own blows barely scratch it: the trap's 100 HP is all the difference.
    ['Cunning 1: as the fight starts, a trap takes 10% of an enemy’s HP', 'cunning', 1, { boss: { hp: 1000, damage: 0 }, party: { a: { power: 0.001 } } },
      (on, off) => expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(1000 * R.cunning.trapHit, 1),
      'cunning1', 'a sprang a trap on the enemy as the fight began.', 'a a déclenché un piège sur l’ennemi au début du combat.'],
    // Cunning 2's 4 tags answer any Traps threat: no trap is live.
    ['Cunning 2: the threat is answered, the trap never springs', 'cunning', 2, trap,
      (on, off) => {
        expect(wounded(off)).toBeGreaterThan(0);
        expect(wounded(on)).toBe(0);
      }, 'cunning1', null, null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test('Cunning 1 springs its trap in every fight, the boss’s included', () => {
    const { run } = familyFight('cunning', 1, { mobs: [{ mobId: 'giantRat', count: 3 }], fights: 2, party: { a: { power: 1000, maxHp: 1e6 } } });
    expect(run.encounters.map((e) => [e.kind, logged(e, 'cunning1')])).toEqual([
      ['fight', 1],
      ['fight', 1],
      ['boss', 1],
    ]);
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
