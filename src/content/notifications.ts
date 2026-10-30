import type { NotificationCategory, NotificationGroup } from '@/game/notifications/types';
import type { ExpeditionOutcome } from '@/game/types';

/** Android channels, one per settings group, so players can also manage them in system settings. */
export const notificationGroups: Record<NotificationGroup, { title: string; description: string }> = {
  expeditions: { title: 'Expeditions & heroes', description: 'Expedition results, rested heroes and idle hero reminders.' },
  steps: { title: 'Steps & daily goals', description: 'Step chests, the daily reset and quest targets.' },
  patrols: { title: 'Patrols', description: 'Patrols and travellers spotted nearby, and your escort.' },
  places: { title: 'Places nearby', description: 'Fight events, ruins, treasure and secret places close to your walk.' },
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
  heistFinished: {
    group: 'expeditions',
    title: 'Heist finished',
    description: 'When a hero comes back from a thieves’ guild heist, with loot or empty-handed.',
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
  walkSummary: {
    group: 'steps',
    title: 'Walk summary',
    description: 'When auto-gather stops by itself after a while without movement.',
    defaultOn: false,
  },
  questReady: {
    group: 'steps',
    title: 'Quest ready',
    description: 'When a walk or patrol quest is done while the app is closed, ready to claim.',
    defaultOn: true,
  },
  questTarget: {
    group: 'steps',
    title: 'Quest target near',
    description: 'When you reach a quest’s target that needs you (pray, dig, fight…) while the app is closed.',
    defaultOn: true,
  },
  nearbyPlaces: {
    group: 'places',
    title: 'Places nearby',
    description: 'When a fight event, a ruin or a treasure spot is close to your walk (pick which below).',
    defaultOn: true,
  },
  secretPlace: {
    group: 'places',
    title: 'Secret place',
    description: 'When you pass near a tipped secret place and hold a key.',
    defaultOn: true,
  },
  patrolSpotted: {
    group: 'patrols',
    title: 'Patrol spotted',
    description: 'When a patrol or a traveller comes into view while the app is closed.',
    defaultOn: true,
  },
  escort: {
    group: 'patrols',
    title: 'Escort',
    description: 'When your escort pauses to rest or is knocked out.',
    defaultOn: true,
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
  heistFinished: { title: 'Heist over', body: '{name} is back from a heist, {outcome}.' },
  heistOutcome: { loot: 'with loot', empty: 'empty-handed' },
  heroesIdle: { title: 'Your heroes are restless', body: 'Nobody has been on an expedition for a while. Send a team out?' },
  heroesRested: { title: 'Heroes rested', body: 'Your heroes are back to full health, ready for the next expedition.' },
  chestUnlocked: { title: 'Step chest unlocked', body: 'Your {chest} is ready to open.' },
  chestClose: { title: 'Almost there', body: 'Only {steps} more steps to your {chest}.' },
  dailyReset: { title: 'New day', body: 'New day, new step chests.' },
  walkSummary: { title: 'Auto-gather stopped', body: 'You walked {distance}. Open the game to see what you gathered.' },
  patrolSpotted: { title: '{patrol} spotted', body: '{patrol} {distance} away (tier {tier})' },
  travellerSpotted: { title: '{traveller} nearby', body: '{line}' },
  escortPaused: { title: 'Escort paused', body: '{hero} is at {percent}% HP.' },
  escortKnockedOut: { title: 'Escort knocked out', body: '{hero} needs rest.' },
  questTarget: { title: 'Quest: {place} reached', body: 'Open the game to finish your quest here.' },
  questMark: { title: 'The strange mark', body: 'You found it. Open the game to see what it hides.' },
  questTargets: { title: '{count} quest targets reached', body: 'Open the game to finish your quests there.' },
  questReady: { title: 'Quest complete', body: 'Your {objective} quest is done. Open the game to claim it.' },
  questsReady: { title: '{count} quests complete', body: 'Open the game to claim your rewards.' },
  questObjective: { walk: 'walking', patrols: 'patrol' },
  chestsUnlocked: { title: 'Step chests unlocked', body: '{chests} are ready to open.' },
  nearbyPlace: { title: '{place} nearby', body: '{distance} from your path.' },
  nearbyPlaces: { title: 'Places nearby', body: '{places}' },
  treasureSpot: 'Treasure spot',
  secretPlace: { title: 'A secret place is close', body: '{place}, {distance} away. You have a key.' },
};
