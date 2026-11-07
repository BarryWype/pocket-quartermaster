import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { itemById } from '@/content/lookup';
import type { ConsumableDef, Tag } from '@/game/types';

import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const healed = (f: FamilyFight) => f.fight.healed.a ?? 0;
const hpLeft = (f: FamilyFight) => f.run.hp[0].hp;
/** A hero at half HP. */
const hurtHero = { a: { hp: 50 } };
/** An undead boss that never hurts back, for two rounds. */
const undead: FightSetup = { boss: { tags: ['undead'], damage: 0 }, party: hurtHero, options: { rules: { ...steady, maxRounds: 2 } } };
/** A boss felled by the first blow. */
const felled = (tags: Tag[] = []): FightSetup => ({
  boss: { hp: 1, damage: 0, tags },
  party: hurtHero,
});
/** Hits of 40 against 100 HP and a boss of 40 HP: the hero falls in round 3 and fells the boss in round 4. */
const falls: FightSetup = { boss: { hp: 40, damage: 40 } };
/** Hits of 40 against 100 HP and an unkillable boss: the hero falls twice. */
const fallsTwice: FightSetup = { boss: { damage: 40 } };
/** A rat fight before the boss, the rat felled by one blow. */
const ratFirst: FightSetup = { mobs: [{ mobId: 'giantRat', count: 1 }], party: { a: { hp: 50, power: 1000 } }, boss: { hp: 1, damage: 0 } };
const draught = itemById.revivalDraught as ConsumableDef;

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family healing and revival', () => {
  test.each<Case>([
    ['Faith 2: hits on the undead heal 3% of their damage', 'faith', 2, undead,
      (on, off) => {
        expect(healed(off)).toBe(0);
        expect(healed(on)).toBeCloseTo(on.fight.dealt.a * R.faith.healShare);
      }, 'faith2', 'Faith mended a with every blow at the undead.', 'La foi a soigné a à chaque coup porté aux morts-vivants.'],
    ['Faith 2: no heal against the living', 'faith', 2, { ...undead, boss: { damage: 0 } },
      (on) => expect(healed(on)).toBe(0), 'faith2', null, null],
    ['Faith 3: the first knockout gets back up at 25% HP', 'faith', 3, falls,
      (on, off) => {
        expect(off.run.bossDefeated).toBe(false);
        expect(on.run.bossDefeated).toBe(true);
        expect(hpLeft(on)).toBeCloseTo(R.faith.revivePct * 100);
        expect(on.fight.knockedOut).toEqual(['a']);
        expect(on.run.outcome).toBe('success');
      }, 'faith3', 'Faith raised a back to their feet.', 'La foi a remis a sur pied.'],
    ['Faith 3: only once per run, before the revival draught', 'faith', 3,
      { ...fallsTwice, party: { a: { consumable: draught } }, options: { elixirs: true } },
      (on) => {
        expect(on.fight.knockedOut).toEqual(['a', 'a', 'a']);
        expect(on.run.elixirsUsed).toEqual(['a']);
        expect(on.fight.effects.filter((e) => e.key === 'revive')).toHaveLength(1);
        expect(hpLeft(on)).toBe(0);
      }, 'faith3', 'Faith raised a back to their feet.', 'La foi a remis a sur pied.'],
    // Level 3 still runs Faith 1 and 2: undead take 10% more and the blows heal.
    ['Faith 3: Faith 1 and 2 still apply', 'faith', 3, undead,
      (on, off) => {
        expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a * R.faith.damage);
        expect(logged(on.fight, 'faith2')).toBe(1);
      }, 'faith1', 'Faith burned the undead under a’s blows.', null],
    ['Wild 2: the party heals 5% after a won fight against beasts', 'wild', 2, felled(['beast']),
      (on, off) => {
        expect(healed(off)).toBe(0);
        expect(healed(on)).toBeCloseTo(R.wild.healShare * 100);
      }, 'wild2', 'The Wild tended the party after the beasts fell.', 'Le Sauvage a soigné le groupe après la chute des bêtes.'],
    ['Wild 2: no heal after a fight without beasts', 'wild', 2, felled(),
      (on) => expect(healed(on)).toBe(0), 'wild2', null, null],
    ['Wild 2: no heal after a lost fight', 'wild', 2, { boss: { tags: ['beast'], damage: 1000 }, party: hurtHero },
      (on) => expect(healed(on)).toBe(0), 'wild2', null, null],
    ['Bloodrage 2: a kill heals the killer 5%', 'bloodrage', 2, felled(),
      (on, off) => {
        expect(healed(off)).toBe(0);
        expect(healed(on)).toBeCloseTo(R.bloodrage.healOnKill * 100);
      }, 'bloodrage2', 'a drew strength from the kill.', 'a a puisé des forces dans sa victime.'],
    ['Bloodrage 2: no kill, no heal', 'bloodrage', 2, { ...undead, boss: { damage: 0 } },
      (on) => expect(healed(on)).toBe(0), 'bloodrage2', null, null],
    // Below half HP Bloodrage 1 still lifts the blow that kills.
    ['Bloodrage 2: Bloodrage 1 still applies', 'bloodrage', 2, { ...felled(), party: { a: { hp: 40 } } },
      (on, off) => expect(on.fight.dealt.a).toBeCloseTo(off.fight.dealt.a * R.bloodrage.damage), 'bloodrage1', 'Bleeding, a hit harder.', null],
    ['Rally 2: the party heals 5% between fights', 'rally', 2, ratFirst,
      (on, off) => {
        expect(healed(off)).toBe(0);
        expect(healed(on)).toBeCloseTo(R.rally.healShare * 100);
      }, 'rally2', 'a rallied the party between fights: everyone caught their breath.', 'a a rallié le groupe entre deux combats : chacun a repris son souffle.'],
    // A hero quick enough to fell the rat before it strikes stays at full HP.
    ['Rally 2: no heal at full HP', 'rally', 2, { ...ratFirst, party: { a: { power: 1000, speed: 100 } } },
      (on) => {
        expect(on.fight.taken.a ?? 0).toBe(0);
        expect(healed(on)).toBe(0);
      }, 'rally2', null, null],
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
