import type { FamilyEffectId, FamilyId } from '@/content/families';

import type { Briefing } from '../types';
import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';

const taken = (f: FamilyFight) => f.fight.taken.a ?? 0;
/** The boss's hits on hero a: 5 each, one a round. */
const hits = (f: FamilyFight) => taken(f) / 5;
const sturdy = { maxHp: 1e6 };
/** Darkness 3: a Watch 2 party is half short, so the first fight is exposed. */
const darkness: Briefing = { threats: [{ id: 'darkness', level: 3 }], restriction: null, opportunity: null };

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family control', () => {
  test.each<Case>([
    ['Breaker 2: a crit staggers the target, which loses its next turn', 'breaker', 2, { party: { a: { ...sturdy, crit: 50 } } },
      (on, off) => {
        const crits = (on.fight.dealt.a / 10 - on.fight.rounds) / 0.5;
        const lost = hits(off) - hits(on);
        expect(on.fight.rounds).toBe(off.fight.rounds);
        expect(lost).toBeGreaterThan(0);
        // A staggered foe can't be staggered again before it loses its turn.
        expect(lost).toBeLessThanOrEqual(crits);
      }, 'breaker2', 'a’s crushing blow left a foe reeling.', 'Le coup écrasant de a a laissé un ennemi chancelant.'],
    ['Breaker 2: no crit, no stagger', 'breaker', 2, { party: { a: sturdy } },
      (on, off) => expect(hits(on)).toBe(hits(off)), 'breaker2', null, null],
    ['Watch 2: never exposed, and the would-be ambushers lose their first turn', 'watch', 2, { party: { a: sturdy }, options: { briefing: darkness } },
      (on) => {
        expect(on.fight.effects.some((e) => e.key === 'exposed')).toBe(false);
        expect(hits(on)).toBe(on.fight.rounds - 1);
      }, 'watch2', 'The Watch spotted the ambush: the enemies lost their first turn.', 'La Vigie a repéré l’embuscade : les ennemis ont perdu leur premier tour.'],
    ['Watch 1 is still ambushed', 'watch', 1, { party: { a: sturdy }, options: { briefing: darkness } },
      (on) => {
        expect(on.fight.effects.some((e) => e.key === 'exposed')).toBe(true);
        expect(hits(on)).toBe(on.fight.rounds);
      }, 'watch2', null, null],
    ['Watch 2: nothing to turn without an ambush', 'watch', 2, { party: { a: sturdy } },
      (on, off) => expect(hits(on)).toBe(hits(off)), 'watch2', null, null],
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
