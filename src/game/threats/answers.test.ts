import { gearProfiles } from '@/content/equipment';
import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { approachRules } from '@/content/threats';

import type { ConsumableDef, GearType, Keyword } from '../types';
import { heroAnswers, type AnswersMember } from './answers';

/** The keywords one piece of this gear type carries, magic pieces marked. */
const gear = (type: GearType): { keyword: Keyword; magic: boolean }[] =>
  gearProfiles[type].keywords.map((keyword) => ({ keyword, magic: gearProfiles[type].damageStat === 'magic' }));

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

const kit = (itemId: string) => {
  const item = itemById[itemId] as ConsumableDef;
  return { itemId, effect: item.kit! };
};

const keywords = (answers: ReturnType<typeof heroAnswers>) => answers.keywords.map((k) => `${k.keyword}:${k.source}`);

describe('heroAnswers', () => {
  it('scores every approach from the class, missing ones at the base', () => {
    expect(heroAnswers(member({ classId: 'warrior' })).approaches).toEqual({
      might: 3,
      finesse: approachRules.base,
      wits: approachRules.base,
      faith: approachRules.base,
      presence: approachRules.base,
    });
    expect(heroAnswers(member({ classId: 'thief' })).approaches.finesse).toBe(4);
    expect(heroAnswers(member({ classId: 'fireMage' })).approaches).toEqual({
      might: 1,
      finesse: 1,
      wits: 1,
      faith: 1,
      presence: 1,
    });
  });

  it('applies trait approach modifiers, clamped at the rules', () => {
    expect(heroAnswers(member({ classId: 'thief', traitId: 'clumsy' })).approaches.finesse).toBe(3);
    expect(heroAnswers(member({ classId: 'warrior', traitId: 'clumsy' })).approaches.finesse).toBe(0);
    expect(heroAnswers(member({ classId: 'troubadour', traitId: 'loud' })).approaches.presence).toBe(2);
  });

  it('collects class, trait, gear and kit keywords once each', () => {
    expect(keywords(heroAnswers(member({ classId: 'fireMage' })))).toEqual(['light:class', 'cleave:class']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('axe') })))).toEqual(['cleave:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('dagger') })))).toEqual(['pierce:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('staff') })))).toEqual(['cleave:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('mace') })))).toEqual(['blessed:gear', 'stagger:gear']);
    // A sword gives Parry, a bow Pierce and Reach, plate and a shield Guard.
    expect(keywords(heroAnswers(member({ gearKeywords: gear('sword') })))).toEqual(['parry:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('bow') })))).toEqual(['pierce:gear', 'reach:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('plate') })))).toEqual(['guard:gear']);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('shield') })))).toEqual(['guard:gear']);
    // An unfit class still gets the piece's keywords: a fire mage with an axe cleaves (counted once).
    expect(keywords(heroAnswers(member({ classId: 'fireMage', gearKeywords: gear('axe') })))).toEqual([
      'light:class',
      'cleave:class',
    ]);
    expect(keywords(heroAnswers(member({ kit: kit('lantern') })))).toEqual(['light:kit', 'watchful:kit']);
    // A trait keyword counts once with the class one.
    expect(keywords(heroAnswers(member({ classId: 'ranger', traitId: 'lightSleeper' })))).toEqual(['watchful:class']);
    // A kit keyword the class already has counts once too.
    expect(keywords(heroAnswers(member({ classId: 'druid', kit: kit('huntersPack') })))).toEqual([
      'calm:class',
      'antidote:class',
    ]);
  });

  it('keeps only Watchful from a kit in thick fog', () => {
    expect(heroAnswers(member({ classId: 'ranger' }), 'thickFog').keywords).toEqual([]);
    expect(heroAnswers(member({ classId: 'ranger', traitId: 'lightSleeper' }), 'thickFog').keywords).toEqual([]);
    expect(keywords(heroAnswers(member({ kit: kit('lantern') }), 'thickFog'))).toEqual(['light:kit', 'watchful:kit']);
  });

  it('drops every keyword from a magic source in an anti-magic zone', () => {
    expect(heroAnswers(member({ classId: 'fireMage' }), 'antiMagic').keywords).toEqual([]);
    expect(keywords(heroAnswers(member({ classId: 'barbarian' }), 'antiMagic'))).toEqual(['cleave:class']);
    // A wand's or focus's Channel is magic; an axe's Cleave is not.
    expect(heroAnswers(member({ gearKeywords: gear('wand') }), 'antiMagic').keywords).toEqual([]);
    expect(heroAnswers(member({ gearKeywords: gear('focus') }), 'antiMagic').keywords).toEqual([]);
    expect(keywords(heroAnswers(member({ gearKeywords: gear('axe') }), 'antiMagic'))).toEqual(['cleave:gear']);
    // A kit's keyword and the Paladin's class Guard keep working.
    expect(keywords(heroAnswers(member({ kit: kit('lantern') }), 'antiMagic'))).toEqual(['light:kit', 'watchful:kit']);
    expect(keywords(heroAnswers(member({ classId: 'paladin' }), 'antiMagic'))).toEqual(['blessed:class', 'guard:class']);
  });

  it('keeps the Paladin Guard as a class keyword without gear', () => {
    expect(keywords(heroAnswers(member({ classId: 'paladin' })))).toEqual(['blessed:class', 'guard:class']);
    expect(keywords(heroAnswers(member({ classId: 'warrior', gearKeywords: gear('sword') })))).toEqual(['parry:gear']);
  });

  it('resists the class elements and the ward salve, without repeats', () => {
    expect(heroAnswers(member({ classId: 'fireMage', classResists: heroClasses.fireMage.resists! })).resists).toEqual([
      'fire',
    ]);
    expect(
      heroAnswers(
        member({ classId: 'fireMage', classResists: heroClasses.fireMage.resists!, salveElement: 'water' }),
      ).resists,
    ).toEqual(['fire', 'water']);
    expect(
      heroAnswers(
        member({ classId: 'fireMage', classResists: heroClasses.fireMage.resists!, salveElement: 'fire' }),
      ).resists,
    ).toEqual(['fire']);
  });

  it('carries the kit item id along', () => {
    expect(heroAnswers(member()).kitItemId).toBeNull();
    expect(heroAnswers(member({ kit: kit('roguesRoll') })).kitItemId).toBe('roguesRoll');
  });
});
