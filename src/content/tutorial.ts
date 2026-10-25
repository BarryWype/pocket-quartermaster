import type { TutorialStep } from '@/game/save';
import type { MenuTarget, TutorialScreen } from '@/game/tutorial/tutorial';

export const tutorialRules = {
  /**
   * The first expedition: only this dungeon can be picked, it shows its real
   * odds, but it always succeeds, takes a few seconds and pays fixed rewards.
   */
  firstExpedition: {
    dungeonId: 'ratCellar',
    seconds: 5,
    gold: 10,
    recipeId: 'woodBow',
    materials: [{ materialId: 'mysteriousKey', amount: 1 }],
  },
};

/**
 * One short line per step. `default` shows on every screen without its own line;
 * steps without one only show where they name a screen.
 */
export const tutorialHints: Record<TutorialStep, Partial<Record<TutorialScreen | 'default', string>>> = {
  collectWood: {
    map: 'Tap the tree next to you to gather wood.',
  },
  forgeSword: {
    default: 'Open Craft → Forge to make a Wooden sword.',
    forge: 'Tap Forge to make your first Wooden sword.',
  },
  equipSword: {
    default: 'Open Team and give the sword to a hero.',
    team: 'Pick Bram, the warrior: swords suit him best.',
    hero: 'Tap Change next to Weapon and pick the sword.',
  },
  sendExpedition: {
    default: 'Open Expeditions and send your team out.',
    expeditions: 'Send the team to the Rat Cellar. This first trip only takes a few seconds.',
  },
  awaitReport: {
    map: 'Your team is away. Gather some animals and herbs while you wait.',
    expeditions: 'Tap the expedition under way to follow its progress.',
  },
  readReport: {
    default: 'Your heroes are back! Open Expeditions to read their report.',
    expeditions: 'Here’s their report: what happened, the loot and the XP earned.',
  },
  outro: {
    map: 'That’s the loop: gather, forge, equip, send. Beat the Bandit Stockade to earn a pickaxe and mine stone. Tap to close.',
  },
  done: {},
};

/** The menu button to highlight while a step waits for it. */
export const tutorialTargets: Partial<Record<TutorialStep, MenuTarget>> = {
  forgeSword: 'forge',
  equipSword: 'team',
  sendExpedition: 'expeditions',
  readReport: 'expeditions',
};
