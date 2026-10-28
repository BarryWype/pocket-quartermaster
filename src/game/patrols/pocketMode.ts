import { gatheringConfig } from '@/content/gatheringConfig';

import type { SaveData } from '../save';
import type { AlertFor, PatrolSettings } from './escort';

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

/** Whether the background task's patrol state is wanted at all: tracking on, with patrol alerts or the escort. */
export const needsBackgroundState = (pocketMode: PocketModeSettings): boolean =>
  pocketTracking(pocketMode) && (pocketMode.patrolAlerts || pocketMode.escort);

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
