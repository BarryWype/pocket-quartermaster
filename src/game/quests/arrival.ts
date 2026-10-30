import { objectives, questRules, type QuestBand, type QuestObjective } from '@/content/quests';
import { rotationRules } from '@/content/rotation';

import { rotationDay } from '../dungeons/rotation';
import { createRng, type Rng } from '../generation/rng';
import type { SaveData } from '../save';
import { availableObjectives, deliverItems, objectiveAmount, questsOpen } from './unlocks';
import type { Quest, QuestsState } from './types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const dayStart = (day: number) => day * DAY_MS + rotationRules.resetHourUtc * HOUR_MS;

/** Deliver items whose destination place kind this player has seen. */
const deliverOptions = (save: SaveData) =>
  deliverItems(save).filter((item) => save.seenPlaceKinds.includes(item.place));

/** Regular quests still in the list, done or not (the secret quest doesn't count). */
export function activeCount(save: SaveData): number {
  return save.quests.list.filter((quest) => quest.band !== 'secret').length;
}

const questsState = (save: SaveData, quests: Partial<QuestsState>): SaveData => ({
  ...save,
  quests: { ...save.quests, ...quests },
});

/** Rolls one quest's slot: band, then objective among what this player can get. */
function rollQuest(id: string, band: QuestBand, save: SaveData, rng: Rng, arrivedAt: number): Quest {
  const available = availableObjectives(save, band);
  const objective = rng.weighted(available, (o) => objectives[o].weight);
  return newQuest(id, band, objective, save, rng, arrivedAt);
}

/** A fresh quest: amount by band, a deliver item, nothing accepted or targeted yet. */
export function newQuest(
  id: string,
  band: QuestBand,
  objective: QuestObjective,
  save: SaveData,
  rng: Rng,
  arrivedAt: number,
): Quest {
  let itemId: string | undefined;
  if (objective === 'deliver') {
    const options = deliverOptions(save);
    itemId = options[rng.int(0, options.length - 1)]?.itemId;
  }
  return {
    id,
    objective,
    band,
    arrivedAt,
    expiresAt: arrivedAt + questRules.lifetimeHours * HOUR_MS,
    acceptedAt: null,
    amount: objectiveAmount(objective, band),
    progress: 0,
    ...(itemId !== undefined ? { itemId } : {}),
    target: null,
    doneAt: null,
    seen: false,
  };
}

/**
 * Hands out the quests of every rotation day since the last arrival, up to
 * today: 2–3 a day, each 48 h alive, none past the cap. Nothing before the
 * tutorial is done.
 */
export function receiveQuests(save: SaveData, now: number): SaveData {
  if (!questsOpen(save)) return save;
  const today = rotationDay(now);
  const first = save.quests.lastArrivalDay === null ? today : save.quests.lastArrivalDay + 1;
  let list = save.quests.list;
  let capped = false;
  for (let day = first; day <= today && !capped; day++) {
    const arrivedAt = dayStart(day);
    if (arrivedAt + questRules.lifetimeHours * HOUR_MS <= now) continue;
    const count = createRng(`quests|${day}`).int(...questRules.arrivalsPerDay);
    const fresh: Quest[] = [];
    for (let i = 0; i < count; i++) {
      if (activeCount({ ...save, quests: { ...save.quests, list } }) >= questRules.cap) {
        capped = true;
        break;
      }
      const rng = createRng(`quest|${day}|${i}`);
      const bands = Object.keys(questRules.bandWeights) as QuestBand[];
      const band = rng.weighted(bands, (b) => questRules.bandWeights[b]);
      fresh.push(rollQuest(`q|${day}|${i}`, band, save, rng, arrivedAt));
    }
    list = [...list, ...fresh];
  }
  return questsState(save, { list, lastArrivalDay: today });
}

/** Why a quest can't be rerolled, or null when it can. */
export function rerollProblem(save: SaveData, questId: string, now: number): 'used' | 'done' | 'gone' | null {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (save.quests.rerollDay === rotationDay(now)) return 'used';
  if (!quest) return 'gone';
  if (quest.doneAt !== null) return 'done';
  return null;
}

/** The day's free reroll: a fresh quest in the old one's slot, keeping its clock. */
export function rerollQuest(save: SaveData, questId: string, now: number): SaveData {
  if (rerollProblem(save, questId, now) !== null) return save;
  const day = rotationDay(now);
  const index = save.quests.list.findIndex((q) => q.id === questId);
  const old = save.quests.list[index];
  const rng = createRng(`quest|${day}|reroll`);
  const bands = Object.keys(questRules.bandWeights) as QuestBand[];
  const band = rng.weighted(bands, (b) => questRules.bandWeights[b]);
  const fresh = rollQuest(`q|${day}|reroll`, band, save, rng, old.arrivedAt);
  const rerolled: Quest = { ...fresh, arrivedAt: old.arrivedAt, expiresAt: old.expiresAt };
  const list = save.quests.list.map((q, i) => (i === index ? rerolled : q));
  return questsState(save, { list, rerollDay: day });
}

/** Drops quests that lapsed unfinished (done ones wait to be claimed) and old completions. */
export function pruneQuests(save: SaveData, now: number): SaveData {
  const windowMs = questRules.secret.windowHours * HOUR_MS;
  return questsState(save, {
    list: save.quests.list.filter((quest) => quest.doneAt !== null || quest.expiresAt > now),
    completions: save.quests.completions.filter((at) => at > now - windowMs),
  });
}
