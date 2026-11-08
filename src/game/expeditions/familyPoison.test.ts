import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { threatRules } from '@/content/threats';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const power = 10;
const taken = (f: FamilyFight) => f.fight.taken.a ?? 0;
/** A poison threat at `level`, with a boss that never hurts back. */
const poisoned = (level: 1 | 2 | 3): FightSetup => ({
  boss: { damage: 0 },
  options: { briefing: { threats: [{ id: 'poison', level }], restriction: null, opportunity: null } },
});
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
  test.each<Case>([
    // Venom 1's 2 tags leave Poison 3 one tag short: a half miss, its wounds then halved again.
    ['Venom 1: the Poison threat’s after-fight wounds are halved', 'venom', 1, poisoned(3),
      (on, off) => expect(taken(on)).toBeCloseTo(taken(off) * threatRules.halfShare * R.venom.woundsTaken), 'venom1',
      'Venom ran in a’s veins: the poison’s wounds bit half as deep.',
      'Le Venin dans le sang de a a affaibli le poison : ses blessures ont été réduites de moitié.'],
    ['Venom 1: answering the threat’s level leaves no wounds at all', 'venom', 1, poisoned(1),
      (on, off) => {
        expect(taken(on)).toBe(0);
        expect(taken(off)).toBeGreaterThan(0);
      }, 'venom1', null, null],
    ['Venom 1: no poison threat, no wounds to halve', 'venom', 1, { boss: { damage: 0 } },
      (on, off) => expect(taken(on)).toBe(taken(off)), 'venom1', null, null],
    // One stack, refreshed by every round’s two procs: a tick a round from round 2.
    ['Base: two Venomous procs a round leave one stack', null, 0, pair(6),
      (on) => expect(dealt(on)).toBeCloseTo(2 * 6 * power + (6 - 1) * power * R.venom.dotShare), 'venom2', null, null],
    // The third stack lands in round 2, so rounds 3-6 tick three stacks; the cap keeps it at three.
    ['Venom 2: the stacks reach three and no more', 'venom', 2, pair(6),
      (on) => expect(dealt(on)).toBeCloseTo(2 * 6 * power + (2 + 3 * (6 - 2)) * power * R.venom.dotShare), 'venom2',
      'b’s venom took hold again: the poisons stacked.',
      'Le venin de b s’est à nouveau accumulé sur l’ennemi.'],
    // Round 1’s hit meets no poison yet; only round 2’s hit is lifted.
    ['Venom 3: +20% on the poisoned enemy, none on the unpoisoned one', 'venom', 3, lone(2),
      (on, off) => {
        expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(power * (R.venom.poisonedTaken - 1));
        expect(off.fight.dealt.a).toBeCloseTo(2 * power + power * R.venom.dotShare);
      }, 'venom3',
      'a’s blows tore at the poisoned foe.',
      'Les coups de a ont déchiré l’ennemi empoisonné.'],
    ['Venom 3: nothing on an unpoisoned enemy', 'venom', 3, { boss: { damage: 0 }, options: { rules: { ...steady, maxRounds: 2 } } },
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a), 'venom3', null, null],
    // Level 3 still runs Venom 2: the second and third stacks land, so round 3 ticks two poisons.
    ['Venom 3: Venom 2’s stacking still applies', 'venom', 3, lone(3),
      (on) => {
        expect(on.fight.dealt.a).toBeCloseTo(power * (1 + 2 * R.venom.poisonedTaken) + power * R.venom.dotShare * (2 + R.venom.poisonedTaken));
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
