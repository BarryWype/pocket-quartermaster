import { familyOfThreat, familyRules } from '@/content/families';
import { opportunityById, threatById } from '@/content/lookup';

import type { FamilyId } from '@/content/families';
import type { ActiveThreat, OpportunityDef, ThreatId } from '../types';
import type { HeroFamilyTag } from '../families/families';
import { heroAnswers, type AnswersMember } from './answers';
import { familyCount, scoreBriefing, scoreOpportunity, scoreThreat, type ThreatScore } from './score';

const tag = (family: FamilyId, count = 1, overrides: Partial<HeroFamilyTag> = {}): HeroFamilyTag => ({
  family,
  count,
  magic: false,
  fromClass: true,
  source: 'class',
  ...overrides,
});

const member = (overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: 'h',
  classId: 'warrior',
  traitId: 'none',
  familyTags: [],
  ...overrides,
});

/** A party of one member per override, already answered (no restriction). */
const party = (...overrides: Partial<AnswersMember>[]) =>
  overrides.map((overrides, i) => heroAnswers(member({ heroId: `h${i + 1}`, ...overrides }), null));

/** A party whose only member carries `count` tags of `family`. */
const familyParty = (family: FamilyId, count: number) => party({ familyTags: [tag(family, count)] });

const threat = (id: ThreatId, level: 1 | 2 | 3): ActiveThreat => ({ id, level });

describe('scoring threats by family tags', () => {
  it('meets a threat at level N with N tags of its family, half one tag short, full two short', () => {
    for (const id of Object.keys(threatById) as ThreatId[]) {
      const family = familyOfThreat(id);
      for (const level of [1, 2, 3] as const) {
        const at = (count: number): ThreatScore => scoreThreat(threat(id, level), familyParty(family, Math.max(0, count)));
        expect(at(level)).toMatchObject({ state: 'met', have: level, needed: level });
        expect(at(level + 1).state).toBe('met');
        expect(at(level - 1).state).toBe('half');
        // Two tags short is a full miss; level 1 cannot fall further than half.
        expect(at(level - 2).state).toBe(level >= 2 ? 'full' : 'half');
      }
    }
  });

  it('counts the whole party’s tags of the threat’s family', () => {
    const split = party({ familyTags: [tag('cunning')] }, { familyTags: [tag('cunning')] });
    expect(familyCount(split, 'cunning', 1)).toBe(2);
    expect(scoreThreat(threat('traps', 2), split)).toMatchObject({ state: 'met', have: 2, needed: 2 });
    expect(scoreThreat(threat('traps', 3), split)).toMatchObject({ state: 'half', have: 2, needed: 3 });
  });

  it('lists every hero contributing a tag of the family, with the source that gave it', () => {
    const score = scoreThreat(
      threat('holy', 1),
      party({ familyTags: [tag('faith')] }, { familyTags: [tag('faith', 1, { source: 'gear', fromClass: false })] }, {}),
    );
    expect(score.coveredBy).toEqual([
      { heroId: 'h1', source: 'class' },
      { heroId: 'h2', source: 'gear' },
    ]);
    // A hero answering only through a familyVsThreat bonus is credited with its source.
    const saved = scoreThreat(threat('holy', 1), party({ classId: 'exorcist' }, { familyTags: [tag('faith')] }));
    expect(saved.coveredBy).toEqual([
      { heroId: 'h1', source: 'class' },
      { heroId: 'h2', source: 'class' },
    ]);
  });
});

describe('familyVsThreat bonuses', () => {
  it('adds the Exorcist’s +1 Faith when scoring Holy', () => {
    expect(scoreThreat(threat('holy', 2), party({ classId: 'exorcist' }, { familyTags: [tag('faith')] }))).toMatchObject({
      state: 'met',
      have: 2,
    });
    expect(scoreThreat(threat('holy', 2), party({ familyTags: [tag('faith')] })).state).toBe('half');
  });

  it('adds the Beastmaster’s +1 Wild only at Beasts 2 and 3', () => {
    expect(familyCount(party({ classId: 'beastmaster' }), 'wild', 1)).toBe(0);
    expect(familyCount(party({ classId: 'beastmaster' }), 'wild', 2)).toBe(1);
    expect(familyCount(party({ classId: 'beastmaster' }), 'wild', 3)).toBe(1);
    expect(scoreThreat(threat('beasts', 2), party({ classId: 'beastmaster' }, { familyTags: [tag('wild', 3)] }))).toMatchObject({
      state: 'met',
    });
  });

  it('subtracts a negative trait bonus, never below zero', () => {
    expect(familyCount(party({ traitId: 'clumsy', familyTags: [tag('cunning', 2)] }), 'cunning', 1)).toBe(1);
    expect(familyCount(party({ traitId: 'clumsy' }), 'cunning', 1)).toBe(0);
    expect(scoreThreat(threat('traps', 2), party({ traitId: 'clumsy', familyTags: [tag('cunning', 2)] })).state).toBe('half');
  });
});

describe('restrictions in scoring', () => {
  it('anti-magic drops the tags from magic sources', () => {
    const magic = [heroAnswers(member({ familyTags: [tag('warding', 2, { source: 'gear', fromClass: false, magic: true })] }), 'antiMagic')];
    expect(scoreThreat(threat('element', 1), magic).state).toBe('half');
    const physical = [
      heroAnswers(member({ familyTags: [tag('warding', 2, { source: 'gear', fromClass: false })] }), 'antiMagic'),
    ];
    expect(scoreThreat(threat('element', 1), physical).state).toBe('met');
  });

  it('thick fog drops Watch tags from classes, but gear still lights the way', () => {
    const foggy = (fromClass: boolean) => [
      heroAnswers(member({ familyTags: [tag('watch', 2, { fromClass })] }), 'thickFog'),
    ];
    expect(scoreThreat(threat('darkness', 1), foggy(true)).state).toBe('half');
    expect(scoreThreat(threat('darkness', 1), foggy(false)).state).toBe('met');
  });
});

describe('scoring a whole briefing', () => {
  it('scores every threat of the briefing', () => {
    const score = scoreBriefing(
      { threats: [threat('traps', 1), threat('beasts', 3)], restriction: null, opportunity: null },
      party({ familyTags: [tag('cunning', 2)] }),
    );
    expect(score.threats.map((t) => t.state)).toEqual(['met', 'full']);
  });
});

describe('scoring opportunities', () => {
  /** A party whose only member carries `count` tags of `family`. */
  const at = (def: OpportunityDef, family: FamilyId, count: number, optIn = false) =>
    scoreOpportunity(def, familyParty(family, count), optIn).answered;

  it('answers every opportunity by each of its families at its level, and not one level below', () => {
    for (const def of Object.values(opportunityById)) {
      for (const answer of def.answers) {
        const met = familyRules.levels[answer.level - 1];
        const below = familyRules.levels[answer.level - 2] ?? 0;
        expect(at(def, answer.family, met)).toBe(true);
        expect(at(def, answer.family, below)).toBe(false);
      }
    }
    // The spring needs nobody.
    expect(scoreOpportunity(opportunityById.healingSpring, []).answered).toBe(true);
  });

  it('takes any one answer of an opportunity with several', () => {
    expect(at(opportunityById.hiddenCache, 'cunning', 2)).toBe(true);
    expect(at(opportunityById.hiddenCache, 'plunder', 2)).toBe(true);
    expect(at(opportunityById.hiddenCache, 'cunning', 1)).toBe(false);
  });

  it('only takes a costly opportunity when an answer is met, or when opted in', () => {
    expect(at(opportunityById.refugees, 'rally', 2)).toBe(true);
    expect(at(opportunityById.refugees, 'rally', 1)).toBe(false);
    expect(at(opportunityById.sealedVault, 'cunning', 4)).toBe(true);
    expect(scoreOpportunity(opportunityById.refugees, [], false).answered).toBe(false);
    expect(scoreOpportunity(opportunityById.refugees, [], true).answered).toBe(true);
    expect(scoreOpportunity(opportunityById.sealedVault, [], true).answered).toBe(true);
  });
});
