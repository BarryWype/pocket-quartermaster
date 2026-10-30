import { gatheringConfig } from '@/content/gatheringConfig';
import type { NearbyKind } from '@/content/pocketMode';

import type { WalkFix } from '../gathering/autoGather';
import { emptyPocketLog, type PocketAlert, type PocketNotifyLog } from '../notifications/pocket';
import type { SaveData } from '../save';
import type { AlertFor, BackgroundState, PatrolSettings } from './escort';
import { snapshotPocketCounts, stepPocketCounts, type PocketCounts } from './pocketCounts';
import { snapshotNearby, stepNearby, type NearbyWatch } from './pocketNearby';

export type PocketModeSettings = {
  /** The player turned Pocket mode on (it may still be limited to the app being open). */
  enabled: boolean;
  /** The three options; tracking only runs while at least one is on. */
  autoGather: boolean;
  patrolAlerts: boolean;
  escort: boolean;
  autoStopMinutes: number;
  /** The info dialog was shown before the first turn-on. */
  introSeen: boolean;
};

/** Pocket mode is offered once the tutorial is over, finished or skipped (both end at 'done'). */
export const pocketModeAvailable = (save: SaveData) => save.tutorial.step === 'done';

/** Tracking runs only with Pocket mode on and at least one of its options on. */
export const pocketTracking = (settings: PocketModeSettings) =>
  settings.enabled && (settings.autoGather || settings.patrolAlerts || settings.escort);

/** The background task's settings: the escort the save names, and which patrols to alert on. */
export const patrolSettingsFrom = (pocketMode: PocketModeSettings, save: SaveData, alertFor: AlertFor): PatrolSettings => ({
  escortHeroId: pocketMode.escort ? (save.escort?.heroId ?? null) : null,
  alertFor,
  patrolAlerts: pocketMode.patrolAlerts,
  escortAlerts: true,
});

/** Whether the background task's state is wanted at all: whenever tracking runs, for patrols, the escort and quest targets. */
export const needsBackgroundState = (pocketMode: PocketModeSettings): boolean => pocketTracking(pocketMode);

/** What Pocket mode watches in the background besides patrols: counts for quests and chests, places nearby, and its notification log. */
export type PocketWatch = { counts: PocketCounts; nearby: NearbyWatch; log: PocketNotifyLog };

/** From the save at hand-off; what was already alerted, and the notification log, carry over from `previous`. */
export const snapshotPocket = (save: SaveData, nearbyKinds: NearbyKind[], now: number, previous: PocketWatch | null): PocketWatch => ({
  counts: snapshotPocketCounts(save, now, previous?.counts ?? null),
  nearby: snapshotNearby(save, nearbyKinds, now, previous?.nearby ?? null),
  log: previous?.log ?? emptyPocketLog(),
});

/**
 * Pocket mode's watch along a batch of fixes, after the patrol step (so the
 * escort's wins are in `pending`). It only predicts and alerts: the save
 * counts the same walk, wins and gathering when the app opens.
 */
export function pocketStep(state: BackgroundState, fixes: WalkFix[], now: number): { state: BackgroundState; alerts: PocketAlert[] } {
  if (!state.pocket) return { state, alerts: [] };
  const wins = state.pending.filter((result) => result.won).map((result) => result.at);
  const counted = stepPocketCounts(state.pocket.counts, fixes, wins, now);
  const accurate = fixes.filter((fix) => fix.accuracy === null || fix.accuracy <= gatheringConfig.autoGather.maxAccuracyMeters);
  const nearby = stepNearby(state.pocket.nearby, accurate, now);
  return {
    state: { ...state, pocket: { ...state.pocket, counts: counted.counts, nearby: nearby.watch } },
    alerts: [...counted.alerts, ...nearby.alerts],
  };
}

/** The persisted settings as version 2 kept them, before Pocket mode. */
type PersistedV2 = Record<string, unknown> & {
  autoGather?: { enabled?: boolean; autoStopMinutes?: number; introSeen?: boolean };
};

/** Version 2 to 3: the auto-gather switch becomes Pocket mode, its three options on. */
export function migrateSettingsV2(persisted: PersistedV2): Record<string, unknown> & { pocketMode: PocketModeSettings } {
  const { autoGather, ...rest } = persisted;
  return {
    ...rest,
    pocketMode: {
      enabled: autoGather?.enabled ?? false,
      autoGather: true,
      patrolAlerts: true,
      escort: true,
      autoStopMinutes: autoGather?.autoStopMinutes ?? gatheringConfig.autoGather.autoStopMinutes,
      introSeen: autoGather?.introSeen ?? false,
    },
  };
}
