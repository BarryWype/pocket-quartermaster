import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';

const perRound = (f: FamilyFight, record: 'dealt' | 'taken') => f.fight[record].a / f.fight.rounds;
/** The share of a magic hit Spellweave adds over a fight's rounds, averaged. */
const spellweaveAverage = (rounds: number) =>
  Array.from({ length: rounds }, (_, i) => 1 + Math.min(R.spellweave.perRound * (i + 1), R.spellweave.max)).reduce((a, b) => a + b) / rounds;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family damage modifiers', () => {
  test.each<Case>([
    ['Faith 1: undead take more damage', 'faith', 1, { boss: { tags: ['undead'] } },
      (on, off) => expect(perRound(on, 'dealt') / perRound(off, 'dealt')).toBeCloseTo(R.faith.damage), 'faith1', 'Faith burned the undead under a’s blows.', 'La foi a brûlé les morts-vivants sous les coups de a.'],
    ['Faith 1: spirits too', 'faith', 1, { boss: { tags: ['spirit'] } },
      (on, off) => expect(perRound(on, 'dealt') / perRound(off, 'dealt')).toBeCloseTo(R.faith.damage), 'faith1', 'Faith burned', null],
    ['Faith 1: not other foes', 'faith', 1, { boss: { tags: ['beast'] } },
      (on, off) => expect(perRound(on, 'dealt')).toBeCloseTo(perRound(off, 'dealt')), 'faith1', null, null],
    ['Wild 1: beasts deal less damage', 'wild', 1, { boss: { tags: ['beast'] } },
      (on, off) => expect(perRound(on, 'taken') / perRound(off, 'taken')).toBeCloseTo(R.wild.damageTaken), 'wild1', 'The Wild calmed the beasts: they hit a softer.', 'Le Sauvage a calmé les bêtes : elles ont frappé a moins fort.'],
    ['Wild 1: not other foes', 'wild', 1, { boss: { tags: ['undead'] } },
      (on, off) => expect(perRound(on, 'taken')).toBeCloseTo(perRound(off, 'taken')), 'wild1', null, null],
    ['Bloodrage 1: more damage below half HP', 'bloodrage', 1, { party: { a: { hp: 40 } }, boss: { damage: 0 } },
      (on, off) => expect(perRound(on, 'dealt') / perRound(off, 'dealt')).toBeCloseTo(R.bloodrage.damage), 'bloodrage1', 'Bleeding, a hit harder.', 'En sang, a a frappé plus fort.'],
    ['Bloodrage 1: nothing above half HP', 'bloodrage', 1, { boss: { damage: 0 } },
      (on, off) => expect(perRound(on, 'dealt')).toBeCloseTo(perRound(off, 'dealt')), 'bloodrage1', null, null],
    ['Spellweave 1: magic +5% a round, up to +25%', 'spellweave', 1, { party: { a: { damageStat: 'magic', magic: 10, power: 0 } }, boss: { damage: 0 } },
      (on, off) => {
        expect(on.fight.rounds).toBeGreaterThan(5);
        expect(perRound(on, 'dealt') / perRound(off, 'dealt')).toBeCloseTo(spellweaveAverage(on.fight.rounds));
      }, 'spellweave1', 'a’s spells grew stronger each round.', 'Les sorts de a ont gagné en force à chaque tour.'],
    ['Spellweave 1: not Power hits', 'spellweave', 1, { boss: { damage: 0 } },
      (on, off) => expect(perRound(on, 'dealt')).toBeCloseTo(perRound(off, 'dealt')), 'spellweave1', null, null],
    ['Rally 1: the whole party hits harder', 'rally', 1, { party: { a: {}, b: {} }, boss: { damage: 0 } },
      (on, off) => expect(on.fight.dealt.b / off.fight.dealt.b).toBeCloseTo(R.rally.damage), 'rally1', 'a rallied the party: everyone hit harder.', 'a a rallié le groupe : tout le monde a frappé plus fort.'],
    ['Levels are cumulative: Rally 3 keeps level 1', 'rally', 3, { boss: { damage: 0 } },
      (on, off) => expect(perRound(on, 'dealt') / perRound(off, 'dealt')).toBeCloseTo(R.rally.damage), 'rally1', 'rallied the party', null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    // Same seed, same run.
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });
});
