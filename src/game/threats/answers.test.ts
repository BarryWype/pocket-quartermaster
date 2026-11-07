import type { FamilyId } from '@/content/families';

import type { HeroFamilyTag } from '../families/families';
import { heroAnswers, type AnswersMember } from './answers';

/** One family tag, as heroFamilyTagSources would have built it. */
const tag = (family: FamilyId, overrides: Partial<HeroFamilyTag> = {}): HeroFamilyTag => ({
  family,
  count: 1,
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

const tagsOf = (answers: ReturnType<typeof heroAnswers>) => answers.tags.map((t) => `${t.family}:${t.source}`);
const bonusesOf = (answers: ReturnType<typeof heroAnswers>) =>
  answers.bonuses.map((b) => `${b.family}:${b.add}:${b.source}${b.levels ? `:${b.levels.join('')}` : ''}`);

describe('heroAnswers', () => {
  it('keeps every family tag when no restriction applies', () => {
    const familyTags = [tag('faith'), tag('rally', { source: 'gear', fromClass: false }), tag('watch', { count: 2 })];
    expect(heroAnswers(member({ familyTags })).tags).toEqual(familyTags);
  });

  it('drops every tag from a magic source in an anti-magic zone', () => {
    const magicGear = tag('warding', { source: 'gear', fromClass: false, magic: true });
    const plainGear = tag('cunning', { source: 'gear', fromClass: false });
    const casterClass = tag('spellweave', { magic: true });
    const answers = heroAnswers(member({ familyTags: [magicGear, plainGear, casterClass] }), 'antiMagic');
    expect(tagsOf(answers)).toEqual(['cunning:gear']);
    // A caster's whole class falls in the zone, a power class's does not.
    expect(heroAnswers(member({ classId: 'fireMage', familyTags: [tag('spellweave', { magic: true })] }), 'antiMagic').tags).toEqual([]);
    expect(heroAnswers(member({ classId: 'cleric', familyTags: [tag('faith', { magic: true })] }), 'antiMagic').tags).toEqual([]);
  });

  it('drops only Watch tags that come from classes in thick fog', () => {
    const classWatch = tag('watch');
    const gearWatch = tag('watch', { source: 'gear', fromClass: false });
    const classFaith = tag('faith');
    const answers = heroAnswers(member({ familyTags: [classWatch, gearWatch, classFaith] }), 'thickFog');
    expect(tagsOf(answers)).toEqual(['watch:gear', 'faith:class']);
  });

  it('collects the class familyVsThreat bonuses, with their levels', () => {
    expect(bonusesOf(heroAnswers(member({ classId: 'exorcist' })))).toEqual(['faith:1:class']);
    expect(bonusesOf(heroAnswers(member({ classId: 'necromancer' })))).toEqual(['faith:1:class:23']);
    expect(bonusesOf(heroAnswers(member({ classId: 'engineer' })))).toEqual(['cunning:1:class']);
    expect(bonusesOf(heroAnswers(member()))).toEqual([]);
  });

  it('drops a caster class bonus in an anti-magic zone, and keeps a power class one', () => {
    expect(heroAnswers(member({ classId: 'necromancer' }), 'antiMagic').bonuses).toEqual([]);
    expect(bonusesOf(heroAnswers(member({ classId: 'exorcist' }), 'antiMagic'))).toEqual(['faith:1:class']);
  });

  it('collects trait familyVsThreat bonuses, negative ones included', () => {
    expect(bonusesOf(heroAnswers(member({ traitId: 'lightSleeper' })))).toEqual(['watch:1:trait']);
    expect(bonusesOf(heroAnswers(member({ traitId: 'clumsy' })))).toEqual(['cunning:-1:trait']);
    expect(bonusesOf(heroAnswers(member({ traitId: 'loud' })))).toEqual(['watch:-1:trait']);
  });
});
