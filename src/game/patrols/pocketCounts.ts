import { gatheringConfig } from '@/content/gatheringConfig';

import { localDayKey } from '../gathering/gathering';
import { walkSegments, type WalkFix } from '../gathering/autoGather';
import { stepChests, stepsRecorded } from '../rewards/chests';
import type { SaveData } from '../save';

/** A walk or patrol quest the background task watches until it is ready to claim. */
export type WatchedQuest = {
  questId: string;
  objective: 'walk' | 'patrols';
  amount: number;
  /** Progress in the save at hand-off. */
  progress: number;
  /** Walk: lifetime steps walked since acceptance at hand-off (stepsTotal - stepsAtAccept). */
  stepsWalked: number;
  expiresAt: number;
};

export type PocketCounts = {
  /** Local day (localDayKey) the step figures are for. */
  day: string;
  /** Today's steps in the save at hand-off (0 when the save's day is another). */
  stepsAtHandOff: number;
  /** Metres walked since hand-off, by local day; rounded to steps once per day like the app. */
  metersByDay: Record<string, number>;
  /** walkSegments' position, so batches join up: starts from save.autoGather.processedUntil / anchor. */
  processedUntil: number;
  anchor: WalkFix | null;
  /** Chests opened today at hand-off. */
  chestsOpened: string[];
  /** Chest ids already alerted on `day`. */
  chestsAlerted: string[];
  quests: WatchedQuest[];
  /** Quest ids already alerted as ready. */
  questsAlerted: string[];
};

export type PocketCountAlert =
  | { kind: 'questReady'; questId: string; objective: 'walk' | 'patrols' }
  | { kind: 'chestReady'; chestId: string; steps: number };

const stride = gatheringConfig.autoGather.strideMeters;

/** Accepted, unfinished walk / patrol quests that haven't lapsed. */
const watchedQuests = (save: SaveData, now: number): WatchedQuest[] =>
  save.quests.list.flatMap((quest) => {
    if (quest.acceptedAt === null || quest.doneAt !== null || quest.expiresAt <= now) return [];
    if (quest.objective !== 'walk' && quest.objective !== 'patrols') return [];
    return [
      {
        questId: quest.id,
        objective: quest.objective,
        amount: quest.amount,
        progress: quest.progress,
        stepsWalked: Math.max(0, save.stepsTotal - (quest.stepsAtAccept ?? save.stepsTotal)),
        expiresAt: quest.expiresAt,
      },
    ];
  });

/** From the save at hand-off; alerted lists carry over from `previous` (chests only for the same day, quests only while still watched). */
export function snapshotPocketCounts(save: SaveData, now: number, previous: PocketCounts | null = null): PocketCounts {
  const day = localDayKey(now);
  const quests = watchedQuests(save, now);
  return {
    day,
    stepsAtHandOff: stepsRecorded(save, day),
    metersByDay: {},
    processedUntil: save.autoGather.processedUntil,
    anchor: save.autoGather.anchor,
    chestsOpened: save.chests.day === day ? save.chests.opened : [],
    chestsAlerted: previous && previous.day === day ? previous.chestsAlerted : [],
    quests,
    questsAlerted: (previous?.questsAlerted ?? []).filter((id) => quests.some((quest) => quest.questId === id)),
  };
}

/**
 * One batch of fixes: estimated steps per day (same segments and rules as
 * processWalkPath with estimateSteps on), then step chests and walk / patrol
 * quests. `escortWins` are the times (BackgroundResult.at) of every fight the
 * escort won since hand-off.
 */
export function stepPocketCounts(
  counts: PocketCounts,
  fixes: WalkFix[],
  escortWins: number[],
  now: number,
): { counts: PocketCounts; alerts: PocketCountAlert[] } {
  const alerts: PocketCountAlert[] = [];
  // The day rolls over before anything is counted, so the chest figures start clean.
  const base = localDayKey(now) !== counts.day
    ? { ...counts, day: localDayKey(now), stepsAtHandOff: 0, chestsOpened: [], chestsAlerted: [] }
    : counts;

  // Steps: the same segments processWalkPath estimates from, metres per local day.
  const metersByDay = { ...base.metersByDay };
  const { segments, anchor, processedUntil } = walkSegments(
    { processedUntil: base.processedUntil, anchor: base.anchor, history: [] },
    fixes,
  );
  for (const { from, to, meters } of segments) {
    if (from.stepsCounted || to.stepsCounted) continue;
    const day = localDayKey(to.timestamp);
    metersByDay[day] = (metersByDay[day] ?? 0) + meters;
  }

  const next: PocketCounts = {
    ...base,
    metersByDay,
    processedUntil,
    anchor,
    chestsAlerted: [...base.chestsAlerted],
    questsAlerted: [...base.questsAlerted],
  };

  // Step chests: today's count from the save plus today's estimate, one alert each.
  const todaySteps = base.stepsAtHandOff + Math.round((metersByDay[base.day] ?? 0) / stride);
  for (const chest of stepChests) {
    if (next.chestsOpened.includes(chest.id) || next.chestsAlerted.includes(chest.id)) continue;
    if (todaySteps < chest.steps) continue;
    next.chestsAlerted.push(chest.id);
    alerts.push({ kind: 'chestReady', chestId: chest.id, steps: chest.steps });
  }

  for (const quest of next.quests) {
    if (next.questsAlerted.includes(quest.questId) || quest.expiresAt <= now) continue;
    const progress =
      quest.objective === 'walk'
        ? Math.min(
            Math.floor((quest.stepsWalked + estimatedSteps(metersByDay)) * stride),
            quest.amount,
          )
        : Math.min(quest.progress + escortWins.filter((at) => at < quest.expiresAt).length, quest.amount);
    if (progress < quest.amount) continue;
    next.questsAlerted.push(quest.questId);
    alerts.push({ kind: 'questReady', questId: quest.questId, objective: quest.objective });
  }

  return { counts: next, alerts };
}

/** Steps estimated since hand-off, rounded once per day like processWalkPath. */
function estimatedSteps(metersByDay: Record<string, number>) {
  return Object.values(metersByDay).reduce((sum, meters) => sum + Math.round(meters / stride), 0);
}
