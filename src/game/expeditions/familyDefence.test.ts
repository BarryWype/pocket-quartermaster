import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const taken = (f: FamilyFight, id = 'a') => f.fight.taken[id] ?? 0;
/** One boss hit on hero a without the family: the boss strikes once a round. */
const oneHit = (off: FamilyFight) => taken(off) / off.fight.rounds;
const sturdy = { a: { maxHp: 1e6 } };
const fire: FightSetup = { boss: { element: 'fire' }, party: sturdy };
/** A sweeping boss hits everyone: a, the front hero, and b, hurt and so the weakest. */
const pair: FightSetup = {
  party: { a: { threat: 2, maxHp: 1e6 }, b: { maxHp: 1000, hp: 500 } },
  boss: { effect: 'sweep', damage: 10 },
};

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family defence', () => {
  test.each<Case>([
    ['Bulwark 1: the front hero takes less damage', 'bulwark', 1, pair,
      (on, off) => {
        expect(taken(on) / taken(off)).toBeCloseTo(R.bulwark.frontTaken);
        expect(taken(on, 'b')).toBeCloseTo(taken(off, 'b'));
      }, 'bulwark1', 'a stood in front and took the blows.', 'a a tenu la première ligne et encaissé les coups.'],
    ['Bulwark 2: the front hero takes half the hits aimed at the weakest ally', 'bulwark', 2, pair,
      (on, off) => {
        expect(taken(on, 'b') / taken(off, 'b')).toBeCloseTo(1 - R.bulwark.guardShare);
        const moved = taken(off, 'b') * R.bulwark.guardShare;
        expect(taken(on)).toBeCloseTo((taken(off) + moved) * R.bulwark.frontTaken);
      }, 'bulwark2', 'The Bulwark held: a took the blow meant for b.', 'Le Rempart a tenu : a a pris le coup destiné à b.'],
    ['Bulwark 2: not when the front hero is the weakest', 'bulwark', 2, { ...pair, party: { a: { threat: 2, maxHp: 1e6, hp: 1e5 }, b: { maxHp: 1000 } } },
      (on, off) => expect(taken(on, 'b')).toBeCloseTo(taken(off, 'b')), 'bulwark2', null, null],
    ['Bulwark 3: the first hit of each fight deals less', 'bulwark', 3, { party: sturdy },
      (on, off) => expect(taken(on)).toBeCloseTo((taken(off) - oneHit(off) * (1 - R.bulwark.firstHitTaken)) * R.bulwark.frontTaken), 'bulwark3', 'a blunted the first blow of the fight.', 'a a amorti le premier coup du combat.'],
    ['Warding 1: elemental hits hurt less', 'warding', 1, fire,
      (on, off) => expect(taken(on) / taken(off)).toBeCloseTo(R.warding.elementalTaken), 'warding1', 'The Warding blunted the elements on a.', 'La Protection a émoussé les éléments sur a.'],
    ['Warding 1: not plain hits', 'warding', 1, { party: sturdy },
      (on, off) => expect(taken(on)).toBeCloseTo(taken(off)), 'warding1', null, null],
    ['Warding 2: the first elemental hit of each fight is cut by a quarter', 'warding', 2, fire,
      (on, off) => expect(taken(on)).toBeCloseTo((taken(off) - oneHit(off) * (1 - R.warding.firstHitTaken)) * R.warding.elementalTaken), 'warding2', 'The Warding blunted the first elemental blow aimed at a.', 'La Protection a émoussé le premier coup élémentaire visant a.'],
    ['Warding 3: 10% of elemental damage taken is reflected', 'warding', 3, fire,
      (on, off) => expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(taken(on) * R.warding.reflect), 'warding3', 'The Warding turned the elements back on a’s attacker.', 'La Protection a retourné les éléments contre l’assaillant de a.'],
    ['Shadow 2: +Evasion, and every dodge strikes back', 'shadow', 2, { party: sturdy, options: { rules: { ...steady, critMultiplier: 1 } }, seed: 'seed0' },
      (on, off) => {
        const dodges = (taken(off) - taken(on)) / oneHit(off);
        expect(dodges).toBeGreaterThan(0);
        expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(dodges * 10 * R.shadow.counterShare);
      }, 'shadow2', 'a slipped a blow and struck back.', 'a a esquivé un coup et a riposté.'],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test.each<[string, FamilyId, FamilyEffectId, FightSetup]>([
    ['Bulwark 3', 'bulwark', 'bulwark3', {}],
    ['Warding 2', 'warding', 'warding2', { boss: { element: 'fire' } }],
  ])('%s fires once in every fight of a run', (_name, family, effect, setup) => {
    const mobs = [{ mobId: 'thornPiglet', count: 1 }];
    const { run } = familyFight(family, 3, { ...setup, mobs, party: sturdy });
    const fights = run.encounters.filter((e) => e.kind === 'fight' || e.kind === 'boss');
    expect(fights).toHaveLength(2);
    for (const fight of fights) expect(logged(fight, effect)).toBe(1);
  });
});
