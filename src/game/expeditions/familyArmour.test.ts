import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';

const perRound = (f: FamilyFight) => f.fight.dealt.a / f.fight.rounds;
/** A boss that blocks 30% of a Power hit and never hurts back. */
const plated: FightSetup = { boss: { armour: 0.3, damage: 0 } };

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family armour', () => {
  test.each<Case>([
    ['natural armour blocks its share of a Power hit', 'breaker', 0, plated,
      (_on, off) => expect(perRound(off)).toBeCloseTo(10 * 0.7), 'breaker1', null, null],
    ['Breaker 1: +3% damage and 10% of the armour ignored', 'breaker', 1, plated,
      (on) => expect(perRound(on)).toBeCloseTo(10 * (1 - 0.3 * (1 - R.breaker.armourIgnore)) * R.breaker.damage), 'breaker1', 'a broke through the guard.', 'a a percé la garde.'],
    ['Breaker 1: the damage still counts without armour', 'breaker', 1, { boss: { damage: 0 } },
      (on, off) => expect(perRound(on)).toBeCloseTo(perRound(off) * R.breaker.damage), 'breaker1', 'a broke through the guard.', null],
    ['Breaker 1: nothing to ignore with Pierce, the damage counts', 'breaker', 1, { ...plated, party: { a: { classKeywords: ['pierce'] } } },
      (on) => expect(perRound(on)).toBeCloseTo(10 * R.breaker.damage), 'breaker1', 'a broke through the guard.', null],
    // The shred lasts the fight and comes once, with a stronger first blow on top of it.
    ['Breaker 3: the first hit lands harder and shreds 30% of the armour for the fight', 'breaker', 3, plated,
      (on) => expect(perRound(on)).toBeGreaterThan(10 * (1 - 0.3 * (1 - R.breaker.shred) * (1 - R.breaker.armourIgnore)) * R.breaker.damage), 'breaker3', 'a’s first blow landed with crushing force.', 'Le premier coup de a a frappé avec une force écrasante.'],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test('Breaker 3 shreds once in every fight of a run, each fight’s own first target', () => {
    const { run } = familyFight('breaker', 3, { ...plated, mobs: [{ mobId: 'brassBeetle', count: 1 }], party: { a: { power: 1000 } } });
    const fights = run.encounters.filter((e) => e.kind === 'fight' || e.kind === 'boss');
    expect(fights).toHaveLength(2);
    for (const fight of fights) expect(logged(fight, 'breaker3')).toBe(1);
  });
});
