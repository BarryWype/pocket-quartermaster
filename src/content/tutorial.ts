import type { TutorialStep } from '@/game/save';
import type { Briefing } from '@/game/types';
import type { MenuTarget, TutorialScreen } from '@/game/tutorial/tutorial';

export const tutorialRules = {
  dungeonId: 'ratCellar',
  seconds: 5,
  /** The tutorial expedition's only threat. */
  briefing: { threats: [{ id: 'beasts', level: 1 }], restriction: null, opportunity: null } satisfies Briefing,
  swordRecipe: 'sword1',
  kitRecipe: 'huntersPack',
  /** Nodes spawned at the start of each gathering step, one material each. */
  spawns: { gatherWood: ['wood', 'wood', 'wood', 'wood'], gatherKit: ['meat', 'hide', 'bone'] } as Partial<
    Record<TutorialStep, string[]>
  >,
  spawnMeters: [15, 30] as [number, number],
  spacingMeters: 8,
  /** Random spots tried per node before taking one off the walkable map. */
  spawnTries: 40,
  /** The map zooms out to this when the tutorial ends. */
  doneZoom: 16,
  /** The first-win roll is seeded with this, so the run and the skip give the same loot. */
  lootSeed: 'tutorial',
};

/**
 * One short line per step. `default` shows on every screen without its own line;
 * steps without one only show where they name a screen.
 */
export const tutorialHints: Record<TutorialStep, Partial<Record<TutorialScreen | 'default', string>>> = {
  gatherWood: {
    map: 'Walk to the trees around you and tap them to gather 4 wood.',
  },
  forgeSword: {
    default: 'Open Craft → Forge.',
    forge: 'Forge a Wooden sword: you start knowing its blueprint.',
  },
  equipSword: {
    default: 'Open Team.',
    team: 'Bram, warrior: holds the front line. Lyra, ranger: quick and precise. Mira, fire mage: burns whole groups. Give the sword to Bram.',
    hero: 'Tap the Weapon slot and pick the sword.',
  },
  seeThreat: {
    default: 'Open Expeditions.',
    expeditions: 'This expedition faces Beasts. Red: no hero answers it yet. Tap to continue.',
  },
  gatherKit: {
    default: 'Back to the map: gather the meat, hide and bone around you.',
    map: 'A Hunter’s pack answers Beasts. Gather the meat, hide and bone around you.',
  },
  craftKit: {
    default: 'Open Craft → Provisions.',
    provisions: 'Craft a Hunter’s pack.',
  },
  equipKit: {
    default: 'Open Expeditions.',
    expeditions: 'Open the Rat Cellar and give the Hunter’s pack to a hero: the threat turns green.',
  },
  sendExpedition: {
    default: 'Open Expeditions.',
    expeditions: 'Send the team. Most expeditions take 15–45 minutes; this one takes a few seconds.',
  },
  awaitReport: {
    default: 'Your team is on its way. Open Expeditions.',
    expeditions: 'Your team is on its way. Tap Collect loot when they’re back.',
  },
  readReport: {
    default: 'Open Expeditions to read the report.',
    expeditions: 'Expeditions are where new blueprints come from: the first win of each day always brings one. Tap to close.',
  },
  done: {},
};

/** The menu button to highlight while a step waits for it. */
export const tutorialTargets: Partial<Record<TutorialStep, MenuTarget>> = {
  forgeSword: 'forge',
  equipSword: 'team',
  seeThreat: 'expeditions',
  craftKit: 'provisions',
  equipKit: 'expeditions',
  sendExpedition: 'expeditions',
  awaitReport: 'expeditions',
  readReport: 'expeditions',
};
