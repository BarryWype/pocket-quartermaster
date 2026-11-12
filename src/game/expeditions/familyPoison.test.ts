import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const power = 10;
/** One hero without the Venomous affix, for `rounds` rounds. */
const bare = (rounds: number): FightSetup => ({ boss: { damage: 0 }, options: { rules: { ...steady, maxRounds: rounds } } });
/** Two Venomous heroes striking every round, for `rounds` rounds. */
const pair = (rounds: number): FightSetup => ({
  boss: { damage: 0 },
  party: { a: { affixes: { venomous: 100 } }, b: { affixes: { venomous: 100 } } },
  options: { rules: { ...steady, maxRounds: rounds } },
});
/** One Venomous hero, for `rounds` rounds. */
const lone = (rounds: number): FightSetup => ({
  boss: { damage: 0 },
  party: { a: { affixes: { venomous: 100 } } },
  options: { rules: { ...steady, maxRounds: rounds } },
});
const dealt = (f: FamilyFight) => f.fight.dealt.a + (f.fight.dealt.b ?? 0);

type Case = [string, FamilyId | null, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family poison', () => {
  test('Venom 1 poisons about its chance of hits', () => {
    const seeds = Array.from({ length: 300 }, (_, i) => `seed${i}`);
    const share = seeds.filter((seed) => logged(familyFight('venom', 1, { ...bare(1), seed }).fight, 'venom1') === 1).length / seeds.length;
    expect(share).toBeGreaterThan(R.venom.poisonChance - 0.05);
    expect(share).toBeLessThan(R.venom.poisonChance + 0.05);
  });

  test.each<Case>([
    // 40 plain hits: some poison, each poison ticking a share of its hit on top.
    ['Venom 1: hits may poison without the Venomous affix', 'venom', 1, bare(40),
      (on, off) => {
        expect(off.fight.dealt.a).toBeCloseTo(40 * power);
        expect(on.fight.dealt.a).toBeGreaterThan(off.fight.dealt.a);
      }, 'venom1',
      'a’s blade dripped with Venom: the hit poisoned its target.',
      'L’arme de a suintait de Venin : le coup a empoisonné sa cible.'],
    // A Venomous hit that poisons every time leaves Venom 1 nothing to add.
    ['Venom 1: not where the Venomous affix already poisons', 'venom', 1, lone(6),
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a), 'venom1', null, null],
    // One stack, refreshed by every round’s two procs: a tick a round from round 2.
    ['Base: two Venomous procs a round leave one stack', null, 0, pair(6),
      (on) => expect(dealt(on)).toBeCloseTo(2 * 6 * power + (6 - 1) * power * R.venom.dotShare), 'venom2', null, null],
    // The third stack lands in round 2, so rounds 3-6 tick three stacks; the cap keeps it at three.
    ['Venom 2: the stacks reach three and no more', 'venom', 2, pair(6),
      (on) => expect(dealt(on)).toBeCloseTo(2 * 6 * power + (2 + 3 * (6 - 2)) * power * R.venom.stackShare), 'venom2',
      'b’s venom took hold again: the poisons stacked.',
      'Le venin de b s’est à nouveau accumulé sur l’ennemi.'],
    // Round 1’s hit meets no poison yet; only round 2’s hit is lifted. Venom 2's stronger stack ticks once.
    ['Venom 3: +20% on the poisoned enemy, none on the unpoisoned one', 'venom', 3, lone(2),
      (on, off) => {
        expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(power * (R.venom.poisonedTaken - 1) + power * (R.venom.stackShare - R.venom.dotShare));
        expect(off.fight.dealt.a).toBeCloseTo(2 * power + power * R.venom.dotShare);
      }, 'venom3',
      'a’s blows tore at the poisoned foe.',
      'Les coups de a ont déchiré l’ennemi empoisonné.'],
    // A seed where Venom 1's chance never poisons in these two rounds.
    ['Venom 3: nothing on an unpoisoned enemy', 'venom', 3, { boss: { damage: 0 }, seed: 'seed0', options: { rules: { ...steady, maxRounds: 2 } } },
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a), 'venom3', null, null],
    // Level 3 still runs Venom 2: the second and third stacks land, so round 3 ticks two poisons.
    ['Venom 3: Venom 2’s stacking still applies', 'venom', 3, lone(3),
      (on) => {
        expect(on.fight.dealt.a).toBeCloseTo(power * (1 + 2 * R.venom.poisonedTaken) + power * R.venom.stackShare * (2 + R.venom.poisonedTaken));
        expect(logged(on.fight, 'venom2')).toBe(1);
      }, 'venom3',
      'a’s blows tore at the poisoned foe.',
      'Les coups de a ont déchiré l’ennemi empoisonné.'],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });
});
