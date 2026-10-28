export type NotificationGroup = 'expeditions' | 'steps';

export type NotificationCategory =
  | 'expeditionFinished'
  | 'bigResult'
  | 'heroesIdle'
  | 'heroesRested'
  | 'chestUnlocked'
  | 'chestClose'
  | 'dailyReset'
  | 'walkSummary';

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
};
