import { elementRules } from '@/content/elements';
import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { infusionRules } from '@/content/sanctums';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const power = 10;
const rounds = (maxRounds: number) => ({ rules: { ...steady, maxRounds, speed: { ...steady.speed, secondAttackPerPoint: 0 } } });
/** A fire-infused Power hit, split between physical and elemental, the elemental part through the wheel. */
const infused = (wheel: number) => power * infusionRules.physicalShare + (power * infusionRules.elementalShare + power * infusionRules.bonusShare) * wheel;
/** One round against two rats a fire-infused hero can't fell. */
const twoRats: FightSetup = {
  mobs: [{ mobId: 'giantRat', count: 2 }],
  party: { a: { power, weaponElement: 'fire', maxHp: 1e6 } },
  options: rounds(1),
};
/** A grass boss the fire-infused hero beats on the wheel, for two rounds. */
const grassBoss: FightSetup = { boss: { element: 'grass', damage: 0 }, party: { a: { weaponElement: 'fire' } }, options: rounds(2) };
const perRound = (f: FamilyFight) => f.fight.dealt.a / f.fight.rounds;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family elements', () => {
  test.each<Case>([
    ['Spellweave 2: an infused hit jumps to a second enemy for 30% in its element', 'spellweave', 2, twoRats,
      (on, off) => {
        expect(off.fight.dealt.a).toBeCloseTo(infused(1));
        expect(on.fight.dealt.a - off.fight.dealt.a).toBeCloseTo(power * R.spellweave.chainShare);
      }, 'spellweave2', 'a’s spell leapt to a second foe.', 'Le sort de a a rebondi sur un second ennemi.'],
    ['Spellweave 2: no jump with one enemy', 'spellweave', 2, { ...twoRats, mobs: [{ mobId: 'giantRat', count: 1 }] },
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a), 'spellweave2', null, null],
    ['Spellweave 2: no jump without an element', 'spellweave', 2, { ...twoRats, party: { a: { power, maxHp: 1e6 } } },
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a), 'spellweave2', null, null],
    ['Spellweave 3: the wheel’s advantage is doubled', 'spellweave', 3, grassBoss,
      (on, off) => {
        expect(perRound(off)).toBeCloseTo(infused(elementRules.strongMultiplier));
        expect(perRound(on)).toBeCloseTo(infused(1 + (elementRules.strongMultiplier - 1) * R.spellweave.advantageScale));
      }, 'spellweave3', 'a’s element overwhelmed a foe it masters.', 'L’élément de a a submergé un ennemi qu’il domine.'],
    ['Spellweave 3: nothing on a neutral target', 'spellweave', 3, { ...grassBoss, boss: { damage: 0 } },
      (on, off) => expect(perRound(on)).toBeCloseTo(perRound(off)), 'spellweave3', null, null],
    // A magic hero's second-round hit gains the late +10% on top of Spellweave 1's ramp.
    ['Spellweave 3: magic hits +10% from round 2', 'spellweave', 3,
      { boss: { damage: 0 }, party: { a: { magic: power, damageStat: 'magic' } }, options: { rules: { ...steady, maxRounds: 2 } } },
      (on) => {
        const level2 = familyFight('spellweave', 2, { boss: { damage: 0 }, party: { a: { magic: power, damageStat: 'magic' } }, options: { rules: { ...steady, maxRounds: 2 } } });
        expect(on.fight.dealt.a - level2.fight.dealt.a).toBeCloseTo(power * (1 + 2 * R.spellweave.perRound) * (R.spellweave.lateDamage - 1));
        expect(logged(on.fight, 'spellweave3Late')).toBe(1);
      }, 'spellweave3', null, null],
    // Level 3 still runs levels 1 and 2: a magic hero gains 5% in round 1, and the hit still jumps.
    ['Spellweave 3: Spellweave 1 and 2 still apply', 'spellweave', 3,
      { ...twoRats, party: { a: { magic: power, damageStat: 'magic', weaponElement: 'fire', maxHp: 1e6 } } },
      (on, off) => {
        expect(on.fight.dealt.a).toBeCloseTo((off.fight.dealt.a + power * R.spellweave.chainShare) * (1 + R.spellweave.perRound));
        expect(logged(on.fight, 'spellweave1')).toBe(1);
        expect(logged(on.fight, 'spellweave2')).toBe(1);
      }, 'spellweave3', null, null],
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
