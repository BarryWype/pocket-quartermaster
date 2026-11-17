import { placeRules } from '@/content/places';
import { objectives, questRules } from '@/content/quests';
import { gatheringConfig } from '@/content/gatheringConfig';

import { rotationDay } from '../dungeons/rotation';
import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import type { Quest, QuestsState } from './types';

const HOUR_MS = 3_600_000;

export type QuestEvent =
  | { kind: 'placeUsed'; placeId: string } // chapel used, library opened, ruin dug, catch, fight/lair won
  | { kind: 'patrolWon' }
  | { kind: 'gathered'; materialId: string; amount: number }
  | { kind: 'sold'; gold: number } // goods sold anywhere: materials, gear
  | { kind: 'arrived'; placeId: string } // reached a 'mark'
  | { kind: 'discovered'; count: number } // network places or sites discovered
  | { kind: 'built' } // a building raised on a site
  | { kind: 'orderStep' } // an order reached one of its steps
  | { kind: 'supplied'; good: string; placeKind: string; amount: number }; // goods delivered to an order, by cart or by hand

const questsState = (save: SaveData, quests: Partial<QuestsState>): SaveData => ({
  ...save,
  quests: { ...save.quests, ...quests },
});

/**
 * A quest counts what happens to it from the moment it arrives — walk, gather
 * and patrol objectives, which need no map target — or from when it was shown
 * and got its target, for the place objectives. Until it is done or lapses.
 */
const countsFromArrival = (quest: Quest) =>
  quest.objective === 'walk' ||
  quest.objective === 'gatherOnWay' ||
  quest.objective === 'patrols' ||
  quest.objective === 'sellGoods' ||
  (quest.objective !== 'mark' && objectives[quest.objective].kind === 'network');

const counts = (quest: Quest, at: number) =>
  quest.doneAt === null &&
  quest.expiresAt > at &&
  quest.arrivedAt <= at &&
  (countsFromArrival(quest) || (quest.acceptedAt !== null && quest.acceptedAt <= at));

/** Records the completion and pops the secret quest when the window fills up. */
export function complete(save: SaveData, quest: Quest, at: number): SaveData {
  const done: Quest = { ...quest, doneAt: at, seen: false };
  let next: SaveData = {
    ...save,
    stats: { ...save.stats, questsDone: save.stats.questsDone + 1 },
    quests: { ...save.quests, list: save.quests.list.map((q) => (q.id === quest.id ? done : q)) },
  };
  if (quest.band !== 'secret') {
    next = questsState(next, { completions: [...next.quests.completions, at] });
  }
  return maybeSecretQuest(next, at);
}

/**
 * Feeds one happening of the world into the quests: place events only count at
 * a quest's own target; gathers and patrol wins count anywhere.
 */
export function questEvent(save: SaveData, event: QuestEvent, at: number): SaveData {
  let next = save;
  for (const quest of save.quests.list) {
    if (!counts(quest, at)) continue;
    const atTarget = 'placeId' in event && quest.target?.placeId === event.placeId;
    const objective = quest.objective === 'mark' ? null : objectives[quest.objective];
    let progress = quest.progress;
    switch (event.kind) {
      case 'placeUsed':
        if (atTarget && (objective?.kind === 'visit' || objective?.kind === 'fight')) progress += quest.amount;
        break;
      case 'patrolWon':
        if (quest.objective === 'patrols') progress += 1;
        break;
      case 'gathered':
        if (
          quest.objective === 'gatherOnWay' &&
          (questRules.gatherOnWayMaterials as string[]).includes(event.materialId)
        ) {
          progress += event.amount;
        }
        break;
      case 'sold':
        if (quest.objective === 'sellGoods') progress += event.gold;
        break;
      case 'arrived':
        if (atTarget && quest.objective === 'mark') progress += quest.amount;
        break;
      case 'discovered':
        if (quest.objective === 'discover') progress += event.count;
        break;
      case 'built':
        if (quest.objective === 'build') progress += 1;
        break;
      case 'orderStep':
        if (quest.objective === 'orderStep') progress += 1;
        break;
      case 'supplied':
        if (quest.objective === 'supply' && quest.itemId === event.good && quest.placeKind === event.placeKind) progress += event.amount;
        break;
    }
    if (progress >= quest.amount && quest.progress < quest.amount) {
      next = complete(next, { ...quest, progress }, at);
    } else if (progress !== quest.progress) {
      next = questsState(next, {
        list: next.quests.list.map((q) => (q.id === quest.id ? { ...q, progress } : q)),
      });
    }
  }
  return next;
}

/**
 * Ride the route: a position within arrival range of a stop not yet passed
 * marks it; a stop that has left counts as passed; once every stop is passed,
 * reaching the hall finishes the quest.
 */
export function passRoute(save: SaveData, position: LatLng, hall: LatLng | null, at: number): SaveData {
  let next = save;
  for (const quest of save.quests.list) {
    if (quest.objective !== 'rideRoute' || !quest.route || !counts(quest, at)) continue;
    const near = (point: LatLng) => distanceMeters(position, point) <= questRules.arrivalMeters;
    const passed = [...quest.route.passed, ...quest.route.stops.filter((stop) => !quest.route!.passed.includes(stop.id) && near(stop.position)).map((stop) => stop.id)];
    const gone = (id: string) => !save.supply.buildings.some((b) => b.id === id) && !(id in save.supply.orders);
    const done = quest.route.stops.filter((stop) => passed.includes(stop.id) || gone(stop.id)).length;
    const allPassed = done === quest.route.stops.length;
    const progress = done + (allPassed && hall !== null && near(hall) ? 1 : 0);
    if (progress === quest.progress) continue;
    const updated: Quest = { ...quest, progress, route: { ...quest.route, passed } };
    next = progress >= quest.amount
      ? complete(next, updated, at)
      : questsState(next, { list: next.quests.list.map((q) => (q.id === quest.id ? updated : q)) });
  }
  return next;
}

/** Walk quests: progress follows the lifetime step count from when the quest arrived. */
export function refreshWalks(save: SaveData, at: number): SaveData {
  let next = save;
  for (const quest of save.quests.list) {
    if (quest.objective !== 'walk' || !counts(quest, at)) continue;
    const stride = gatheringConfig.autoGather.strideMeters;
    const walked = Math.max(0, save.stepsTotal - (quest.stepsAtArrive ?? save.stepsTotal));
    const progress = Math.min(Math.floor((walked * stride)), quest.amount);
    if (progress === quest.progress) continue;
    next = progress >= quest.amount
      ? complete(next, { ...quest, progress }, at)
      : questsState(next, {
          list: next.quests.list.map((q) => (q.id === quest.id ? { ...q, progress } : q)),
        });
  }
  return next;
}

export function deliverProblem(
  save: SaveData,
  questId: string,
  place: PlaceSpawn,
  player: LatLng,
  now: number,
): 'notHere' | 'tooFar' | 'missing' | 'done' | null {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (!quest) return 'notHere';
  if (quest.doneAt !== null) return 'done';
  if (quest.target?.placeId !== place.id) return 'notHere';
  if (distanceMeters(player, place.position) > placeRules.interactionMeters) return 'tooFar';
  if ((save.consumables[quest.itemId ?? ''] ?? 0) < quest.amount) return 'missing';
  return null;
}

/** Hands the quest's item over at its target, using the stock up. */
export function deliver(save: SaveData, questId: string, place: PlaceSpawn, player: LatLng, now: number): SaveData {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (!quest?.itemId || deliverProblem(save, questId, place, player, now) !== null) return save;
  const consumables = { ...save.consumables, [quest.itemId]: (save.consumables[quest.itemId] ?? 0) - quest.amount };
  return complete({ ...save, consumables }, quest, now);
}

/** Pops the day's secret quest when enough quests were completed within the window. */
export function maybeSecretQuest(save: SaveData, at: number): SaveData {
  const { completions, secretDay } = save.quests;
  const day = rotationDay(at);
  if (secretDay === day) return save;
  const windowMs = questRules.secret.windowHours * HOUR_MS;
  if (completions.filter((done) => done > at - windowMs).length < questRules.secret.completions) return save;
  const quest: Quest = {
    id: `s|${day}`,
    objective: 'mark',
    band: 'secret',
    arrivedAt: at,
    expiresAt: at + questRules.secret.lifetimeHours * HOUR_MS,
    acceptedAt: null,
    amount: 1,
    progress: 0,
    target: null,
    doneAt: null,
    seen: false,
  };
  return questsState(save, { list: [...save.quests.list, quest], secretDay: day });
}

/** Strange marks reached in the background, kept until the app resolves them with its map tiles. */
export function noteMarksReached(save: SaveData, arrivals: { questId: string; at: number }[]): SaveData {
  if (arrivals.length === 0) return save;
  const list = save.quests.list.map((quest) => {
    const arrival = arrivals.find((a) => a.questId === quest.id);
    return arrival && quest.objective === 'mark' && quest.doneAt === null && quest.reachedAt === undefined
      ? { ...quest, reachedAt: arrival.at }
      : quest;
  });
  return questsState(save, { list });
}

/** Everything in the list has been shown (badge cleared). */
export function markSeen(save: SaveData): SaveData {
  if (save.quests.list.every((quest) => quest.seen)) return save;
  return questsState(save, { list: save.quests.list.map((quest) => ({ ...quest, seen: true })) });
}
