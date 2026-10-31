import { objectives, questRules, type QuestBand, type QuestObjective } from '@/content/quests';

import { createInitialSave, type SaveData } from '../save';
import { tierBoss } from '../guild/guild';
import { activeCount, pruneQuests, receiveQuests, rerollProblem, rerollQuest } from './arrival';
import { availableObjectives, deliverItems, mineKinds } from './unlocks';
import type { Quest } from './types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const openedWithSeed = (playerSeed: string): SaveData => {
  const save = createInitialSave(playerSeed);
  save.tutorial.step = 'done';
  save.seenPlaceKinds = ['chapel', 'library', 'ruins', 'fishingDock', 'market', 'apothecary', 'tavern'];
  return save;
};

const opened = (): SaveData => openedWithSeed('test-player');

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

  it('raises the cap by the Quest cap track', () => {
    const save = opened();
    save.guild = { questCap: 2 };
    save.quests.list = [regular('a'), regular('b'), regular('c'), regular('d'), regular('e'), regular('f')];
    expect(receiveQuests(save, 10 * DAY).quests.list).toHaveLength(8);
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

  it('picks a kind not already active while other kinds are unlocked', () => {
    const save = opened();
    save.revealAll = true;
    save.seenPlaceKinds = ['chapel', 'library', 'ruins', 'fishingDock', 'market', 'apothecary', 'tavern', 'sawmill', 'huntingLodge', 'monsterLair', 'banditCamp'];
    save.valuables = { gem: 1 };
    // Visit and Fight are already active: the day's new quests come from the other kinds.
    save.quests.list = [{ ...regular('a'), objective: 'chapel' }, { ...regular('b'), objective: 'patrols' }];
    save.quests.lastArrivalDay = 9;
    const next = receiveQuests(save, 10 * DAY);
    const fresh = next.quests.list.filter((q) => q.arrivedAt === 10 * DAY);
    expect(fresh.length).toBeGreaterThanOrEqual(2);
    for (const quest of fresh) {
      const kind = objectives[quest.objective as QuestObjective].kind;
      expect(kind).not.toBe('visit');
      expect(kind).not.toBe('fight');
    }
  });

  it('never picks a second Walk quest, even when every unlocked kind is taken', () => {
    const save = opened();
    save.revealAll = true;
    save.seenPlaceKinds = ['chapel', 'library', 'ruins', 'fishingDock', 'market', 'apothecary', 'tavern', 'sawmill', 'huntingLodge', 'monsterLair', 'banditCamp'];
    save.valuables = { gem: 1 };
    // One active quest of every unlocked kind, Walk included (cap raised so the day's arrivals still come).
    const taken: QuestObjective[] = ['chapel', 'patrols', 'deliver', 'mine', 'collector', 'walk'];
    save.quests.list = taken.map((objective, i) => ({ ...regular(`q${i}`), objective }));
    save.quests.lastArrivalDay = 9;
    save.guild = { questCap: 3 };
    const next = receiveQuests(save, 10 * DAY);
    const fresh = next.quests.list.filter((q) => q.arrivedAt === 10 * DAY);
    expect(fresh.length).toBeGreaterThanOrEqual(2);
    expect(fresh.every((q) => q.objective !== 'walk')).toBe(true);
    // And within a repeated kind, a different objective than the active one where one exists.
    const activeObjectives = new Set(next.quests.list.filter((q) => q.arrivedAt !== 10 * DAY).map((q) => q.objective));
    for (const quest of fresh) {
      if (activeObjectives.has(quest.objective)) {
        const kind = objectives[quest.objective as QuestObjective].kind;
        const alternatives = availableObjectives(save, quest.band as QuestBand).filter((o) => objectives[o].kind === kind && !activeObjectives.has(o));
        expect(alternatives.length).toBe(0);
      }
    }
  });

  it('keeps at most one active Walk quest over many days', () => {
    let save = opened();
    for (let day = 10; day <= 30; day++) {
      const now = day * DAY;
      save = pruneQuests(save, now);
      save = { ...save, quests: { ...save.quests, list: save.quests.list.filter((q) => q.doneAt === null) } };
      save = receiveQuests(save, now);
      const active = save.quests.list.filter((q) => q.band !== 'secret' && q.doneAt === null);
      expect(active.length).toBeGreaterThan(0);
      expect(active.filter((q) => q.objective === 'walk').length).toBeLessThanOrEqual(1);
    }
  });

  it('seeds the picks per player and day: two players get different first quests, the same player gets the same ones', () => {
    const now = 10 * DAY;
    const alice = receiveQuests(openedWithSeed('alice'), now);
    const bob = receiveQuests(openedWithSeed('bob'), now);
    const aliceAgain = receiveQuests(openedWithSeed('alice'), now);
    expect(alice.quests.list.map((q) => `${q.objective}/${q.band}`)).toEqual(aliceAgain.quests.list.map((q) => `${q.objective}/${q.band}`));
    expect(alice.quests.list.map((q) => `${q.objective}/${q.band}`)).not.toEqual(bob.quests.list.map((q) => `${q.objective}/${q.band}`));
    // And over several days the two players' quest streams differ.
    let a = openedWithSeed('alice');
    let b = openedWithSeed('bob');
    for (let day = 10; day <= 14; day++) {
      a = receiveQuests(a, day * DAY);
      b = receiveQuests(b, day * DAY);
    }
    expect(a.quests.list.map((q) => q.objective)).not.toEqual(b.quests.list.map((q) => q.objective));
  });

  it('gives a walk quest its step baseline at arrival, not at acceptance', () => {
    const save = opened();
    save.stepsTotal = 400;
    const next = receiveQuests(save, 10 * DAY);
    for (const quest of next.quests.list) {
      if (quest.objective === 'walk') expect(quest.stepsAtArrive).toBe(400);
      else expect(quest.stepsAtArrive).toBeUndefined();
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
    expect(rerolled.id).toBe('q|10|reroll0');
    expect(rerolled.arrivedAt).toBe(quest.arrivedAt);
    expect(rerolled.expiresAt).toBe(quest.expiresAt);
    expect(rerolled.acceptedAt).toBe(null);
    expect(save.quests.rerollDay).toBe(10);
    expect(save.quests.rerolls).toBe(1);

    expect(rerollProblem(save, rerolled.id, 10 * DAY + HOUR)).toBe('used');
    expect(rerollQuest(save, rerolled.id, 10 * DAY + HOUR).quests.list[1].id).toBe('q|10|reroll0');
    expect(rerollProblem(save, rerolled.id, 11 * DAY)).toBe(null);
    expect(rerollQuest(save, rerolled.id, 11 * DAY).quests.list[1].id).toBe('q|11|reroll0');

    const done = { ...save.quests.list[2], doneAt: 10 * DAY };
    save.quests.list[2] = done;
    expect(rerollProblem(save, done.id, 12 * DAY)).toBe('done');
    expect(rerollProblem(save, 'missing', 12 * DAY)).toBe('gone');
  });

  it('gives a second reroll with the Extra reroll track, with its own id', () => {
    let save = receiveQuests(opened(), 10 * DAY);
    save = { ...save, guild: { questReroll: 1 } };
    const quest = save.quests.list[1];
    const first = rerollQuest(save, quest.id, 10 * DAY);
    expect(first.quests.list[1].id).toBe('q|10|reroll0');
    const second = rerollQuest(first, first.quests.list[1].id, 10 * DAY + HOUR);
    expect(second.quests.list[1].id).toBe('q|10|reroll1');
    expect(second.quests.rerolls).toBe(2);
    expect(rerollProblem(second, second.quests.list[1].id, 10 * DAY + 2 * HOUR)).toBe('used');
    // The allowance resets on the next rotation day.
    expect(rerollProblem(second, second.quests.list[1].id, 11 * DAY)).toBe(null);
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
    save.clearedDungeons = [tierBoss(1).id]; // the lair is revealed at tier 2
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

  it('offers patrols once the tutorial is done, fight events once a patrol is won', () => {
    const save = opened();
    expect(availableObjectives(save, 'short')).toContain('patrols');
    expect(availableObjectives(save, 'short')).not.toContain('fightEvent');
    save.stats.patrolsWon = 1;
    expect(availableObjectives(save, 'short')).toContain('fightEvent');
  });
});
