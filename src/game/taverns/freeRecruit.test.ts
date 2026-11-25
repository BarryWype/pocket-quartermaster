import { newHero } from '@/content/heroes';
import { recruitRules } from '@/content/roster';

import { rosterCap } from '../guild/guild';
import { createInitialSave, type SaveData } from '../save';
import { freeRecruitOrGold, rollFreeRecruit } from './freeRecruit';

const withRoster = (size: number): SaveData => {
  let save: SaveData = createInitialSave();
  while (save.heroes.length < size) save = { ...save, heroes: [...save.heroes, newHero(`x${save.heroes.length}`, 'X', 'warrior', 'resilient')] };
  return save;
};

describe('free recruits', () => {
  it('roll the same recruit from the same seed', () => {
    const save = withRoster(6);
    expect(rollFreeRecruit(save, 'free-recruit-test', 'recruit:1', 'roll')).toEqual(rollFreeRecruit(save, 'free-recruit-test', 'recruit:1', 'roll'));
    expect(rollFreeRecruit(save, 'free-recruit-test', 'recruit:1', true)).toEqual(rollFreeRecruit(save, 'free-recruit-test', 'recruit:1', true));
  });

  it('join the roster when there is room', () => {
    const save = withRoster(rosterCap(createInitialSave()) - 1);
    const offer = rollFreeRecruit(save, 'free-recruit-test', 'recruit:2', 'roll');
    const { save: joined, outcome } = freeRecruitOrGold(save, offer, 2);
    expect(outcome).toEqual({ offer, joined: true, gold: 0 });
    expect(joined.heroes).toHaveLength(save.heroes.length + 1);
    expect(joined.heroes.at(-1)).toMatchObject({ name: offer.name, classId: offer.classId, trait: offer.trait });
  });

  it('pay the tier’s full-roster gold instead when the roster is full', () => {
    const save = withRoster(rosterCap(createInitialSave()));
    const offer = rollFreeRecruit(save, 'free-recruit-test', 'recruit:3', 'roll');
    const { save: paid, outcome } = freeRecruitOrGold(save, offer, 3);
    expect(outcome.joined).toBe(false);
    expect(outcome.gold).toBe(recruitRules.fullRosterGold[2]);
    expect(paid.gold).toBe(save.gold + recruitRules.fullRosterGold[2]);
    expect(paid.heroes).toHaveLength(save.heroes.length);
  });
});
