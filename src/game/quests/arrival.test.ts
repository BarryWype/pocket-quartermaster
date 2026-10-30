import { questRules } from '@/content/quests';

import { createInitialSave, type SaveData } from '../save';
import { activeCount, pruneQuests, receiveQuests, rerollProblem, rerollQuest } from './arrival';
import { availableObjectives, deliverItems, mineKinds } from './unlocks';
import type { Quest } from './types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const opened = (): SaveData => {
  const save = createInitialSave();
  save.tutorial.step = 'done';
  save.seenPlaceKinds = ['chapel', 'library', 'ruins', 'fishingDock', 'market', 'apothecary', 'tavern'];
  return save;
};

const regular = (id: string): Quest => ({
  id,
  objective: 'walk',
  band: 'short',
  arrivedAt: 0,
  expiresAt: DAY * 2,
  acceptedAt: null,
  amount: 500,
  progress: 0,
  target: null,
  doneAt: null,
  seen: true,
});

describe('quest arrivals', () => {
  it('hands out 2–3 quests a day, deterministically', () => {
    const save = opened();
    const now = 10 * DAY;
    const first = receiveQuests(save, now);
    const second = receiveQuests(receiveQuests(save, now), now);
    expect(first.quests.list.length).toBeGreaterThanOrEqual(2);
    expect(first.quests.list.length).toBeLessThanOrEqual(3);
    expect(first.quests.list.map((q) => q.id).sort()).toEqual(second.quests.list.map((q) => q.id).sort());
    expect(first.quests.list.map((q) => q.objective)).toEqual(second.quests.list.map((q) => q.objective));
    expect(first.quests.lastArrivalDay).toBe(10);
  });

  it('does not arrive twice on the same day', () => {
    const save = opened();
    const first = receiveQuests(save, 10 * DAY);
    const again = receiveQuests(first, 10 * DAY + HOUR);
    expect(again.quests.list).toEqual(first.quests.list);
    expect(again.quests.lastArrivalDay).toBe(10);
  });

  it('stops at the cap of 6 regular quests', () => {
    const save = opened();
    save.quests.list = [regular('a'), regular('b'), regular('c'), regular('d'), regular('e'), regular('f')];
    expect(activeCount(save)).toBe(6);
    const next = receiveQuests(save, 10 * DAY);
    expect(next.quests.list).toHaveLength(6);
  });

  it('only hands out days whose quests are still alive, and prunes the rest', () => {
    const save = opened();
    save.quests.lastArrivalDay = 7;
    const now = 10 * DAY; // day 8's quests would already be 48 h old
    const next = receiveQuests(save, now);
    const days = new Set(next.quests.list.map((q) => q.id.split('|')[1]));
    expect(days).toEqual(new Set(['9', '10']));

    const stale = opened();
    stale.quests.list = [{ ...regular('old'), expiresAt: now - 1 }];
    const done = { ...regular('done'), doneAt: now - 2, expiresAt: now - 1 };
    stale.quests.list.push(done);
    stale.quests.completions = [now - (questRules.secret.windowHours + 1) * HOUR, now - HOUR];
    const pruned = pruneQuests(stale, now);
    expect(pruned.quests.list.map((q) => q.id)).toEqual(['done']); // done quests wait to be claimed
    expect(pruned.quests.completions).toEqual([now - HOUR]);
  });

  it('does nothing before the tutorial is done', () => {
    const save = createInitialSave();
    const next = receiveQuests(save, 10 * DAY);
    expect(next.quests.list).toEqual([]);
    expect(next.quests.lastArrivalDay).toBe(null);
  });

  it('gives quests a 48 h lifetime from their day start', () => {
    const save = opened();
    const next = receiveQuests(save, 10 * DAY);
    for (const quest of next.quests.list) {
      expect(quest.arrivedAt).toBe(10 * DAY);
      expect(quest.expiresAt).toBe(10 * DAY + questRules.lifetimeHours * HOUR);
      expect(quest.acceptedAt).toBe(null);
      expect(quest.seen).toBe(false);
      expect(quest.amount).toBeGreaterThan(0);
    }
  });
});

describe('quest reroll', () => {
  it('rerolls once a day, in place, never a done quest', () => {
    let save = receiveQuests(opened(), 10 * DAY);
    const quest = save.quests.list[1];
    expect(rerollProblem(save, quest.id, 10 * DAY)).toBe(null);
    save = rerollQuest(save, quest.id, 10 * DAY);
    const rerolled = save.quests.list[1];
    expect(rerolled.id).toBe('q|10|reroll');
    expect(rerolled.arrivedAt).toBe(quest.arrivedAt);
    expect(rerolled.expiresAt).toBe(quest.expiresAt);
    expect(rerolled.acceptedAt).toBe(null);
    expect(save.quests.rerollDay).toBe(10);

    expect(rerollProblem(save, rerolled.id, 10 * DAY + HOUR)).toBe('used');
    expect(rerollQuest(save, rerolled.id, 10 * DAY + HOUR).quests.list[1].id).toBe('q|10|reroll');
    expect(rerollProblem(save, rerolled.id, 11 * DAY)).toBe(null);
    expect(rerollQuest(save, rerolled.id, 11 * DAY).quests.list[1].id).toBe('q|11|reroll');

    const done = { ...save.quests.list[2], doneAt: 10 * DAY };
    save.quests.list[2] = done;
    expect(rerollProblem(save, done.id, 12 * DAY)).toBe('done');
    expect(rerollProblem(save, 'missing', 12 * DAY)).toBe('gone');
  });
});

describe('available objectives', () => {
  it('only offers seen place kinds', () => {
    const save = opened();
    save.seenPlaceKinds = ['chapel'];
    const short = availableObjectives(save, 'short');
    expect(short).toContain('chapel');
    expect(short).not.toContain('library');
    expect(short).not.toContain('collector');
    expect(short).toContain('walk');
    expect(short).toContain('gatherOnWay');
  });

  it('offers the lair only in the long band', () => {
    const save = opened();
    save.seenPlaceKinds = ['chapel', 'monsterLair'];
    expect(availableObjectives(save, 'long')).toContain('lair');
    expect(availableObjectives(save, 'short')).not.toContain('lair');
    expect(availableObjectives(save, 'medium')).not.toContain('lair');
  });

  it('offers deliver only for known recipes with a seen destination', () => {
    const save = opened();
    save.knownRecipes = ['healingPotion', 'huntersStew', 'roguesRoll'];
    const items = deliverItems(save).map(({ itemId, place }) => [itemId, place]);
    expect(items).toContainEqual(['healingPotion', 'apothecary']);
    expect(items).toContainEqual(['huntersStew', 'tavern']);
    expect(items).toContainEqual(['roguesRoll', 'chapel']);

    save.seenPlaceKinds = ['market'];
    expect(availableObjectives(save, 'short')).not.toContain('deliver');
    save.seenPlaceKinds = ['apothecary'];
    expect(availableObjectives(save, 'short')).toContain('deliver');
  });

  it('offers the mine kinds at the pickaxe tier', () => {
    const save = opened();
    expect(mineKinds(save)).toEqual(['sawmill', 'huntingLodge']); // no pickaxe: no ore
    save.tools = ['stonePickaxe']; // tier 2: copper
    expect(mineKinds(save)).toEqual(['sawmill', 'huntingLodge', 'copperMine']);
    save.seenPlaceKinds = ['sawmill'];
    expect(availableObjectives(save, 'short')).toContain('mine');
    save.seenPlaceKinds = ['copperMine'];
    expect(availableObjectives(save, 'short')).toContain('mine');
    save.seenPlaceKinds = ['ironMine'];
    expect(availableObjectives(save, 'short')).not.toContain('mine');
  });

  it('offers the collector only with a market seen and a valuable held', () => {
    const save = opened();
    save.seenPlaceKinds = ['market'];
    expect(availableObjectives(save, 'short')).not.toContain('collector');
    save.valuables = { goldRing: 1 };
    expect(availableObjectives(save, 'short')).toContain('collector');
  });

  it('offers patrols and fight events once the tutorial is done', () => {
    const save = opened();
    expect(availableObjectives(save, 'short')).toContain('patrols');
    expect(availableObjectives(save, 'short')).toContain('fightEvent');
  });
});
