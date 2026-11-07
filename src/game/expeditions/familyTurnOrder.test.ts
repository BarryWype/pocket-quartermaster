import { expeditionRules } from '@/content/dungeons';
import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

/** No second blows, so turn order alone decides who strikes when. */
const noSecond = { rules: { ...steady, speed: { ...expeditionRules.speed, secondAttackPerPoint: 0 } } };
/** Three rats, quicker than the hero (speed 5), each felled by one blow. */
const rats: FightSetup = { mobs: [{ mobId: 'giantRat', count: 3 }], party: { a: { power: 1000 } }, options: noSecond };
const ratsWith = (over: FightSetup['party']): FightSetup => ({ ...rats, party: { a: { power: 1000, ...over?.a } } });
/** The rat hits the hero took: every hero turn before theirs spares one. */
const hitsTaken = (f: FamilyFight) => f.fight.taken.a ?? 0;
const seeds = Array.from({ length: 40 }, (_, i) => `seed${i}`);
const extra = (family: FamilyId, level: number, setup: FightSetup) =>
  seeds.map((seed) => {
    const on = familyFight(family, level, { ...setup, seed });
    const off = familyFight(null, 0, { ...setup, seed });
    return { on, gain: on.fight.dealt.a - off.fight.dealt.a };
  });

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family turn order and first strikes', () => {
  // Shadow 3 always strikes in these cases; its chance has a test of its own.
  const strikeChance = R.shadow.strikeChance;
  beforeAll(() => {
    R.shadow.strikeChance = 1;
  });
  afterAll(() => {
    R.shadow.strikeChance = strikeChance;
  });

  test('Shadow 3 strikes in about its chance of fights', () => {
    R.shadow.strikeChance = strikeChance;
    const setup: FightSetup = { mobs: [{ mobId: 'giantRat', count: 1 }], options: noSecond };
    const struck = seeds.filter((seed) => logged(familyFight('shadow', 3, { ...setup, seed }).fight, 'shadow3') === 1).length / seeds.length;
    R.shadow.strikeChance = 1;
    expect(struck).toBeGreaterThan(strikeChance - 0.2);
    expect(struck).toBeLessThan(strikeChance + 0.2);
  });

  test.each<Case>([
    // Without: the rats strike first every round (3 + 2 + 1 hits). Round 1 only: 2 + 2 + 1.
    ['Watch 1: +Speed in round 1 only', 'watch', 1, rats,
      (on, off) => expect(hitsTaken(on) / hitsTaken(off)).toBeCloseTo(5 / 6), 'watch1', 'The Watch saw them coming: a moved first.', 'La Vigie les a vus venir : a a agi en premier.'],
    // Every round: 2 + 1 + 0.
    ['Volley 1: a ranged weapon acts first every round', 'volley', 1, ratsWith({ a: { ranged: true } }),
      (on, off) => expect(hitsTaken(on) / hitsTaken(off)).toBeCloseTo(3 / 6), 'volley1', 'a loosed before the enemy could close in.', 'a a tiré avant que l’ennemi ne puisse approcher.'],
    ['Volley 1: not without a ranged weapon', 'volley', 1, rats,
      (on, off) => expect(hitsTaken(on)).toBeCloseTo(hitsTaken(off)), 'volley1', null, null],
    ['Watch 3: the party always acts first', 'watch', 3, rats,
      (on, off) => expect(hitsTaken(on) / hitsTaken(off)).toBeCloseTo(3 / 6), 'watch3', 'Nothing caught the Watch off guard: a struck first.', 'Rien n’a surpris la Vigie : a a frappé le premier coup.'],
    ['Shadow 3: the weakest enemy falls before it acts', 'shadow', 3, { mobs: [{ mobId: 'giantRat', count: 1 }, { mobId: 'ratSwarm', count: 1 }], party: { a: { power: 0.001, maxHp: 1e6 } }, options: noSecond },
      (on, off) => {
        // The rat (8 HP) is gone at once, the swarm (18 HP) stands; only the swarm ever hits.
        expect(on.fight.dealt.a).toBeGreaterThan(off.fight.dealt.a);
        expect(on.fight.rounds).toBe(off.fight.rounds);
        expect(hitsTaken(on)).toBeLessThan(hitsTaken(off));
      }, 'shadow3', 'a struck down the weakest foe before it could move.', 'a a abattu l’ennemi le plus faible avant qu’il ne bouge.'],
    ['Shadow 3: one foe alone falls before it strikes once', 'shadow', 3, { mobs: [{ mobId: 'giantRat', count: 1 }], options: noSecond },
      (on, off) => {
        expect(hitsTaken(on)).toBe(0);
        expect(hitsTaken(off)).toBeGreaterThan(0);
      }, 'shadow3', 'struck down the weakest foe', null],
    ['Shadow 3: never the boss', 'shadow', 3, {},
      (on) => expect(on.fight.cleared).toBe(false), 'shadow3', null, null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test.each<[string, FamilyId, number, FightSetup, number, FamilyEffectId, string, string]>([
    // One blow in round 1 with equal speeds: Shadow 1 adds at most one crit, and the crit is logged.
    ['Shadow 1: +crit in round 1 only', 'shadow', 1, { boss: { damage: 0 }, options: noSecond }, 1, 'shadow1', 'From the shadows, a struck a weak spot.', 'Depuis l’ombre, a a frappé un point faible.'],
    // Against the boss (an elite) every round.
    ['Watch 3: +crit against elites', 'watch', 3, { boss: { damage: 0 }, options: noSecond }, Infinity, 'watch3Crit', 'a found the gap in an elite’s guard.', 'a a trouvé la faille dans la garde d’un ennemi d’élite.'],
  ])('%s', (_name, family, level, setup, maxCrits, effect, en, fr) => {
    const runs = extra(family, level, setup);
    const crit = 10 * (steady.critMultiplier - 1);
    for (const { on, gain } of runs) {
      expect(gain % crit).toBeCloseTo(0);
      expect(gain / crit).toBeLessThanOrEqual(maxCrits);
      expect(logged(on.fight, effect)).toBe(gain > 0 ? 1 : 0);
    }
    const fired = runs.find((r) => r.gain > 0)!;
    expect(fired).toBeDefined();
    expect(fired.on.log).toContain(en);
    expect(fired.on.logFr).toContain(fr);
  });

  test('Watch 3 adds no crit against a common fight', () => {
    for (const { gain } of extra('watch', 3, { mobs: [{ mobId: 'ratSwarm', count: 1 }], party: { a: { power: 0.001 } }, options: noSecond })) {
      expect(gain).toBeCloseTo(0);
    }
  });
});
