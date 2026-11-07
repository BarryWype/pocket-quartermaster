import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import type { SpecialId } from '@/game/types';

import type { EncounterResult } from './simulate';
import { familyFight, logged, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';

const fired = (encounters: EncounterResult[], id: SpecialId) =>
  encounters.reduce((sum, e) => sum + e.effects.filter((x) => x.key === 'special' && x.specialId === id).length, 0);
/** Two fights of three rats before the boss, each opening with the hero's Summon (once per run). */
const summoner: FightSetup = { mobs: [{ mobId: 'giantRat', count: 3 }], fights: 2, party: { a: { power: 1000, special: 'summon' } } };
/** An unkillable undead boss: Smite (once per fight) answers every one of the hero's turns. */
const smiter: FightSetup = { boss: { tags: ['undead'], damage: 0 }, party: { a: { special: 'smite' } }, options: { rules: { ...steady, maxRounds: 4 } } };
/** A hurt hero with Patch-up (every gap between fights) through a rat fight. */
const patcher: FightSetup = { mobs: [{ mobId: 'giantRat', count: 1 }], boss: { hp: 1 }, party: { a: { hp: 50, power: 1000, special: 'patchUp' } } };

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family specials', () => {
  test.each<Case>([
    ['Rally 3: a once-per-run special fires once more in the run', 'rally', 3, summoner,
      (on, off) => {
        expect(fired(off.run.encounters, 'summon')).toBe(1);
        expect(fired(on.run.encounters, 'summon')).toBe(1 + R.rally.extraSpecialUses);
        expect(fired([on.run.encounters[1]], 'summon')).toBe(1);
        expect(logged(on.run.encounters[1], 'rally3')).toBe(1);
      }, 'rally1', 'a rallied the party: everyone hit harder.', null],
    ['Rally 3: a once-per-fight special fires once more, once in the run', 'rally', 3, smiter,
      (on, off) => {
        expect(fired([off.fight], 'smite')).toBe(1);
        expect(fired([on.fight], 'smite')).toBe(1 + R.rally.extraSpecialUses);
      }, 'rally3', 'Rallied, a found the strength for one more special.', 'Galvanisé, a a trouvé la force d’un spécial de plus.'],
    ['Rally 3: a between-fights special is unchanged', 'rally', 3, patcher,
      (on, off) => {
        expect(fired(off.run.encounters, 'patchUp')).toBeGreaterThan(0);
        expect(fired(on.run.encounters, 'patchUp')).toBe(fired(off.run.encounters, 'patchUp'));
      }, 'rally3', null, null],
    // Level 3 still runs Rally 2: the hero heals between fights.
    ['Rally 3: Rally 2 still applies', 'rally', 3, patcher,
      (on) => expect(logged(on.fight, 'rally2')).toBe(1), 'rally2', 'a rallied the party between fights: everyone caught their breath.', null],
    ['Rally 2: no extra special use below level 3', 'rally', 2, smiter,
      (on) => expect(fired([on.fight], 'smite')).toBe(1), 'rally3', null, null],
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
