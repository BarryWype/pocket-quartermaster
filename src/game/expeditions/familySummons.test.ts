import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { mobById } from '@/content/enemies';
import { specials } from '@/content/specials';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const power = 10;
const noSecond = { rules: { ...steady, speed: { ...steady.speed, secondAttackPerPoint: 0 } } };
/**
 * The round a boss of `hp` falls when the hero hits for `power` a round and a
 * summon adds `summon` a round for its first `rounds` rounds.
 */
const killRound = (hp: number, summon: number, rounds: number) => {
  let total = 0;
  for (let round = 1; ; round++) {
    total += power + (round <= rounds ? summon : 0);
    if (total >= hp) return round;
  }
};
/** The same with several summons, each [damage a round, rounds]. */
const killRoundMany = (hp: number, summons: [number, number][]) => {
  let total = 0;
  for (let round = 1; ; round++) {
    total += power + summons.reduce((sum, [damage, n]) => sum + (round <= n ? damage : 0), 0);
    if (total >= hp) return round;
  }
};
const turret = specials.turret.effect as { share: number; rounds: number };
/** A boss of `hp` that never hurts back, against a hero with the Engineer's turret. */
const withTurret = (hp: number): FightSetup => ({ boss: { hp, damage: 0 }, party: { a: { special: 'turret' } }, options: noSecond });
/** A boss of `hp` that never hurts back, against a hero with no summoner. */
const plain = (hp: number): FightSetup => ({ boss: { hp, damage: 0 }, options: noSecond });
/** Two rats a hero can't fell, for one round. */
const rats: FightSetup = {
  mobs: [{ mobId: 'giantRat', count: 2 }],
  party: { a: { power: 0.001, maxHp: 1e6 } },
  options: { rules: { ...noSecond.rules, maxRounds: 1 } },
};
const rounds = (f: FamilyFight) => f.fight.rounds;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family summons', () => {
  test.each<Case>([
    // With no summoner, the hound alone hits for 35% of the hero's hit for 2 rounds.
    ['Pack 1: a spirit hound joins the fight, without a summoner', 'pack', 1, plain(55),
      (on, off) => {
        expect(rounds(off)).toBe(killRound(55, 0, 0));
        expect(rounds(on)).toBe(killRound(55, R.pack.houndShare * power, R.pack.houndRounds));
      }, 'pack1', 'A spirit hound answered a’s call.', 'Un chien spectral a répondu à l’appel de a.'],
    // With a summoner, the hound comes too: the turret and the hound both hit.
    ['Pack 1: the hound joins a summoner’s turret', 'pack', 1, withTurret(55),
      (on, off) => {
        expect(rounds(off)).toBe(killRound(55, turret.share * power, turret.rounds));
        expect(rounds(on)).toBe(killRoundMany(55, [[turret.share * power, turret.rounds], [R.pack.houndShare * power, R.pack.houndRounds]]));
      }, 'pack1', 'A spirit hound answered a’s call.', null],
    ['Pack 2: every summon hits 25% harder and stays a round longer, the hound included', 'pack', 2, withTurret(60),
      (on) => {
        const boost = (share: number, n: number): [number, number] => [share * power * R.pack.damage, n + R.pack.extraRounds];
        expect(rounds(on)).toBe(killRoundMany(60, [boost(turret.share, turret.rounds), boost(R.pack.houndShare, R.pack.houndRounds)]));
        expect(logged(on.fight, 'pack1')).toBe(1);
      }, 'pack2', 'The pack drove a’s summon harder and longer.', 'La meute a poussé l’invocation de a à frapper plus fort et plus longtemps.'],
    ['Pack 3: a second hound, both shaped by Pack 2', 'pack', 3, plain(69),
      (on, off) => {
        expect(rounds(off)).toBe(killRound(69, 0, 0));
        const hound = R.pack.houndShare * power * R.pack.damage;
        expect(rounds(on)).toBe(killRoundMany(69, [[hound, R.pack.houndRounds + R.pack.extraRounds], [hound, R.pack.houndRounds + R.pack.extraRounds]]));
      }, 'pack3', 'A second spirit hound answered a’s call.', 'Un second chien spectral a répondu à l’appel de a.'],
    // One rat is calmed and leaves; only the other strikes the hero, softened by Wild 1.
    ['Wild 3: a calmed beast leaves the enemies and fights for the party', 'wild', 3, rats,
      (on, off) => {
        expect(off.fight.taken.a).toBeCloseTo(2 * mobById.giantRat.damage);
        expect(on.fight.taken.a).toBeCloseTo(mobById.giantRat.damage * R.wild.damageTaken);
      }, 'wild3', 'a calmed a beast, and it turned on its own.', 'a a apaisé une bête, qui s’est retournée contre les siens.'],
    ['Wild 3: never the boss', 'wild', 3, { boss: { tags: ['beast'], damage: 0 }, options: { rules: { ...steady, maxRounds: 1 } } },
      (on) => expect(on.run.encounters[0].cleared).toBe(false), 'wild3', null, null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test('Wild 3 calms one beast a run, in its first beast fight', () => {
    const { run } = familyFight('wild', 3, { mobs: [{ mobId: 'giantRat', count: 2 }], fights: 2, party: { a: { power: 1000, maxHp: 1e6 } } });
    const fights = run.encounters.filter((e) => e.kind === 'fight');
    expect(fights).toHaveLength(2);
    expect(fights.map((fight) => logged(fight, 'wild3'))).toEqual([1, 0]);
  });

  test('Pack 3 summons in every fight of a run', () => {
    const { run } = familyFight('pack', 3, { mobs: [{ mobId: 'giantRat', count: 1 }], boss: { hp: 1 }, party: { a: { power: 1000 } } });
    expect(run.encounters.map((fight) => logged(fight, 'pack3'))).toEqual([1, 1]);
  });
});
