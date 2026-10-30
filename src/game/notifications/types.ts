import type { NearbyKind } from '@/content/pocketMode';

import type { AlertFor } from '../patrols/escort';

export type NotificationGroup = 'expeditions' | 'steps' | 'patrols' | 'places';

export type NotificationCategory =
  | 'expeditionFinished'
  | 'bigResult'
  | 'heistFinished'
  | 'heroesIdle'
  | 'heroesRested'
  | 'chestUnlocked'
  | 'chestClose'
  | 'dailyReset'
  | 'walkSummary'
  | 'questReady'
  | 'questTarget'
  | 'nearbyPlaces'
  | 'secretPlace'
  | 'patrolSpotted'
  | 'escort';

export type NotificationSettings = {
  /** Master switch. */
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  quietHours: {
    enabled: boolean;
    /** Minutes after local midnight. */
    start: number;
    end: number;
  };
  /** Let expedition results through during quiet hours. */
  allowResultsInQuietHours: boolean;
  /** Which patrols a notification is wanted for. */
  patrolAlertFor: AlertFor;
  /** Which places nearby a notification is wanted for. */
  nearbyKinds: NearbyKind[];
};

/** A notification to schedule (`at` is a time) or show now (`at` is null). */
export type PlannedNotification = {
  /** Stable, so re-planning replaces rather than duplicates. */
  id: string;
  category: NotificationCategory;
  group: NotificationGroup;
  at: number | null;
  title: string;
  body: string;
  /** Navigation and other extras merged into the OS payload. */
  data?: Record<string, string | number>;
};
