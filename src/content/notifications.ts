import type { NotificationCategory, NotificationGroup } from '@/game/notifications/types';
import type { ExpeditionOutcome } from '@/game/types';

/** Android channels, one per settings group, so players can also manage them in system settings. */
export const notificationGroups: Record<NotificationGroup, { title: string; description: string }> = {
  expeditions: { title: 'Expeditions & heroes', description: 'Expedition results, rested heroes and idle hero reminders.' },
  steps: { title: 'Steps & daily goals', description: 'Step chests and the daily reset.' },
};

export const notificationCategories: Record<
  NotificationCategory,
  { group: NotificationGroup; title: string; description: string; defaultOn: boolean }
> = {
  expeditionFinished: {
    group: 'expeditions',
    title: 'Expedition finished',
    description: 'When a team comes back, with how it went.',
    defaultOn: true,
  },
  bigResult: {
    group: 'expeditions',
    title: 'Big results',
    description: 'Highlights boss victories, blueprints and Sanctum Sigils.',
    defaultOn: true,
  },
  heroesIdle: {
    group: 'expeditions',
    title: 'Heroes idle',
    description: 'One gentle reminder when nobody has been out for a while.',
    defaultOn: false,
  },
  heroesRested: {
    group: 'expeditions',
    title: 'Heroes rested',
    description: 'When the heroes who came back hurt from the last expedition are at full HP again.',
    defaultOn: false,
  },
  chestUnlocked: {
    group: 'steps',
    title: 'Step chest unlocked',
    description: 'When your steps today open a chest.',
    defaultOn: true,
  },
  chestClose: {
    group: 'steps',
    title: 'Close to the next chest',
    description: 'When you are a short walk away from the next chest.',
    defaultOn: true,
  },
  dailyReset: {
    group: 'steps',
    title: 'Daily reset',
    description: 'At midnight, when the step chests reset.',
    defaultOn: false,
  },
};

export const notificationRules = {
  /** Expeditions ending within this many minutes of each other share one notification. */
  groupWindowMinutes: 2,
  /** Hours without anyone on an expedition before the idle reminder. */
  idleHours: 4,
  /** Steps before the next chest that count as "close". */
  closeToChestSteps: 1000,
  /** Default quiet hours, in minutes after midnight (local time). */
  quietHours: { start: 22 * 60, end: 8 * 60 },
};

// Wording. Placeholders: {dungeon} {outcome} {highlights} {results} {chest} {steps}
export const notificationTexts = {
  outcome: {
    flawless: 'flawless victory',
    success: 'victory',
    retreat: 'they had to retreat',
    defeat: 'defeat',
  } satisfies Record<ExpeditionOutcome, string>,
  finished: { title: 'Expedition finished', body: 'Your team is back from {dungeon}: {outcome}!' },
  bigResult: { title: '🏆 Big result!', body: 'Your team is back from {dungeon}: {highlights}!' },
  groupFinished: { title: 'Your teams are back', body: '{results}' },
  groupBigResult: { title: '🏆 Your teams are back with big news', body: '{results}' },
  highlights: { boss: 'boss defeated', blueprint: 'new blueprint ({item})', sigil: 'a Sanctum Sigil' },
  heroesIdle: { title: 'Your heroes are restless', body: 'Nobody has been on an expedition for a while. Send a team out?' },
  heroesRested: { title: 'Heroes rested', body: 'Your heroes are back to full health, ready for the next expedition.' },
  chestUnlocked: { title: 'Step chest unlocked', body: 'Your {chest} is ready to open.' },
  chestClose: { title: 'Almost there', body: 'Only {steps} more steps to your {chest}.' },
  dailyReset: { title: 'New day', body: 'New day, new step chests.' },
};
