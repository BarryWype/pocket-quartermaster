import { familyOfThreat } from '@/content/families';

import type { FamilyId } from '@/content/families';
import type { ActiveThreat, ThreatId } from '../types';
import type { HeroFamilyTag } from '../families/families';
import { heroAnswers, type AnswersMember } from './answers';
import { threatPenalties, type PenaltyReduction } from './penalties';
import { scoreThreat, type ThreatScore } from './score';

const tag = (family: FamilyId, count = 1): HeroFamilyTag => ({ family, count, source: 'class' });

const member = (overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: 'h',
  classId: 'warrior',
  traitId: 'none',
  familyTags: [],
  ...overrides,
});

const threat = (id: ThreatId, level: 1 | 2 | 3): ActiveThreat => ({ id, level });

/** The threat scored against one hero whose family tags fall `short` tags short of it. */
const scored = (id: ThreatId, level: 1 | 2 | 3, short = 0): ThreatScore => {
  const family = familyOfThreat(id);
  const count = Math.max(0, level - short);
  return scoreThreat(threat(id, level), [heroAnswers(member({ familyTags: [tag(family, count)] }))]);
};

const kinds = (score: ThreatScore) =>
  threatPenalties(score).map(({ threatId, ...p }) => `${threatId}:${p.kind}:${JSON.stringify(p)}`);

describe('threat penalties', () => {
  it('charges nothing when met', () => {
    expect(threatPenalties(scored('traps', 1))).toEqual([]);
    expect(threatPenalties(scored('holy', 3))).toEqual([]);
  });

  it('halves every number when one short, in full when two or more short', () => {
    expect(kinds(scored('traps', 1, 1))).toEqual(['traps:trapWounds:{"kind":"trapWounds","pct":0.2}']);
    expect(kinds(scored('traps', 2, 2))).toEqual(['traps:trapWounds:{"kind":"trapWounds","pct":0.6}']);
    expect(kinds(scored('element', 2, 1))).toEqual(['element:elementalDamage:{"kind":"elementalDamage","multiplier":1.45}']);
    expect(kinds(scored('element', 2, 2))).toEqual(['element:elementalDamage:{"kind":"elementalDamage","multiplier":1.9}']);
    expect(kinds(scored('holy', 1, 1))).toEqual(['holy:enemyHp:{"kind":"enemyHp","tag":"undead","pct":0.35}']);
    expect(kinds(scored('holy', 3, 2))).toEqual(['holy:enemyHp:{"kind":"enemyHp","tag":"undead","pct":0.9}']);
    expect(kinds(scored('beasts', 2, 2))).toEqual(['beasts:enemyDamage:{"kind":"enemyDamage","tag":"beast","pct":1.3}']);
    expect(kinds(scored('poison', 3, 1))).toEqual(['poison:fightWounds:{"kind":"fightWounds","pct":0.325}']);
    expect(kinds(scored('armoured', 2, 2))).toEqual(['armoured:weakenedAgainst:{"kind":"weakenedAgainst","pct":0.48}']);
  });

  it('halves exposed fights, and halves "all" into every other fight', () => {
    expect(threatPenalties(scored('darkness', 2, 2))).toEqual([
      { kind: 'exposed', fights: 3, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.35, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored('darkness', 2, 1))).toEqual([
      { kind: 'exposed', fights: 1.5, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.175, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored('darkness', 3, 2))).toEqual([
      { kind: 'exposed', fights: 'all', everyOther: false, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.45, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored('darkness', 3, 1))).toEqual([
      { kind: 'exposed', fights: 'all', everyOther: true, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.225, threatId: 'darkness' },
    ]);
  });

  it('multiplies the listed threats’ penalties and leaves the others alone', () => {
    const cut: PenaltyReduction = { threats: { poison: 0.5 } };
    // Half-missed level 3 Poison, cut by half again: a quarter of 0.65 fight wounds.
    expect(threatPenalties(scored('poison', 3, 1), undefined, cut)).toEqual([
      { kind: 'fightWounds', pct: 0.1625, threatId: 'poison' },
    ]);
    // Threats the reduction does not list keep their full penalties.
    expect(threatPenalties(scored('darkness', 2, 2), undefined, cut)).toEqual(threatPenalties(scored('darkness', 2, 2)));
  });
});
