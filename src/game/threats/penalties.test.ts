import { heroClasses } from '@/content/heroes';

import { heroAnswers, type AnswersMember } from './answers';
import { launchEffects, threatPenalties } from './penalties';
import { scoreThreat, type ThreatScore } from './score';

const member = (overrides: Partial<AnswersMember> = {}): AnswersMember => ({
  heroId: 'h',
  classId: 'warrior',
  traitId: 'none',
  gearKeywords: [],
  kit: null,
  salveElement: null,
  classResists: [],
  ...overrides,
});

const party = (...overrides: Partial<AnswersMember>[]) =>
  overrides.map((overrides, i) => heroAnswers(member({ heroId: `h${i + 1}`, ...overrides }), null));

const threat = (id: ThreatScore['threat']['id'], level: 1 | 2 | 3, element?: ThreatScore['threat']['element']) => ({
  id,
  level,
  ...(element ? { element } : {}),
});

const scored = (threat: ThreatScore['threat'], ...overrides: Partial<AnswersMember>[]) =>
  scoreThreat(threat, party(...overrides));

const kinds = (score: ThreatScore) =>
  threatPenalties(score).map(({ threatId, ...p }) => `${threatId}:${p.kind}:${JSON.stringify(p)}`);

describe('threat penalties', () => {
  it('charges nothing when met', () => {
    expect(threatPenalties(scored(threat('traps', 1), { classId: 'thief' }))).toEqual([]);
  });

  it('halves every number when one short, in full when two or more short', () => {
    expect(kinds(scored(threat('traps', 1), { classId: 'warrior' }))).toEqual(['traps:trapWounds:{"kind":"trapWounds","pct":0.04}']);
    expect(kinds(scored(threat('traps', 2), { classId: 'warrior' }))).toEqual(['traps:trapWounds:{"kind":"trapWounds","pct":0.12}']);
    expect(
      kinds(scored(threat('element', 2, 'fire'), { classId: 'fireMage', classResists: heroClasses.fireMage.resists! })),
    ).toEqual(['element:elementalDamage:{"kind":"elementalDamage","multiplier":1.25}']);
    expect(kinds(scored(threat('element', 2, 'fire'), { classId: 'warrior' }))).toEqual([
      'element:elementalDamage:{"kind":"elementalDamage","multiplier":1.5}',
    ]);
  });

  it('halves hunger supply rounding down', () => {
    // Rubble level 1 against a weak arm: half of +10% time, +1 supply.
    expect(threatPenalties(scored(threat('rubble', 1), { classId: 'thief' }))).toEqual([
      { kind: 'delay', pct: 0.05, threatId: 'rubble' },
      { kind: 'hunger', supply: 0, threatId: 'rubble' },
    ]);
    expect(threatPenalties(scored(threat('rubble', 3), { classId: 'thief' }))).toEqual([
      { kind: 'delay', pct: 0.3, threatId: 'rubble' },
      { kind: 'hunger', supply: 2, threatId: 'rubble' },
    ]);
  });

  it('halves exposed fights, and halves "all" into every other fight', () => {
    expect(threatPenalties(scored(threat('darkness', 2), { classId: 'warrior' }))).toEqual([
      { kind: 'exposed', fights: 2, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.1, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored(threat('darkness', 2), { classId: 'fireMage' }))).toEqual([
      { kind: 'exposed', fights: 1, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.05, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored(threat('darkness', 3), { classId: 'warrior' }))).toEqual([
      { kind: 'exposed', fights: 'all', everyOther: false, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.2, threatId: 'darkness' },
    ]);
    expect(threatPenalties(scored(threat('darkness', 3), { classId: 'fireMage' }, { classId: 'fireMage' }))).toEqual([
      { kind: 'exposed', fights: 'all', everyOther: true, threatId: 'darkness' },
      { kind: 'weakened', pct: 0.1, threatId: 'darkness' },
    ]);
  });

  it('rolls a halved extra fight at half', () => {
    expect(threatPenalties(scored(threat('locals', 1), { classId: 'thief' }))).toEqual([
      { kind: 'extraFight', chance: 0.5, threatId: 'locals' },
    ]);
    expect(threatPenalties(scored(threat('locals', 3), { classId: 'thief' }))).toEqual([
      { kind: 'extraFight', chance: 1, threatId: 'locals' },
    ]);
  });

  it('halves healing at half, and more than halves it in full', () => {
    expect(threatPenalties(scored(threat('desecrated', 3), { classId: 'cleric' }))).toEqual([
      { kind: 'weakened', pct: 0.15, threatId: 'desecrated' },
      { kind: 'healingHalved', multiplier: 0.75, threatId: 'desecrated' },
    ]);
    expect(threatPenalties(scored(threat('desecrated', 3), { classId: 'warrior' }))).toEqual([
      { kind: 'weakened', pct: 0.3, threatId: 'desecrated' },
      { kind: 'healingHalved', multiplier: 0.5, threatId: 'desecrated' },
    ]);
  });

  it('loses the forced lock rate of loot when Might forces a lock', () => {
    expect(threatPenalties(scored(threat('locked', 2), { classId: 'warrior' }))).toEqual([
      { kind: 'lostLoot', pct: 0.1, threatId: 'locked' },
    ]);
    expect(threatPenalties(scored(threat('locked', 1), { classId: 'ranger' }))).toEqual([
      { kind: 'lostLoot', pct: 0.075, threatId: 'locked' },
    ]);
    expect(threatPenalties(scored(threat('locked', 3), { classId: 'warrior' }))).toEqual([
      { kind: 'lostLoot', pct: 0.4, threatId: 'locked' },
    ]);
  });
});

describe('launch effects', () => {
  it('multiplies the delays and adds the hunger supply', () => {
    const scores = [scored(threat('rubble', 2), { classId: 'thief' }), scored(threat('puzzle', 2), { classId: 'thief' })];
    expect(launchEffects(scores)).toEqual({ timeMultiplier: 1.2 * 1.3, extraSupply: 3 });
    // Met and half penalties cost less at launch.
    expect(launchEffects([scored(threat('rubble', 2), { classId: 'warrior' })])).toEqual({ timeMultiplier: 1, extraSupply: 0 });
    expect(launchEffects([scored(threat('rubble', 1), { classId: 'thief' })])).toEqual({ timeMultiplier: 1.05, extraSupply: 0 });
  });
});
