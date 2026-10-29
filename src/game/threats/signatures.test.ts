import { newHero } from '@/content/heroes';
import { itemById, opportunityById } from '@/content/lookup';

import { answersMemberOf, prepareParty } from '../expeditions/simulate';
import { createInitialSave, type SaveData } from '../save';
import type { ActiveThreat, Briefing, ConsumableDef, HeroClassId, HeroState, MealEffect, ThreatId } from '../types';
import { heroAnswers, type AnswersMember } from './answers';
import { briefingCoverage } from './coverage';
import { launchEffects } from './penalties';
import { scoreBriefing, scoreOpportunity, scoreThreat } from './score';
import { partyMeal, penaltyReduction, signatureBriefing } from './signatures';

const member = (classId: HeroClassId, overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: classId,
  classId,
  traitId: 'none',
  gearKeywords: [],
  kit: null,
  salveElement: null,
  classResists: [],
  ...overrides,
});
const kit = (itemId: string) => ({ itemId, effect: (itemById[itemId] as ConsumableDef).kit! });
const threat = (id: ThreatId, level: 1 | 2 | 3): ActiveThreat => ({ id, level });
const briefing = (threats: ActiveThreat[], extra: Partial<Briefing> = {}): Briefing => ({ threats, restriction: null, opportunity: null, ...extra });
const answered = (...members: AnswersMember[]) => members.map((m) => heroAnswers(m));

/** A save with these heroes at home. */
const saveWith = (...heroes: HeroState[]): SaveData => ({ ...createInitialSave(), heroes, gear: [], consumables: { roguesRoll: 1, lantern: 1 } });

describe('keyword signatures', () => {
  it('counts the Exorcist as two Blessed heroes against Undead', () => {
    expect(scoreThreat(threat('undead', 2), answered(member('exorcist')))).toMatchObject({ state: 'met', have: 2 });
    expect(scoreThreat(threat('undead', 2), answered(member('cleric')))).toMatchObject({ state: 'half', have: 1 });
  });

  it('counts the Necromancer as one Blessed hero at Undead 2 and 3 only, and not in an anti-magic zone', () => {
    expect(scoreThreat(threat('undead', 1), answered(member('necromancer'))).have).toBe(0);
    expect(scoreThreat(threat('undead', 2), answered(member('necromancer'))).have).toBe(1);
    expect(scoreThreat(threat('undead', 3), [heroAnswers(member('necromancer'), 'antiMagic')]).have).toBe(0);
  });

  it('counts the Beastmaster as two Calm heroes at Beasts 2 and 3, one (their keyword) at level 1', () => {
    expect(scoreThreat(threat('beasts', 1), answered(member('beastmaster'))).have).toBe(1);
    expect(scoreThreat(threat('beasts', 2), answered(member('beastmaster')))).toMatchObject({ state: 'met', have: 2 });
  });
});

describe('approach signatures', () => {
  it('gives the Exorcist +1 Faith on Desecrated ground only', () => {
    // Faith 3 + 1 meets Extreme (needs 4); Casters stay at Faith 3.
    expect(scoreThreat(threat('desecrated', 3), answered(member('exorcist'))).state).toBe('met');
    expect(scoreThreat(threat('casters', 3), answered(member('exorcist'))).state).toBe('half');
  });

  it('lets the Diplomat answer Locals at any level', () => {
    expect(scoreThreat(threat('locals', 3), answered(member('diplomat')))).toMatchObject({ state: 'met', have: 5 });
    expect(scoreThreat(threat('rubble', 2), answered(member('diplomat'))).state).toBe('full');
  });

  it('gives the Engineer +3 from their own kit instead of +2', () => {
    // Finesse 1: +3 meets Extreme traps (needs 4), +2 falls one short.
    expect(scoreThreat(threat('traps', 3), answered(member('engineer', { kit: kit('roguesRoll') }))).state).toBe('met');
    expect(scoreThreat(threat('traps', 3), answered(member('warrior', { kit: kit('roguesRoll') }))).state).toBe('half');
  });

  it('gives the Monk Pierce with bare fists, which answers Armoured', () => {
    const save = saveWith(newHero('m', 'M', 'monk', 'none'));
    const [monk] = prepareParty(save, ['m']);
    expect(monk.classKeywords).toContain('pierce');
    expect(scoreThreat(threat('armoured', 1), [heroAnswers(answersMemberOf(monk))]).state).toBe('met');
  });
});

describe('the Porter', () => {
  const porterSave = () => {
    const porter: HeroState = { ...newHero('p', 'P', 'porter', 'none'), kitFor: 't' };
    const thief = newHero('t', 'T', 'thief', 'none');
    return { ...saveWith({ ...porter, equipment: { ...porter.equipment, consumable: 'roguesRoll' } }, thief) };
  };

  it('carries their kit for the chosen hero: it counts as theirs, and as the Porter’s for salvage', () => {
    const party = prepareParty(porterSave(), ['p', 't']);
    const answers = party.map((m) => heroAnswers(answersMemberOf(m)));
    // Thief Finesse 4 + 2 (capped at 5) meets Extreme traps; the Porter's Finesse 2 gets nothing.
    expect(answers.find((a) => a.heroId === 'p')!.kitItemId).toBeNull();
    const score = scoreThreat(threat('locked', 3), answers);
    expect(score).toMatchObject({ state: 'met', coveredBy: [{ heroId: 't', source: 'carried' }] });
    expect(scoreThreat(threat('traps', 3), answers).state).toBe('met');
  });

  it('reports the Porter as the kit hero when the carried kit decides a threat or an opportunity', () => {
    const save = porterSave();
    const answers = prepareParty(save, ['p', 't']).map((m) => heroAnswers(answersMemberOf(m)));
    // With Finesse 2, the carried +2 is what meets Extreme thieves.
    const clumsy = answers.map((a) => (a.heroId === 't' ? { ...a, approaches: { ...a.approaches, finesse: 2 } } : a));
    expect(scoreBriefing(briefing([threat('thieves', 3)]), clumsy).kitHeroes).toEqual(['p']);
    // Finesse 4 + 2 reaches a cache that needs 5.
    const cache = { ...opportunityById.hiddenCache, answers: [{ approach: 'finesse' as const, score: 5 }] };
    expect(scoreOpportunity(cache, answers)).toEqual({ answered: true, kitHeroId: 'p' });
  });

  it('keeps the kit when the chosen hero is not in the party', () => {
    const [porter] = prepareParty(porterSave(), ['p']);
    expect(heroAnswers(answersMemberOf(porter)).kitItemId).toBe('roguesRoll');
  });
});

describe('briefing signatures', () => {
  it('lets a Curse-breaker cancel any restriction, a Cook only Spoiled stores', () => {
    const fog = briefing([], { restriction: 'thickFog' });
    expect(signatureBriefing(fog, [member('curseBreaker')])).toMatchObject({ briefing: { restriction: null }, cancelledBy: 'curseBreaker' });
    expect(signatureBriefing(fog, [member('cook')])).toMatchObject({ briefing: { restriction: 'thickFog' }, cancelledBy: null });
    expect(signatureBriefing(briefing([], { restriction: 'spoiledStores' }), [member('cook')]).briefing.restriction).toBeNull();
  });

  it('lets a Scout lower the Extreme threat that is worst for the party to Strong', () => {
    // The thief meets Extreme traps (Finesse 4) but misses Extreme rubble (Might 1): rubble is lowered.
    const signed = signatureBriefing(briefing([threat('traps', 3), threat('rubble', 3)]), [member('scout'), member('thief')]);
    expect(signed.lowered).toEqual({ threatId: 'rubble', heroId: 'scout' });
    expect(signed.briefing.threats).toEqual([threat('traps', 3), threat('rubble', 2)]);
    expect(signatureBriefing(briefing([threat('traps', 2)]), [member('scout')]).lowered).toBeNull();
  });

  it('shows the lowered threat and the cancelled restriction in the team preparation coverage', () => {
    const save = saveWith(newHero('s', 'Sable', 'scout', 'none'), newHero('c', 'Cass', 'curseBreaker', 'none'));
    const coverage = briefingCoverage(save, ['s', 'c'], briefing([threat('rubble', 3)], { restriction: 'cursedLuck' }));
    expect(coverage.threats[0]).toMatchObject({ threat: { id: 'rubble', level: 2 }, loweredBy: 'Sable' });
    expect(coverage.restriction).toMatchObject({ id: 'cursedLuck', cancelledBy: 'Cass' });
  });
});

describe('penalty and meal signatures', () => {
  it('halves missed Delay with a Ranger and missed Hunger with a Cook, once per party', () => {
    expect(penaltyReduction(['ranger', 'ranger', 'warrior'])).toEqual({ delay: 0.5, hunger: 1 });
    expect(penaltyReduction(['cook'])).toEqual({ delay: 1, hunger: 0.5 });
    // Extreme maze, fully missed: +50% time and 3 supply; halved: +25% and 1 (rounded down).
    const scores = scoreBriefing(briefing([threat('maze', 3)]), answered(member('warrior'))).threats;
    expect(launchEffects(scores)).toEqual({ timeMultiplier: 1.5, extraSupply: 3 });
    expect(launchEffects(scores, undefined, { delay: 0.5, hunger: 0.5 })).toEqual({ timeMultiplier: 1.25, extraSupply: 1 });
  });

  it('doubles the meal’s bonus with a Cook, and keeps it under Spoiled stores only once cancelled', () => {
    const stew: MealEffect = { kind: 'bossHeal', pct: 0.15 };
    const bites: MealEffect = { kind: 'duration', multiplier: 0.9 };
    expect(partyMeal(stew, briefing([]), ['cook'])).toEqual({ kind: 'bossHeal', pct: 0.3 });
    expect(partyMeal(bites, briefing([]), ['cook'])).toEqual({ kind: 'duration', multiplier: 0.8 });
    expect(partyMeal({ kind: 'speed', add: 1 }, briefing([]), ['cook', 'warrior'])).toEqual({ kind: 'speed', add: 2 });
    expect(partyMeal(stew, briefing([]), ['warrior'])).toBe(stew);
    expect(partyMeal(stew, briefing([], { restriction: 'spoiledStores' }), ['warrior'])).toBeNull();
  });
});
