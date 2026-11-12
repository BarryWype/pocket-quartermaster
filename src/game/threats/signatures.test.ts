import { familyOfThreat } from '@/content/families';
import { newHero } from '@/content/heroes';

import { answersMemberOf, prepareParty } from '../expeditions/simulate';
import { createInitialSave, type SaveData } from '../save';
import type { ActiveThreat, Briefing, HeroClassId, HeroState, MealEffect, ThreatId } from '../types';
import type { HeroFamilyTag } from '../families/families';
import { heroAnswers, type AnswersMember } from './answers';
import { briefingCoverage } from './coverage';
import { familyCount, scoreThreat } from './score';
import { partyMeal, penaltyReduction, signatureBriefing } from './signatures';

const tag = (family: HeroFamilyTag['family'], count = 1): HeroFamilyTag => ({ family, count, source: 'class' });

const member = (classId: HeroClassId, overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: classId,
  classId,
  traitId: 'none',
  familyTags: [],
  ...overrides,
});
const threat = (id: ThreatId, level: 1 | 2 | 3): ActiveThreat => ({ id, level });
const briefing = (threats: ActiveThreat[], extra: Partial<Briefing> = {}): Briefing => ({ threats, restriction: null, opportunity: null, ...extra });
const answered = (...members: AnswersMember[]) => members.map((m) => heroAnswers(m));

/** A save with these heroes at home. */
const saveWith = (...heroes: HeroState[]): SaveData => ({ ...createInitialSave(), heroes, gear: [], consumables: {} });

describe('familyVsThreat signatures', () => {
  it('adds the Exorcist’s +1 Faith against Holy', () => {
    expect(scoreThreat(threat('holy', 3), answered(member('exorcist', { familyTags: [tag('faith', 2)] })))).toMatchObject({ state: 'met', have: 3 });
    expect(scoreThreat(threat('holy', 3), answered(member('cleric', { familyTags: [tag('faith', 2)] })))).toMatchObject({ state: 'half', have: 2 });
  });

  it('adds the Necromancer’s +1 Faith at every Holy level', () => {
    expect(countVs(member('necromancer'), 'holy', 1)).toBe(1);
    expect(countVs(member('necromancer'), 'holy', 2)).toBe(1);
    expect(countVs(member('necromancer'), 'holy', 3)).toBe(1);
  });

  it('adds the Beastmaster’s +1 Wild at every Beasts level', () => {
    expect(countVs(member('beastmaster'), 'beasts', 1)).toBe(1);
    expect(countVs(member('beastmaster'), 'beasts', 2)).toBe(1);
    expect(scoreThreat(threat('beasts', 2), answered(member('beastmaster', { familyTags: [tag('wild', 1)] })))).toMatchObject({ state: 'met' });
  });

  it('adds the Druid’s +1 Wild, the Curse-breaker’s +1 Warding and the Monk’s +1 Breaker against their threats', () => {
    expect(countVs(member('druid'), 'beasts', 1)).toBe(1);
    expect(countVs(member('curseBreaker'), 'element', 2)).toBe(1);
    expect(countVs(member('monk'), 'armoured', 3)).toBe(1);
  });

  it('adds the Engineer’s +1 Cunning against Traps', () => {
    expect(scoreThreat(threat('traps', 3), answered(member('engineer', { familyTags: [tag('cunning', 2)] })))).toMatchObject({ state: 'met' });
    expect(scoreThreat(threat('traps', 3), answered(member('warrior', { familyTags: [tag('cunning', 2)] })))).toMatchObject({ state: 'half' });
  });

  it('adds the trait bonuses: Light sleeper lifts Watch, Clumsy and Loud drag theirs', () => {
    expect(scoreThreat(threat('darkness', 3), answered(member('warrior', { traitId: 'lightSleeper', familyTags: [tag('watch', 2)] })))).toMatchObject({ state: 'met' });
    expect(scoreThreat(threat('traps', 2), answered(member('warrior', { traitId: 'clumsy', familyTags: [tag('cunning', 3)] })))).toMatchObject({ state: 'met' });
    expect(scoreThreat(threat('traps', 2), answered(member('warrior', { traitId: 'clumsy', familyTags: [tag('cunning', 2)] })))).toMatchObject({ state: 'half' });
    expect(scoreThreat(threat('darkness', 1), answered(member('warrior', { traitId: 'loud', familyTags: [tag('watch', 1)] })))).toMatchObject({ state: 'half' });
  });
});

/** The count a lone member brings to bear on `threatId` at that threat’s level. */
const countVs = (m: AnswersMember, threatId: ThreatId, level: 1 | 2 | 3) =>
  familyCount([heroAnswers(m)], familyOfThreat(threatId), level);

describe('briefing signatures', () => {
  it('lets a Curse-breaker cancel any restriction, a Cook only Spoiled stores', () => {
    const cursed = briefing([], { restriction: 'cursedLuck' });
    expect(signatureBriefing(cursed, [member('curseBreaker')])).toMatchObject({ briefing: { restriction: null }, cancelledBy: 'curseBreaker' });
    expect(signatureBriefing(cursed, [member('cook')])).toMatchObject({ briefing: { restriction: 'cursedLuck' }, cancelledBy: null });
    expect(signatureBriefing(briefing([], { restriction: 'spoiledStores' }), [member('cook')]).briefing.restriction).toBeNull();
  });

  it('lets a Scout lower the threat that is worst for the party by one level', () => {
    // The party answers Extreme traps (Cunning 6) but misses Extreme holy: holy is lowered.
    const tags = [tag('cunning', 6)];
    const signed = signatureBriefing(briefing([threat('traps', 3), threat('holy', 3)]), [member('scout'), member('thief', { familyTags: tags })]);
    expect(signed.lowered).toEqual({ threatId: 'holy', heroId: 'scout', from: 3, to: 2 });
    expect(signed.briefing.threats).toEqual([threat('traps', 3), threat('holy', 2)]);
    // Among threats missed alike, the higher level goes down.
    expect(signatureBriefing(briefing([threat('beasts', 1), threat('traps', 2)]), [member('scout')]).lowered).toMatchObject({ threatId: 'traps', to: 1 });
  });

  it('lets a Scout clear a level 1 threat from the briefing, and does nothing without one', () => {
    const signed = signatureBriefing(briefing([threat('beasts', 1)]), [member('scout')]);
    expect(signed.lowered).toEqual({ threatId: 'beasts', heroId: 'scout', from: 1, to: 0 });
    expect(signed.briefing.threats).toEqual([]);
    expect(signatureBriefing(briefing([]), [member('scout')]).lowered).toBeNull();
    expect(signatureBriefing(briefing([threat('traps', 2)]), [member('warrior')]).lowered).toBeNull();
  });

  it('shows the lowered threat and the cancelled restriction in the team preparation coverage', () => {
    const save = saveWith(newHero('s', 'Sable', 'scout', 'none'), newHero('c', 'Cass', 'curseBreaker', 'none'));
    const coverage = briefingCoverage(save, ['s', 'c'], briefing([threat('holy', 3)], { restriction: 'cursedLuck' }));
    expect(coverage.threats[0]).toMatchObject({ threat: { id: 'holy', level: 2 }, loweredBy: 'Sable' });
    expect(coverage.restriction).toMatchObject({ id: 'cursedLuck', cancelledBy: 'Cass' });
  });
});

describe('penalty and meal signatures', () => {
  it('leaves missed Traps uncut for a Ranger', () => {
    expect(penaltyReduction(['ranger', 'ranger', 'warrior'])).toEqual({ threats: {} });
    expect(penaltyReduction(['warrior'])).toEqual({ threats: {} });
  });

  it('doubles the meal’s bonus with a Cook, and keeps it under Spoiled stores only once cancelled', () => {
    const stew: MealEffect = { kind: 'bossHeal', pct: 0.15 };
    const bites: MealEffect = { kind: 'duration', multiplier: 0.9 };
    expect(partyMeal(stew, briefing([]), ['cook'])).toEqual({ kind: 'bossHeal', pct: 0.3 });
    expect(partyMeal(bites, briefing([]), ['cook'])).toEqual({ kind: 'duration', multiplier: 0.8 });
    expect(partyMeal({ kind: 'speed', add: 1 }, briefing([]), ['cook', 'warrior'])).toEqual({ kind: 'speed', add: 2 });
    expect(partyMeal(stew, briefing([]), ['warrior'])).toBe(stew);
    expect(partyMeal(stew, briefing([], { restriction: 'spoiledStores' }), ['warrior'])).toBeNull();
    // The trout doubles like any add; the chowder is a plain cut, not a bonus.
    expect(partyMeal({ kind: 'crit', add: 10 }, briefing([]), ['cook'])).toEqual({ kind: 'crit', add: 20 });
    const chowder: MealEffect = { kind: 'penaltyCut', threats: ['element', 'poison'], multiplier: 0.5 };
    expect(partyMeal(chowder, briefing([]), ['cook'])).toBe(chowder);
  });

  it('wires the party’s family tags through prepareParty', () => {
    const save = saveWith(newHero('m', 'Mira', 'fireMage', 'none'));
    const [mage] = prepareParty(save, ['m']);
    expect(answersMemberOf(mage).familyTags).toEqual([
      { family: 'spellweave', count: 1, source: 'class' },
    ]);
  });
});
