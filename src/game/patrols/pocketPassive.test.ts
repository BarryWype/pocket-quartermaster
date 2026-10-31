import { nearbyKinds } from '@/content/pocketMode';

import type { WalkFix } from '../gathering/autoGather';
import { distanceMeters, interpolate } from '../generation/geo';
import { startExpedition } from '../expeditions/expeditions';
import { defaultNotificationSettings } from '../notifications/plan';
import { emptyPocketLog, pocketNotifications } from '../notifications/pocket';
import { placesAround } from '../places/generate';
import { isFightPlace, startPlaceFight } from '../places/fights';
import { digRuin } from '../places/ruins';
import { buy, sellGear, sellMaterial, sellValuable } from '../places/shops';
import { claimQuest } from '../quests/rewards';
import type { Quest } from '../quests/types';
import type { SaveData } from '../save';
import { buyAtBlackMarket, enterSecret, recruitAtSecret } from '../secrets/places';
import { launchUnderwater } from '../secrets/dungeon';
import { backgroundStep, snapshotBackground, type BackgroundState } from './escort';
import { startPatrolFight } from './fight';
import { pocketStep, snapshotPocket } from './pocketMode';
import { escortTeam, HOME, T0 } from './testHelpers';

/** Every action that takes a decision for the player, watched. */
const spy = (path: string, names: string[]) => {
  const actual = jest.requireActual(path);
  return { ...actual, ...Object.fromEntries(names.map((name) => [name, jest.fn(actual[name])])) };
};
jest.mock('../places/fights', () => spy('../places/fights', ['startPlaceFight']));
jest.mock('../places/ruins', () => spy('../places/ruins', ['digRuin']));
jest.mock('../places/shops', () => spy('../places/shops', ['buy', 'sellGear', 'sellMaterial', 'sellValuable']));
jest.mock('../quests/rewards', () => spy('../quests/rewards', ['claimQuest']));
jest.mock('../secrets/places', () => spy('../secrets/places', ['enterSecret', 'recruitAtSecret', 'buyAtBlackMarket']));
jest.mock('../secrets/dungeon', () => spy('../secrets/dungeon', ['launchUnderwater']));
jest.mock('../expeditions/expeditions', () => spy('../expeditions/expeditions', ['startExpedition']));
jest.mock('./fight', () => spy('./fight', ['startPatrolFight']));

const ACTIONS = [
  startPlaceFight,
  digRuin,
  buy,
  sellGear,
  sellMaterial,
  sellValuable,
  claimQuest,
  enterSecret,
  recruitAtSecret,
  buyAtBlackMarket,
  launchUnderwater,
  startExpedition,
  startPatrolFight,
];

/** A short walk quest, accepted, so the walk finishes it. */
const walkQuest = (save: SaveData): Quest => ({
  id: 'q|walk',
  objective: 'walk',
  band: 'short',
  arrivedAt: T0,
  expiresAt: T0 + 2 * 86_400_000,
  acceptedAt: T0,
  amount: 100,
  progress: 0,
  stepsAtArrive: save.stepsTotal,
  target: null,
  doneAt: null,
  seen: true,
});

/** Fixes every 10 m at walking pace, from HOME to `to` and as far again. */
function walkThrough(to: { latitude: number; longitude: number }, from: number): WalkFix[] {
  const meters = distanceMeters(HOME, to);
  const count = Math.ceil((2 * meters) / 10);
  return Array.from({ length: count + 1 }, (_, i) => ({
    position: interpolate(HOME, to, (2 * i) / count),
    accuracy: 8,
    timestamp: from + Math.round((i * 10 * 1000) / 1.4),
    stepsCounted: false,
  }));
}

describe('Pocket mode stays passive', () => {
  it('walks past a fight event with quests and the escort, and never acts for the player', () => {
    let at = T0;
    let fight = placesAround(HOME, at).find((spawn) => isFightPlace(spawn.kind) && spawn.startsAt <= at);
    while (!fight) {
      at += 3_600_000;
      fight = placesAround(HOME, at).find((spawn) => isFightPlace(spawn.kind) && spawn.startsAt <= at);
    }
    const team = escortTeam();
    const save: SaveData = {
      ...team,
      revealAll: true,
      escort: { heroId: 'bram' },
      quests: { ...team.quests, list: [walkQuest(team)] },
    };
    const settings = { escortHeroId: 'bram', alertFor: 'all' as const, patrolAlerts: true, escortAlerts: true };
    let state: BackgroundState = { ...snapshotBackground(save, settings, at), pocket: snapshotPocket(save, [...nearbyKinds], at, null) };

    const fixes = walkThrough(fight.position, at + 1000);
    const kinds: string[] = [];
    let log = emptyPocketLog();
    for (let i = 0; i < fixes.length; i += 20) {
      const batch = fixes.slice(i, i + 20);
      const now = batch[batch.length - 1].timestamp;
      const patrols = backgroundStep(state, batch, now);
      const pocket = pocketStep(patrols.state, batch, now);
      state = pocket.state;
      const alerts = [...patrols.alerts.filter((a) => a.kind === 'questTarget'), ...pocket.alerts];
      kinds.push(...alerts.map((a) => a.kind));
      log = pocketNotifications(alerts, log, defaultNotificationSettings(), now).log;
    }

    expect(kinds).toEqual(expect.arrayContaining(['questReady', 'nearbyPlace']));
    for (const action of ACTIONS) expect(action).not.toHaveBeenCalled();
    // The quest is only predicted ready: claiming stays with the player in the app.
    expect(save.quests.list[0].doneAt).toBeNull();
  });
});
