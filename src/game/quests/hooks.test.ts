import { emptyLoot } from '../loot/types';
import type { LatLng } from '../generation/types';
import { grantPatrolWin } from '../patrols/fight';
import type { PlaceSpawn } from '../places/generate';
import { digRuin } from '../places/ruins';
import { recordSteps, syncSteps } from '../rewards/chests';
import { createInitialSave, type SaveData } from '../save';
import { refreshWalks } from './progress';
import type { Quest } from './types';

const DAY = 86_400_000;
const here: LatLng = { latitude: 51.5, longitude: -0.12 };

const ruin = (id: string): PlaceSpawn => ({ id, kind: 'ruins', group: 'ruins', tile: 't', position: here, startsAt: 0, expiresAt: 3 * DAY, roll: 0 });

const withQuest = (overrides: Partial<Quest>): SaveData => {
  const save = createInitialSave();
  const quest: Quest = {
    id: 'q|1|0',
    objective: 'ruins',
    band: 'short',
    arrivedAt: 0,
    expiresAt: 2 * DAY,
    acceptedAt: 0,
    amount: 1,
    progress: 0,
    target: { placeId: 'ruin-1', kind: 'ruins', position: here, from: here, expiresAt: 3 * DAY },
    doneAt: null,
    seen: true,
    ...overrides,
  };
  return { ...save, quests: { ...save.quests, list: [quest] } };
};

describe('quests follow the game', () => {
  it('a dug ruin completes the quest only when it is the target', () => {
    expect(digRuin(withQuest({}), ruin('ruin-2'), here, 10).save.quests.list[0].doneAt).toBeNull();
    expect(digRuin(withQuest({}), ruin('ruin-1'), here, 10).save.quests.list[0].doneAt).toBe(10);
  });

  it('a patrol win counts, by the player or the escort', () => {
    const save = withQuest({ objective: 'patrols', amount: 2, target: null });
    const once = grantPatrolWin(save, [], emptyLoot(), 'patrol-1', DAY, 10);
    expect(once.quests.list[0].progress).toBe(1);
  });

  it('steps add up to the lifetime total that walk quests read', () => {
    const save = withQuest({ objective: 'walk', amount: 500, target: null, stepsAtAccept: 0 });
    const walked = recordSteps(save, '2026-10-30', 400);
    expect(walked.stepsTotal).toBe(400);
    const synced = syncSteps(walked, '2026-10-30', 700);
    expect(synced.stepsTotal).toBe(700);
    expect(refreshWalks(synced, 10).quests.list[0].doneAt).toBe(10);
  });
});
