import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { approachRules } from '@/content/threats';

import type { ConsumableDef } from '../types';
import { heroAnswers, type AnswersMember } from './answers';

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

  it('collects class, trait, weapon and kit keywords once each', () => {
    expect(keywords(heroAnswers(member({ classId: 'fireMage' })))).toEqual(['light:class', 'cleave:class']);
    expect(keywords(heroAnswers(member({ classId: 'warrior', weaponType: 'axe' })))).toEqual(['cleave:weapon']);
    expect(keywords(heroAnswers(member({ classId: 'warrior', weaponType: 'dagger' })))).toEqual(['pierce:weapon']);
    expect(keywords(heroAnswers(member({ classId: 'warrior', weaponType: 'staff' })))).toEqual(['cleave:weapon']);
    expect(keywords(heroAnswers(member({ classId: 'warrior', weaponType: 'mace' })))).toEqual(['blessed:weapon']);
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

  it('drops Light and Cleave from a mage class or a staff in an anti-magic zone', () => {
    expect(heroAnswers(member({ classId: 'fireMage' }), 'antiMagic').keywords).toEqual([]);
    expect(keywords(heroAnswers(member({ classId: 'barbarian' }), 'antiMagic'))).toEqual(['cleave:class']);
    expect(heroAnswers(member({ classId: 'warrior', weaponType: 'staff' }), 'antiMagic').keywords).toEqual([]);
    // A mage's axe cleaves just fine; a kit's light is not magic.
    expect(keywords(heroAnswers(member({ classId: 'fireMage', weaponType: 'axe' }), 'antiMagic'))).toEqual([
      'cleave:weapon',
    ]);
    expect(keywords(heroAnswers(member({ kit: kit('lantern') }), 'antiMagic'))).toEqual(['light:kit', 'watchful:kit']);
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
