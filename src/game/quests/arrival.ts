import { objectives, questRules, type QuestBand, type QuestObjective } from '@/content/quests';
import { rotationRules } from '@/content/rotation';

import { rotationDay } from '../dungeons/rotation';
import { createRng, type Rng } from '../generation/rng';
import { questCap, guildBonus } from '../guild/guild';
import type { SaveData } from '../save';
import { isRevealed } from '../reveal/reveal';
import { refreshWalks } from './progress';
import { availableObjectives, deliverItems, objectiveAmount } from './unlocks';
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

/** The active quests among the given list (open, regular ones): they hold the variety slots. */
const activeQuests = (list: Quest[]): Quest[] => list.filter((quest) => quest.band !== 'secret' && quest.doneAt === null);

/**
 * Rolls one quest's slot: band, then objective among what this player can get,
 * keeping the variety rule — a kind not already active while others are
 * unlocked; once every unlocked kind is taken, a kind may repeat (never Walk
 * twice, and avoiding an objective already active within its kind).
 */
function rollQuest(id: string, band: QuestBand, save: SaveData, rng: Rng, arrivedAt: number, existing: Quest[]): Quest {
  const available = availableObjectives(save, band);
  const active = activeQuests(existing);
  const takenKinds = new Set(active.map((quest) => objectives[quest.objective as QuestObjective].kind));
  const free = available.filter((objective) => !takenKinds.has(objectives[objective].kind));
  let candidates = free;
  if (candidates.length === 0 && questRules.variety.onePerKind) {
    // Every unlocked kind is taken: a kind may repeat, but never Walk twice.
    candidates = questRules.variety.walkNeverRepeats
      ? available.filter((objective) => !(objectives[objective].kind === 'walk' && takenKinds.has('walk')))
      : available;
    // Within a kind, avoid the same objective as an active quest where one is left.
    const takenObjectives = new Set(active.map((quest) => quest.objective));
    const fresh = candidates.filter((objective) => !takenObjectives.has(objective));
    if (fresh.length > 0) candidates = fresh;
  }
  if (candidates.length === 0) candidates = available;
  const objective = rng.weighted(candidates, (o) => objectives[o].weight);
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
    ...(objective === 'walk' ? { stepsAtArrive: save.stepsTotal } : {}),
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
  if (!isRevealed(save, 'quests')) return save;
  const today = rotationDay(now);
  if (save.quests.lastArrivalDay === today) return save;
  const first = save.quests.lastArrivalDay === null ? today : save.quests.lastArrivalDay + 1;
  let list = save.quests.list;
  let capped = false;
  for (let day = first; day <= today && !capped; day++) {
    const arrivedAt = dayStart(day);
    if (arrivedAt + questRules.lifetimeHours * HOUR_MS <= now) continue;
    const count = createRng(`quests|${save.playerSeed}|${day}`).int(...questRules.arrivalsPerDay);
    const fresh: Quest[] = [];
    for (let i = 0; i < count; i++) {
      if (activeCount({ ...save, quests: { ...save.quests, list: [...list, ...fresh] } }) >= questCap(save)) {
        capped = true;
        break;
      }
      const rng = createRng(`quest|${save.playerSeed}|${day}|${i}`);
      const bands = Object.keys(questRules.bandWeights) as QuestBand[];
      const band = rng.weighted(bands, (b) => questRules.bandWeights[b]);
      fresh.push(rollQuest(`q|${day}|${i}`, band, save, rng, arrivedAt, [...list, ...fresh]));
    }
    list = [...list, ...fresh];
  }
  return questsState(save, { list, lastArrivalDay: today });
}

/** Rerolls left today: the daily ones plus the Guild Hall's, less those used. */
export function rerollsLeft(save: SaveData, now: number) {
  const used = save.quests.rerollDay === rotationDay(now) ? save.quests.rerolls : 0;
  return Math.max(0, questRules.rerollsPerDay + guildBonus(save, 'questReroll') - used);
}

/** Why a quest can't be rerolled, or null when it can. */
export function rerollProblem(save: SaveData, questId: string, now: number): 'used' | 'done' | 'gone' | null {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (rerollsLeft(save, now) === 0) return 'used';
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
  const n = save.quests.rerollDay === day ? save.quests.rerolls : 0;
  const rng = createRng(`quest|${save.playerSeed}|${day}|reroll${n}`);
  const bands = Object.keys(questRules.bandWeights) as QuestBand[];
  const band = rng.weighted(bands, (b) => questRules.bandWeights[b]);
  const others = save.quests.list.filter((q) => q.id !== questId);
  const fresh = rollQuest(`q|${day}|reroll${n}`, band, save, rng, old.arrivedAt, others);
  // A rerolled walk quest keeps its clock: the same baseline, so no walk is lost.
  const baseline = fresh.objective === 'walk' && old.objective === 'walk' ? old.stepsAtArrive : undefined;
  const rerolled: Quest = { ...fresh, arrivedAt: old.arrivedAt, expiresAt: old.expiresAt, ...(baseline !== undefined ? { stepsAtArrive: baseline } : {}) };
  const list = save.quests.list.map((q, i) => (i === index ? rerolled : q));
  return questsState(save, { list, rerollDay: day, rerolls: n + 1 });
}

/** Drops quests that lapsed unfinished (done ones wait to be claimed) and old completions. */
export function pruneQuests(save: SaveData, now: number): SaveData {
  const windowMs = questRules.secret.windowHours * HOUR_MS;
  const list = save.quests.list.filter((quest) => quest.doneAt !== null || quest.expiresAt > now);
  const completions = save.quests.completions.filter((at) => at > now - windowMs);
  if (list.length === save.quests.list.length && completions.length === save.quests.completions.length) return save;
  return questsState(save, { list, completions });
}

/** Keeps the quests current on app open and return: lapsed ones go, the day's arrive, walks catch up. */
export function questUpkeep(save: SaveData, now: number): SaveData {
  return refreshWalks(receiveQuests(pruneQuests(save, now), now), now);
}
