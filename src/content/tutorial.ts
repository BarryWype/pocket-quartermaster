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
    recipeId: 'leather1',
    /** A lucky Sigil, so the player meets Sanctums early. It doesn't count as the Bandit Stockade's guaranteed one. */
    sigilTier: 1,
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
    hero: 'Tap the Weapon slot and pick the sword.',
  },
  sendExpedition: {
    default: 'Open Quests and send your team out.',
    expeditions: 'Send the team to the Rat Cellar. This first trip only takes a few seconds.',
  },
  awaitReport: {
    map: 'Your team is away. Gather some animals and herbs while you wait, then collect their loot in Quests.',
    expeditions: 'Your team is under way: the bar shows how far they’ve got. When they’re back, tap Collect loot.',
  },
  readReport: {
    default: 'Your heroes are back! Open Quests to read their report.',
    expeditions: 'Their report is in the Reports tab: what happened, the loot and the XP earned.',
  },
  findSanctum: {
    default: 'Explore the map for a Sanctum to use your Sigil.',
    map: 'Lucky you: the Rat Cellar gave a Sanctum Sigil! Most expeditions don’t bring one back. Look around for a Sanctum (zoom out to see farther) and tap it.',
  },
  sanctumIntro: {
    sanctum:
      'Sanctums are elemental shrines with a guardian. Walk within 50 m and spend a Sigil to challenge it with heroes at home: one try, win or lose. A win gives elemental shards to infuse your gear. Guardians are tough: you can come back once your team is stronger. Tap to close.',
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
  awaitReport: 'expeditions',
  readReport: 'expeditions',
};
