import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const power = 10;
/** No second blows, for `maxRounds` rounds. */
const rounds = (maxRounds: number) => ({ rules: { ...steady, maxRounds, speed: { ...steady.speed, secondAttackPerPoint: 0 } } });
/** A hero at `hp` of 100 against a boss that never hurts back, for two rounds. */
const bleeding = (hp: number): FightSetup => ({ boss: { damage: 0 }, party: { a: { hp } }, options: rounds(2) });
const perRound = (f: FamilyFight) => f.fight.dealt.a / f.fight.rounds;
/** Three rats none of the heroes' blows can fell, for two rounds. */
const tiny = 0.01;
const rats = (party: FightSetup['party']): FightSetup => ({ mobs: [{ mobId: 'giantRat', count: 3 }], party, options: rounds(2) });
const sturdy = { power: tiny, maxHp: 1e6 };
const volleyBy = (f: FamilyFight) => f.fight.effects.find((e) => e.familyEffect === 'volley3')?.heroId;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family extra actions', () => {
  test.each<Case>([
    // Below a quarter of HP Bloodrage 1’s +20% lifts both blows.
    ['Bloodrage 3: below 25% HP an extra attack each round', 'bloodrage', 3, bleeding(20),
      (on, off) => {
        expect(perRound(off)).toBeCloseTo(power);
        expect(perRound(on)).toBeCloseTo(2 * power * R.bloodrage.damage);
        expect(logged(on.fight, 'bloodrage1')).toBe(1);
      }, 'bloodrage3', 'On the brink, a struck twice in a frenzy.', 'Au bord du gouffre, a a frappé deux fois dans sa frénésie.'],
    ['Bloodrage 3: no extra attack at 25% HP or more', 'bloodrage', 3, bleeding(40),
      (on) => expect(perRound(on)).toBeCloseTo(power * R.bloodrage.damage), 'bloodrage3', null, null],
    // Round 1’s blow strikes all three rats, round 2’s one: two more hits than without.
    ['Volley 3: once per fight, the ranged hero’s blow strikes every enemy', 'volley', 3, rats({ a: { ...sturdy, ranged: true } }),
      (on, off) => {
        expect(off.fight.dealt.a).toBeCloseTo(2 * tiny);
        expect(on.fight.dealt.a).toBeCloseTo(4 * tiny);
      }, 'volley3', 'a loosed a volley that struck every foe.', 'a a décoché une volée qui a touché tous les ennemis.'],
    ['Volley 3: a ranged ally looses it over the family’s own hero', 'volley', 3, rats({ a: sturdy, b: { ...sturdy, ranged: true } }),
      (on, off) => {
        expect(volleyBy(on)).toBe('b');
        expect(on.fight.dealt.b - off.fight.dealt.b).toBeCloseTo(2 * tiny);
        expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a);
      }, 'volley3', 'b loosed a volley that struck every foe.', null],
    ['Volley 3: with no ranged hero, the family’s own hero looses it', 'volley', 3, rats({ a: sturdy }),
      (on, off) => {
        expect(volleyBy(on)).toBe('a');
        expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(2 * tiny);
        // No ranged weapon, so Volley 1 never puts the hero first.
        expect(logged(on.fight, 'volley1')).toBe(0);
      }, 'volley3', 'a loosed a volley that struck every foe.', null],
    // Level 3 still runs Volley 1: the slower ranged hero strikes before the rats.
    ['Volley 3: Volley 1 still applies', 'volley', 3, rats({ a: { ...sturdy, ranged: true } }),
      (on) => expect(logged(on.fight, 'volley1')).toBe(1), 'volley3', 'a loosed a volley that struck every foe.', null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test('Volley 3 looses once in every fight of a run', () => {
    const { run } = familyFight('volley', 3, { mobs: [{ mobId: 'giantRat', count: 3 }], party: { a: { power: 1000, ranged: true } } });
    const fights = run.encounters.filter((e) => e.kind === 'fight' || e.kind === 'boss');
    expect(fights).toHaveLength(2);
    for (const fight of fights) expect(logged(fight, 'volley3')).toBe(1);
  });
});
