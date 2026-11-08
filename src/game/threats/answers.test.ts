import type { FamilyId } from '@/content/families';

import type { HeroFamilyTag } from '../families/families';
import { heroAnswers, type AnswersMember } from './answers';

/** One family tag, as heroFamilyTagSources would have built it. */
const tag = (family: FamilyId, overrides: Partial<HeroFamilyTag> = {}): HeroFamilyTag => ({
  family,
  count: 1,
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
  it('keeps every family tag', () => {
    const familyTags = [tag('faith'), tag('rally', { source: 'gear' }), tag('watch', { count: 2 })];
    expect(tagsOf(heroAnswers(member({ familyTags })))).toEqual(['faith:class', 'rally:gear', 'watch:class']);
  });

  it('collects the class familyVsThreat bonuses, with their levels', () => {
    expect(bonusesOf(heroAnswers(member({ classId: 'exorcist' })))).toEqual(['faith:1:class']);
    expect(bonusesOf(heroAnswers(member({ classId: 'necromancer' })))).toEqual(['faith:1:class:23']);
    expect(bonusesOf(heroAnswers(member({ classId: 'engineer' })))).toEqual(['cunning:1:class']);
    expect(bonusesOf(heroAnswers(member()))).toEqual([]);
  });

  it('collects trait familyVsThreat bonuses, negative ones included', () => {
    expect(bonusesOf(heroAnswers(member({ traitId: 'lightSleeper' })))).toEqual(['watch:1:trait']);
    expect(bonusesOf(heroAnswers(member({ traitId: 'clumsy' })))).toEqual(['cunning:-1:trait']);
    expect(bonusesOf(heroAnswers(member({ traitId: 'loud' })))).toEqual(['watch:-1:trait']);
  });
});
