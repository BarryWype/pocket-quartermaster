import { questRules } from '@/content/quests';

import { todaysCollector } from './loot/valuables';
import { migrateSave } from './migrations';
import { createInitialSave, type SaveData } from './save';
import type { Quest } from './quests/types';

const DAY = 86_400_000;
const origin = { latitude: 0, longitude: 0 };
const marketId = 'place:market:tile:0:1';

describe('save migrations', () => {
  const collector = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: 'collector',
    band: 'short',
    arrivedAt: 100,
    expiresAt: 2 * DAY,
    acceptedAt: 200,
    amount: 1,
    progress: 0,
    target: { placeId: marketId, kind: 'market', position: origin, from: origin, expiresAt: 5 * DAY },
    doneAt: null,
    seen: true,
    ...overrides,
  });

  const walk: Quest = {
    id: 'walk-1',
    objective: 'walk',
    band: 'medium',
    arrivedAt: 300,
    expiresAt: 2 * DAY,
    acceptedAt: 400,
    amount: 1000,
    progress: 120,
    stepsAtArrive: 10,
    target: null,
    doneAt: null,
    seen: true,
  };

  const withQuests = (...list: Quest[]): SaveData => {
    const save = createInitialSave();
    return { ...save, quests: { ...save.quests, list } };
  };

  it('turns an open collector without its valuable into a sell goods quest', () => {
    const save = withQuests(collector('q-1'));
    const now = 10 * DAY;
    const next = migrateSave(save, 30, now);
    const quest = next.quests.list[0];
    expect(quest.id).toBe('q-1');
    expect(quest.objective).toBe('sellGoods');
    expect(quest.band).toBe('short');
    expect(quest.arrivedAt).toBe(100);
    expect(quest.expiresAt).toBe(2 * DAY);
    expect(quest.acceptedAt).toBe(200);
    expect(quest.seen).toBe(true);
    expect(quest.amount).toBe(questRules.sellGoodsGold[0]);
    expect(quest.progress).toBe(0);
    expect(quest.target).toBe(null);
    expect(quest.itemId).toBeUndefined();
  });

  it('keeps an open collector whose market wants a valuable the player holds', () => {
    const now = 10 * DAY;
    const save = withQuests(collector('q-1'));
    const wanted = todaysCollector(save, marketId, now);
    save.valuables = { [`${wanted}:2`]: 1 };
    const next = migrateSave(save, 30, now);
    expect(next.quests.list[0].objective).toBe('collector');
    expect(next.quests.list[0].itemId).toBe(wanted);
    expect(next.quests.list[0].target).toEqual(save.quests.list[0].target);
  });

  it('leaves done collectors and other quests alone', () => {
    const done = collector('q-1', { doneAt: 1000 });
    const save = withQuests(done, walk);
    const next = migrateSave(save, 30, 10 * DAY);
    expect(next.quests.list[0]).toEqual(done);
    expect(next.quests.list[1]).toEqual(walk);
  });

  it('does nothing for a save already at version 31', () => {
    const save = withQuests(collector('q-1'));
    expect(migrateSave(save, 31, 10 * DAY)).toBe(save);
  });
});
