import type { FamilyEffectId, FamilyId } from '@/content/families';

import type { Briefing } from '../types';
import { familyEffects } from './familyEffects';
import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';

const taken = (f: FamilyFight) => f.fight.taken.a ?? 0;
/** The boss's hits on hero a: 5 each, one a round. */
const hits = (f: FamilyFight) => taken(f) / 5;
const sturdy = { maxHp: 1e6 };
/** Darkness 3: a Watch 1 party (2 tags) is one short, so the first fight is exposed; Watch 2 (4 tags) answers it. */
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
    ['Watch 1 is still ambushed', 'watch', 1, { party: { a: sturdy }, options: { briefing: darkness } },
      (on) => {
        expect(on.fight.effects.some((e) => e.key === 'exposed')).toBe(true);
        expect(hits(on)).toBe(on.fight.rounds);
      }, 'watch2', null, null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });

  test('Watch 2: the party ambushes one fight of the run, whose enemies lose their first turn', () => {
    const setup: FightSetup = { mobs: [{ mobId: 'giantRat', count: 3 }], fights: 3, party: { a: { power: 4, maxHp: 1e6 } } };
    const on = familyFight('watch', 2, setup);
    const off = familyFight(null, 0, setup);
    expect(off.run.encounters.map((e) => e.kind)).toEqual(['fight', 'fight', 'fight', 'boss']);
    // Equal fights: the first is the weakest, and it is still fought.
    expect(on.run.encounters.map((e) => [e.kind, logged(e, 'watch2')])).toEqual([
      ['fight', 1],
      ['fight', 0],
      ['fight', 0],
      ['boss', 0],
    ]);
    expect(on.run.encounters[0].taken.a).toBeLessThan(off.run.encounters[0].taken.a);
    expect(on.log).toContain('a led the party into an ambush: the enemies lost their first turn.');
    expect(on.logFr).toContain('a a mené le groupe dans une embuscade : les ennemis ont perdu leur premier tour.');
  });

  test('Watch 2 ambushes the weakest fight, the first of equals, and never the boss', () => {
    const watch2 = familyEffects.find((e) => e.family === 'watch' && e.level === 2)!;
    const ambushed: number[] = [];
    const plan = (fights: { index: number; strength: number }[]) => {
      ambushed.length = 0;
      watch2.hooks.runPlan!({ fights, heroOf: () => undefined, skip: () => undefined, ambush: (index) => ambushed.push(index) });
      return [...ambushed];
    };
    expect(plan([{ index: 0, strength: 50 }, { index: 2, strength: 10 }, { index: 3, strength: 30 }])).toEqual([2]);
    expect(plan([{ index: 1, strength: 10 }, { index: 4, strength: 10 }])).toEqual([1]);
    expect(plan([])).toEqual([]);
    // A boss-only run has no fight to ambush.
    expect(familyFight('watch', 2, { party: { a: sturdy } }).run.encounters.map((e) => e.kind)).toEqual(['boss']);
  });
});
