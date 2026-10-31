import { questRules } from '@/content/quests';
import type { PlaceKind } from '@/content/places';

import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { activeCount, questUpkeep } from './arrival';
import {
  deliver,
  deliverProblem,
  isClaimable,
  markSeen,
  maybeSecretQuest,
  questEvent,
  refreshWalks,
  unseenCount,
  type QuestEvent,
} from './progress';
import { objectiveAmount } from './unlocks';
import type { Quest } from './types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const origin: LatLng = { latitude: 51.5, longitude: -0.12 };
const at = 1000;

const opened = (): SaveData => {
  const save = createInitialSave();
  save.tutorial.step = 'done';
  return save;
};

const quest = (objective: Quest['objective'], band: Quest['band'] = 'short', overrides: Partial<Quest> = {}): Quest => ({
  id: `q|${objective}`,
  objective,
  band,
  arrivedAt: 0,
  expiresAt: 2 * DAY,
  acceptedAt: 100,
  amount: band === 'secret' ? 1 : objectiveAmount(objective, band),
  progress: 0,
  target: null,
  doneAt: null,
  seen: true,
  ...overrides,
});

const target = (placeId: string, kind: PlaceKind) => ({
  placeId,
  kind,
  position: origin,
  from: origin,
  expiresAt: 5 * DAY,
});

const withQuest = (save: SaveData, ...quests: Quest[]): SaveData => ({
  ...save,
  quests: { ...save.quests, list: quests },
});

const feed = (save: SaveData, ...events: QuestEvent[]) => events.reduce((s, e) => questEvent(s, e, at), save);

describe('quest progress', () => {
  it('completes a visit only at its own target', () => {
    const save = withQuest(opened(), quest('chapel', 'short', { target: target('chapel-1', 'chapel') }));
    const elsewhere = feed(save, { kind: 'placeUsed', placeId: 'chapel-2' });
    expect(elsewhere.quests.list[0].doneAt).toBe(null);
    const done = feed(save, { kind: 'placeUsed', placeId: 'chapel-1' });
    expect(done.quests.list[0].doneAt).toBe(at);
    expect(done.quests.completions).toEqual([at]);
    expect(done.quests.list[0].seen).toBe(false);
    expect(unseenCount(done)).toBe(1);
    expect(isClaimable(done.quests.list[0])).toBe(true);
    expect(markSeen(done).quests.list[0].seen).toBe(true);
    expect(unseenCount(markSeen(done))).toBe(0);
  });

  it('completes fights and the lair at their target', () => {
    const save = withQuest(
      opened(),
      quest('fightEvent', 'short', { target: target('camp-1', 'banditCamp') }),
      quest('lair', 'long', { target: target('lair-1', 'monsterLair') }),
    );
    const done = feed(save, { kind: 'placeUsed', placeId: 'camp-1' }, { kind: 'placeUsed', placeId: 'lair-1' });
    expect(done.quests.list.map((q) => q.doneAt)).toEqual([at, at]);
  });

  it('counts patrols won anywhere, N by band', () => {
    const save = withQuest(opened(), quest('patrols', 'medium'));
    const once = feed(save, { kind: 'patrolWon' });
    expect(once.quests.list[0].progress).toBe(1);
    expect(once.quests.list[0].doneAt).toBe(null);
    const done = feed(once, { kind: 'patrolWon' });
    expect(done.quests.list[0].doneAt).toBe(at);
  });

  it('counts herbs, berries and mushrooms, from arrival and before being shown', () => {
    const save = withQuest(opened(), quest('gatherOnWay', 'short'));
    const wood = feed(save, { kind: 'gathered', materialId: 'wood', amount: 10 });
    expect(wood.quests.list[0].progress).toBe(0);
    const herbs = feed(save, { kind: 'gathered', materialId: 'herb', amount: 2 }, { kind: 'gathered', materialId: 'berries', amount: 2 });
    expect(herbs.quests.list[0].doneAt).toBe(at);

    // Never shown in the list: it still counts, from its arrival.
    const unseen = withQuest(opened(), quest('gatherOnWay', 'short', { acceptedAt: null, seen: false }));
    expect(feed(unseen, { kind: 'gathered', materialId: 'mushroom', amount: 4 }).quests.list[0].doneAt).toBe(at);

    const early = withQuest(opened(), quest('gatherOnWay', 'short', { arrivedAt: at + 1 }));
    expect(feed(early, { kind: 'gathered', materialId: 'mushroom', amount: 4 }).quests.list[0].progress).toBe(0);
  });

  it('adds mine units bought at the target', () => {
    const save = withQuest(opened(), quest('mine', 'short', { target: target('mine-1', 'copperMine') }));
    const elsewhere = feed(save, { kind: 'bought', placeId: 'mine-2', amount: 3 });
    expect(elsewhere.quests.list[0].progress).toBe(0);
    const partial = feed(save, { kind: 'bought', placeId: 'mine-1', amount: 2 });
    expect(partial.quests.list[0].progress).toBe(2);
    const done = feed(partial, { kind: 'bought', placeId: 'mine-1', amount: 1 });
    expect(done.quests.list[0].doneAt).toBe(at);
  });

  it('completes the collector at the market', () => {
    const save = withQuest(opened(), quest('collector', 'short', { target: target('market-1', 'market') }));
    expect(feed(save, { kind: 'soldToCollector', placeId: 'market-1' }).quests.list[0].doneAt).toBe(at);
  });

  it('follows the walk from the steps taken since arrival, never shown or not', () => {
    const save = withQuest(opened(), quest('walk', 'short', { stepsAtArrive: 100 }));
    save.stepsTotal = 100 + Math.ceil(500 / 0.75); // just past 500 m of steps
    const done = refreshWalks(save, at);
    expect(done.quests.list[0].doneAt).toBe(at);
    expect(done.quests.list[0].progress).toBe(500);

    const short = withQuest(opened(), quest('walk', 'short', { stepsAtArrive: 100 }));
    short.stepsTotal = 300;
    const walking = refreshWalks(short, at);
    expect(walking.quests.list[0].doneAt).toBe(null);
    expect(walking.quests.list[0].progress).toBe(Math.floor(200 * 0.75));
  });

  it('counts the same walk for every active walk quest, independently', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) =>
      quest('walk', i % 2 === 0 ? 'long' : 'medium', { id, stepsAtArrive: 100 }),
    );
    const save = withQuest(opened(), ...four, quest('walk', 'short', { id: 'done', stepsAtArrive: 100, progress: 500, doneAt: 900 }));
    save.stepsTotal = 100 + 600; // 600 steps: 450 m at the 0.75 m stride
    const next = refreshWalks(save, at);
    const byId = new Map(next.quests.list.map((q) => [q.id, q]));
    expect(byId.get('a')?.progress).toBe(450);
    expect(byId.get('b')?.progress).toBe(450);
    expect(byId.get('c')?.progress).toBe(450);
    expect(byId.get('d')?.progress).toBe(450);
    expect(byId.get('done')?.progress).toBe(500); // already done: untouched
    expect(next.quests.list.filter((q) => q.doneAt !== null).map((q) => q.id)).toEqual(['done']);
  });

  it('counts a walk quest that arrived while the app was closed, never shown', () => {
    const save = withQuest(opened(), quest('walk', 'medium', { arrivedAt: 0, acceptedAt: null, seen: false, stepsAtArrive: 100 }));
    save.stepsTotal = 100 + Math.ceil(1000 / 0.75);
    const next = refreshWalks(save, at);
    expect(next.quests.list[0].doneAt).toBe(at);
    expect(next.quests.list[0].progress).toBe(1000);
  });

  it('keeps walk progress and its baseline across a daily reset and a restart', () => {
    const save = withQuest(opened(), quest('walk', 'long', { stepsAtArrive: 100 }));
    save.stepsTotal = 700;
    const walked = refreshWalks(save, at);
    expect(walked.quests.list[0].progress).toBe(Math.floor(600 * 0.75));
    // A restart: the same save comes back, a new rotation day's upkeep runs.
    const next = questUpkeep(walked, at + DAY);
    expect(next.quests.list[0].progress).toBe(Math.floor(600 * 0.75));
    expect(next.quests.list[0].stepsAtArrive).toBe(100);
    save.stepsTotal = 700 + 400;
    const more = refreshWalks({ ...next, stepsTotal: 1100 }, at + DAY);
    expect(more.quests.list[0].progress).toBe(Math.floor(1000 * 0.75));
  });

  it('delivers at the target only, using up the items', () => {
    const place: PlaceSpawn = {
      id: 'apo-1',
      kind: 'apothecary',
      group: 'apothecary',
      tile: 'test',
      position: origin,
      startsAt: 0,
      expiresAt: 5 * DAY,
      roll: 0,
    };
    const far: PlaceSpawn = { ...place, id: 'apo-2', position: offsetPosition(origin, 500, 0) };
    const save = withQuest(opened(), quest('deliver', 'short', { itemId: 'healingPotion', target: target('apo-1', 'apothecary') }));
    save.consumables = { healingPotion: 1 };

    expect(deliverProblem(save, 'q|deliver', far, origin, at)).toBe('notHere');
    expect(deliverProblem(save, 'q|deliver', place, offsetPosition(origin, 80, 0), at)).toBe('tooFar');
    const empty = withQuest({ ...save, consumables: {} }, save.quests.list[0]);
    expect(deliverProblem(empty, 'q|deliver', place, origin, at)).toBe('missing');

    const done = deliver(save, 'q|deliver', place, origin, at);
    expect(done.consumables.healingPotion).toBe(0);
    expect(done.quests.list[0].doneAt).toBe(at);
    expect(deliverProblem(done, 'q|deliver', place, origin, at)).toBe('done');
    expect(deliver(done, 'q|deliver', place, origin, at).consumables).toEqual(done.consumables);
  });

  it('completes a mark when reached', () => {
    const save = withQuest(
      opened(),
      quest('mark', 'secret', { target: { placeId: 'mark:s|10', kind: 'mark', position: origin, from: origin, expiresAt: 2 * DAY } }),
    );
    expect(feed(save, { kind: 'arrived', placeId: 'mark:s|10' }).quests.list[0].doneAt).toBe(at);
  });

  it('ignores expired quests', () => {
    const save = withQuest(opened(), quest('chapel', 'short', { target: target('chapel-1', 'chapel'), expiresAt: at - 1 }));
    expect(feed(save, { kind: 'placeUsed', placeId: 'chapel-1' }).quests.list[0].doneAt).toBe(null);
  });
});

describe('the secret quest', () => {
  it('pops after 4 completions within 5 hours', () => {
    const four = withQuest(opened(), quest('patrols', 'short'));
    four.quests.completions = [0, HOUR, 2 * HOUR, 3 * HOUR];
    const popped = maybeSecretQuest(four, 4 * HOUR);
    expect(popped.quests.list.map((q) => q.objective)).toContain('mark');
    expect(popped.quests.secretDay).toBe(0);
    expect(popped.quests.list.find((q) => q.band === 'secret')?.id).toBe('s|0');

    const spread = withQuest(opened(), quest('patrols', 'short'));
    spread.quests.completions = [0, 2 * HOUR, 4 * HOUR, 6 * HOUR];
    expect(maybeSecretQuest(spread, 6 * HOUR).quests.secretDay).toBe(null);
  });

  it('pops at most once a rotation day', () => {
    const save = withQuest(opened(), quest('patrols', 'short'));
    save.quests.completions = [0, HOUR, 2 * HOUR, 3 * HOUR];
    const popped = maybeSecretQuest(save, 4 * HOUR);
    expect(popped.quests.list).toHaveLength(2);
    popped.quests.completions = [4 * HOUR, 5 * HOUR, 6 * HOUR, 7 * HOUR];
    const again = maybeSecretQuest(popped, 8 * HOUR);
    expect(again.quests.list.filter((q) => q.band === 'secret')).toHaveLength(1);
    again.quests.completions = [DAY + 4 * HOUR, DAY + 5 * HOUR, DAY + 6 * HOUR, DAY + 7 * HOUR];
    const nextDay = maybeSecretQuest(again, DAY + 8 * HOUR);
    expect(nextDay.quests.list.filter((q) => q.band === 'secret')).toHaveLength(2);
  });

  it('does not count towards the cap', () => {
    const save = opened();
    const secret = quest('mark', 'secret');
    save.quests.list = [
      ...Array.from({ length: questRules.cap }, (_, i) => ({ ...quest('walk', 'short'), id: `q|${i}` })),
      secret,
    ];
    expect(activeCount(save)).toBe(questRules.cap);
  });

  it('completing regular quests feeds the secret window', () => {
    let save = withQuest(opened(), quest('patrols', 'short', { acceptedAt: 0 }));
    for (let i = 0; i < questRules.secret.completions; i++) {
      const q = withQuest(save, quest('patrols', 'short', { id: `q|${i}`, acceptedAt: 0 }));
      save = questEvent(q, { kind: 'patrolWon' }, i * HOUR);
    }
    expect(save.quests.secretDay).toBe(0); // popped on the 4th completion, on rotation day 0
    expect(save.quests.list.some((q) => q.band === 'secret')).toBe(true);
  });
});
