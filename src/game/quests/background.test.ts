import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { defaultNotificationSettings } from '../notifications/plan';
import { patrolNotifications } from '../notifications/patrols';
import { backgroundStep, snapshotBackground, type PatrolSettings } from '../patrols/escort';
import { createInitialSave, type SaveData } from '../save';
import { noteMarksReached } from './progress';
import type { Quest, QuestTarget } from './types';

const DAY = 86_400_000;
const start: LatLng = { latitude: 51.5, longitude: -0.12 };
const quiet: PatrolSettings = { escortHeroId: null, alertFor: 'all', patrolAlerts: false, escortAlerts: false };

const target = (kind: QuestTarget['kind'], meters: number): QuestTarget => ({
  placeId: kind === 'mark' ? 'mark:s|1' : 'chapel-1',
  kind,
  position: offsetPosition(start, meters, 0),
  from: start,
  expiresAt: 2 * DAY,
});

const withQuest = (id: string, objective: Quest['objective'], questTarget: QuestTarget): SaveData => {
  const save = createInitialSave();
  const quest: Quest = {
    id,
    objective,
    band: objective === 'mark' ? 'secret' : 'short',
    arrivedAt: 0,
    expiresAt: 2 * DAY,
    acceptedAt: 0,
    amount: 1,
    progress: 0,
    target: questTarget,
    doneAt: null,
    seen: true,
  };
  return { ...save, quests: { ...save.quests, list: [quest] } };
};

describe('quest targets in Pocket mode', () => {
  it('alerts once on reaching a target, and keeps a strange mark reached for the app', () => {
    const save = withQuest('s|1', 'mark', target('mark', 400));
    const state = snapshotBackground(save, quiet, 0);
    const far = backgroundStep(state, [{ position: offsetPosition(start, 200, 0), timestamp: 10 }], 10);
    expect(far.alerts).toEqual([]);
    const there = backgroundStep(far.state, [{ position: offsetPosition(start, 390, 0), timestamp: 20 }], 20);
    expect(there.alerts).toMatchObject([{ kind: 'questTarget', questId: 's|1' }]);
    expect(there.state.questArrivals).toEqual([{ questId: 's|1', at: 20 }]);
    const again = backgroundStep(there.state, [{ position: offsetPosition(start, 400, 0), timestamp: 30 }], 30);
    expect(again.alerts).toEqual([]);

    const noted = noteMarksReached(save, there.state.questArrivals);
    expect(noted.quests.list[0].reachedAt).toBe(20);
  });

  it('only alerts for places that need the player there', () => {
    const save = withQuest('q|1', 'chapel', target('chapel', 300));
    const there = backgroundStep(snapshotBackground(save, quiet, 0), [{ position: offsetPosition(start, 300, 0), timestamp: 10 }], 10);
    expect(there.alerts).toHaveLength(1);
    expect(there.state.questArrivals).toEqual([]);
  });

  it('sends a notification that opens the quests list', () => {
    const settings = { ...defaultNotificationSettings(), quietHours: { ...defaultNotificationSettings().quietHours, enabled: false } };
    const [sent] = patrolNotifications([{ kind: 'questTarget', questId: 'q|1', target: target('chapel', 0) }], null, settings, 0);
    expect(sent).toMatchObject({ id: 'quest:q|1', category: 'questTarget', data: { route: 'quests' } });
    expect(sent.title).toContain('Chapel');
    const off = { ...settings, categories: { ...settings.categories, questTarget: false } };
    expect(patrolNotifications([{ kind: 'questTarget', questId: 'q|1', target: target('chapel', 0) }], null, off, 0)).toEqual([]);
  });
});
