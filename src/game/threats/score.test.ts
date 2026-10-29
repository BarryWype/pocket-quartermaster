import { heroClasses } from '@/content/heroes';
import { itemById, opportunityById } from '@/content/lookup';

import type { ConsumableDef } from '../types';
import { heroAnswers, type AnswersMember } from './answers';
import { kitApplies, scoreBriefing, scoreOpportunity, scoreThreat, type ThreatScore } from './score';

const member = (overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: 'h',
  classId: 'warrior',
  traitId: 'none',
  weaponType: null,
  kit: null,
  salveElement: null,
  classResists: [],
  ...overrides,
});

const kit = (itemId: string) => {
  const item = itemById[itemId] as ConsumableDef;
  return { itemId, effect: item.kit! };
};

const salve = (itemId: string) => {
  const item = itemById[itemId] as ConsumableDef;
  return { kit: { itemId, effect: item.kit! }, salveElement: item.protectsAgainst! };
};

/** A party already answered, one member per given override (no restriction). */
const party = (...overrides: Partial<AnswersMember>[]) =>
  overrides.map((overrides, i) => heroAnswers(member({ heroId: `h${i + 1}`, ...overrides }), null));

const threat = (id: ThreatScore['threat']['id'], level: 1 | 2 | 3, element?: ThreatScore['threat']['element']) => ({
  id,
  level,
  ...(element ? { element } : {}),
});

describe('scoring approach threats', () => {
  it('needs the best hero at 2, 3 and 4 by level', () => {
    expect(scoreThreat(threat('traps', 1), party({ classId: 'warrior' }))).toMatchObject({ state: 'half', have: 1, needed: 2 });
    expect(scoreThreat(threat('traps', 1), party({ classId: 'thief' })).state).toBe('met');
    expect(scoreThreat(threat('traps', 2), party({ classId: 'warrior' })).state).toBe('full');
    expect(scoreThreat(threat('traps', 2), party({ classId: 'thief' })).state).toBe('met');
    expect(scoreThreat(threat('traps', 3), party({ classId: 'thief' })).state).toBe('met');
  });

  it('adds the kit bonus only for the threats the kit covers', () => {
    const withRoll = party({ classId: 'warrior', kit: kit('roguesRoll') });
    expect(scoreThreat(threat('traps', 2), withRoll)).toMatchObject({ state: 'met', have: 3, needed: 3 });
    expect(scoreThreat(threat('traps', 2), withRoll).kitHeroes).toEqual(['h1']);
    // The rogue’s roll covers thieves and locked too, but not the locals.
    expect(scoreThreat(threat('thieves', 2), withRoll).state).toBe('met');
    expect(scoreThreat(threat('rubble', 1), withRoll).state).toBe('met'); // might 3, unaided
    const gifts = scoreThreat(threat('locals', 2), party({ classId: 'warrior', kit: kit('roguesRoll') }));
    expect(gifts).toMatchObject({ state: 'met', intimidated: true });
    expect(gifts).not.toHaveProperty('forced');
  });

  it('caps the kit bonus at 5', () => {
    expect(scoreThreat(threat('traps', 3), party({ classId: 'thief', kit: kit('roguesRoll') }))).toMatchObject({
      state: 'met',
      have: 5,
    });
  });

  it("lifts only rubble and underwater for the explorer's kit", () => {
    const explorer = party({ classId: 'warrior', kit: kit('explorersKit') });
    expect(scoreThreat(threat('rubble', 2), explorer)).toMatchObject({ state: 'met', have: 5 });
    expect(scoreThreat(threat('underwater', 3), explorer)).toMatchObject({ state: 'half', have: 3 });
    expect(scoreThreat(threat('underwater', 3), party({ classId: 'frostMage', kit: kit('explorersKit') }))).toMatchObject({
      state: 'met',
      have: 5,
    });
    expect(scoreThreat(threat('traps', 1), explorer)).toMatchObject({ state: 'half', have: 1 });
    expect(scoreThreat(threat('puzzle', 1), explorer)).toMatchObject({ state: 'half', have: 1 });
  });

  it('shows who answered and whose kit did it', () => {
    expect(scoreThreat(threat('traps', 2), party({ classId: 'thief' })).coveredBy).toEqual([
      { heroId: 'h1', source: 'class' },
    ]);
    expect(scoreThreat(threat('traps', 2), party({ classId: 'warrior', kit: kit('roguesRoll') })).coveredBy).toEqual([
      { heroId: 'h1', source: 'kit' },
    ]);
    // A kit that changes nothing is not the reason the threat was met.
    expect(scoreThreat(threat('traps', 3), party({ classId: 'thief', kit: kit('roguesRoll') })).kitHeroes).toEqual([]);
  });
});

describe('scoring keyword threats', () => {
  it('needs 1, 2 and 3 heroes with the keyword by level', () => {
    expect(scoreThreat(threat('beasts', 1), party({ classId: 'warrior' }))).toMatchObject({
      state: 'half',
      have: 0,
      needed: 1,
    });
    expect(scoreThreat(threat('beasts', 1), party({ classId: 'druid' })).state).toBe('met');
    expect(scoreThreat(threat('beasts', 2), party({ classId: 'druid' })).state).toBe('half');
    expect(scoreThreat(threat('beasts', 2), party({ classId: 'druid' }, { classId: 'druid' })).state).toBe('met');
    expect(scoreThreat(threat('beasts', 3), party({ classId: 'druid' }, { classId: 'druid' })).state).toBe('half');
    expect(scoreThreat(threat('beasts', 3), party({ classId: 'druid' })).state).toBe('full');
  });

  it('counts a kit once per hero', () => {
    expect(scoreThreat(threat('beasts', 1), party({ classId: 'warrior', kit: kit('huntersPack') }))).toMatchObject({
      state: 'met',
      have: 1,
    });
    // A druid with a hunter’s pack still counts once.
    expect(scoreThreat(threat('beasts', 1), party({ classId: 'druid', kit: kit('huntersPack') }))).toMatchObject({
      have: 1,
      coveredBy: [{ heroId: 'h1', source: 'class' }],
    });
  });

  it('lists every holder with the source that gave the keyword', () => {
    expect(scoreThreat(threat('beasts', 2), party({ classId: 'druid' }, { kit: kit('huntersPack') })).coveredBy).toEqual([
      { heroId: 'h1', source: 'class' },
      { heroId: 'h2', source: 'kit' },
    ]);
    expect(scoreThreat(threat('beasts', 2), party({ classId: 'druid' }, { kit: kit('huntersPack') })).kitHeroes).toEqual([
      'h2',
    ]);
    // Each kit alone keeps the threat met at half, so both hinged on it.
    const twoKits = party({ kit: kit('huntersPack') }, { kit: kit('huntersPack') });
    expect(scoreThreat(threat('beasts', 2), twoKits).kitHeroes).toEqual(['h1', 'h2']);
  });
});

describe('scoring the element threat', () => {
  const fire = () => threat('element', 2, 'fire');
  const mage = (overrides: Partial<AnswersMember> = {}) =>
    member({ classId: 'fireMage', classResists: heroClasses.fireMage.resists!, ...overrides });

  it('counts heroes with Resist of the element', () => {
    expect(scoreThreat(fire(), party({ classId: 'warrior' }))).toMatchObject({ state: 'full', have: 0, needed: 2 });
    expect(scoreThreat(fire(), [heroAnswers(mage(), null)])).toMatchObject({ state: 'half', have: 1 });
    expect(
      scoreThreat(fire(), [heroAnswers(mage(), null), heroAnswers(member({ ...salve('emberWardSalve') }), null)]),
    ).toMatchObject({ state: 'met', have: 2 });
  });

  it('credits a ward salve as a kit', () => {
    const score = scoreThreat(fire(), [heroAnswers(member({ heroId: 'h1', ...salve('emberWardSalve') }), null)]);
    expect(score.coveredBy).toEqual([{ heroId: 'h1', source: 'kit' }]);
    expect(score.kitHeroes).toEqual(['h1']);
  });
});

describe('scoring locked and locals with an alternative', () => {
  it('meets locked with Might, forced, but never otherwise', () => {
    const score = scoreThreat(threat('locked', 2), party({ classId: 'warrior' }));
    expect(score).toMatchObject({ state: 'met', forced: true, have: 3, needed: 3 });
    expect(scoreThreat(threat('locked', 2), party({ classId: 'thief' }))).not.toHaveProperty('forced');
    // Neither approach reaches the level: the Finesse state stands.
    const undone = scoreThreat(threat('locked', 3), party({ classId: 'warrior' }));
    expect(undone).toMatchObject({ state: 'full' });
    expect(undone).not.toHaveProperty('forced');
  });

  it('meets locals with Might by intimidation, without a fight', () => {
    const charmed = scoreThreat(threat('locals', 1), party({ classId: 'troubadour' }));
    expect(charmed).toMatchObject({ state: 'met' });
    expect(charmed).not.toHaveProperty('intimidated');
    expect(scoreThreat(threat('locals', 1), party({ classId: 'warrior' }))).toMatchObject({
      state: 'met',
      intimidated: true,
    });
    const shrugged = scoreThreat(threat('locals', 1), party({ classId: 'thief' }));
    expect(shrugged).toMatchObject({ state: 'half' });
    expect(shrugged).not.toHaveProperty('intimidated');
  });
});

describe('scoring a whole briefing', () => {
  it('scores every threat and collects the kits anything hinged on', () => {
    const briefing = { threats: [threat('traps', 2), threat('beasts', 2)], restriction: null, opportunity: null };
    const score = scoreBriefing(
      briefing,
      party({ classId: 'warrior', kit: kit('roguesRoll') }, { kit: kit('huntersPack') }, { kit: kit('huntersPack') }),
    );
    expect(score.threats.map((t) => t.state)).toEqual(['met', 'met']);
    expect(score.kitHeroes).toEqual(['h1', 'h2', 'h3']);
  });
});

describe('scoring opportunities', () => {
  it('needs any one answer', () => {
    expect(scoreOpportunity(opportunityById.hiddenCache, party({ classId: 'thief' })).answered).toBe(true);
    expect(scoreOpportunity(opportunityById.hiddenCache, party({ classId: 'warrior' })).answered).toBe(false);
    expect(scoreOpportunity(opportunityById.prisoners, party({ classId: 'warrior' })).answered).toBe(true);
    expect(scoreOpportunity(opportunityById.prisoners, party({ classId: 'ranger' })).answered).toBe(false);
    expect(scoreOpportunity(opportunityById.healingSpring, party()).answered).toBe(true);
  });

  it('only happens for a costly opportunity when opted in', () => {
    expect(scoreOpportunity(opportunityById.refugees, party(), false).answered).toBe(false);
    expect(scoreOpportunity(opportunityById.refugees, party(), true).answered).toBe(true);
  });

  it('names the kit whose keyword answered it', () => {
    expect(scoreOpportunity(opportunityById.trophyBeast, party({ classId: 'druid' })).kitHeroId).toBeNull();
    // The ranger has no calm and no Might for it: the hunter’s pack did it.
    expect(scoreOpportunity(opportunityById.trophyBeast, party({ classId: 'ranger', kit: kit('huntersPack') })).kitHeroId).toBe(
      'h1',
    );
    // Might answers it too, so the kit changed nothing.
    expect(
      scoreOpportunity(opportunityById.trophyBeast, party({ kit: kit('huntersPack') }, { classId: 'warrior' })).kitHeroId,
    ).toBeNull();
  });

  it('counts a kit’s approach bonus for opportunities, except Explorer’s kit', () => {
    expect(scoreOpportunity(opportunityById.bounty, party({ classId: 'cleric', kit: kit('giftBasket') }))).toMatchObject({ answered: true, kitHeroId: expect.any(String) });
    expect(scoreOpportunity(opportunityById.richVein, party({ classId: 'cleric', kit: kit('explorersKit') })).answered).toBe(false);
    expect(scoreOpportunity(opportunityById.bounty, party({ classId: 'troubadour' })).answered).toBe(true);
  });
});

describe('kitApplies', () => {
  it('follows the threats a kit covers', () => {
    expect(kitApplies('roguesRoll', 'traps', 'finesse')).toBe(true);
    expect(kitApplies('roguesRoll', 'traps', 'might')).toBe(false);
    expect(kitApplies('roguesRoll', 'rubble', 'might')).toBe(false);
    expect(kitApplies('explorersKit', 'rubble', 'might')).toBe(true);
    expect(kitApplies('explorersKit', 'traps', 'finesse')).toBe(false);
    expect(kitApplies(null, 'traps', 'finesse')).toBe(false);
  });
});
