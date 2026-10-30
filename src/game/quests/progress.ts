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
  | { kind: 'bought'; placeId: string; amount: number } // units bought at a mine, sawmill or lodge
  | { kind: 'soldToCollector'; placeId: string } // the market's wanted valuable sold there
  | { kind: 'arrived'; placeId: string }; // reached a 'mark'

const questsState = (save: SaveData, quests: Partial<QuestsState>): SaveData => ({
  ...save,
  quests: { ...save.quests, ...quests },
});

/** A quest counts what happens to it after it was shown, until it is done or lapses. */
const counts = (quest: Quest, at: number) =>
  quest.acceptedAt !== null && quest.acceptedAt <= at && quest.doneAt === null && quest.expiresAt > at;

/** Records the completion and pops the secret quest when the window fills up. */
export function complete(save: SaveData, quest: Quest, at: number): SaveData {
  const done: Quest = { ...quest, doneAt: at, seen: false };
  let next = questsState(save, {
    list: save.quests.list.map((q) => (q.id === quest.id ? done : q)),
  });
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
      case 'bought':
        if (atTarget && quest.objective === 'mine') progress += event.amount;
        break;
      case 'soldToCollector':
        if (atTarget && quest.objective === 'collector') progress += quest.amount;
        break;
      case 'arrived':
        if (atTarget && quest.objective === 'mark') progress += quest.amount;
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

/** Walk quests: progress follows the lifetime step count from when they were accepted. */
export function refreshWalks(save: SaveData, at: number): SaveData {
  let next = save;
  for (const quest of save.quests.list) {
    if (quest.objective !== 'walk' || !counts(quest, at)) continue;
    const stride = gatheringConfig.autoGather.strideMeters;
    const walked = Math.max(0, save.stepsTotal - (quest.stepsAtAccept ?? save.stepsTotal));
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

export function isClaimable(quest: Quest): boolean {
  return quest.doneAt !== null;
}

/** Everything in the list has been shown (badge cleared). */
export function markSeen(save: SaveData): SaveData {
  if (save.quests.list.every((quest) => quest.seen)) return save;
  return questsState(save, { list: save.quests.list.map((quest) => ({ ...quest, seen: true })) });
}

/** Quests waiting to be shown: new arrivals and newly finished ones. */
export function unseenCount(save: SaveData): number {
  return save.quests.list.filter((quest) => !quest.seen).length;
}
