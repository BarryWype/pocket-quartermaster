import { startingHeroes } from '@/content/heroes';
import { recipes } from '@/content/recipes';

import type { LatLng } from './generation/types';
import type { ActiveExpedition, ExpeditionReport, GearInstance, HeroState } from './types';

/** The first-session walkthrough, in order. Each step waits for one player action. */
export type TutorialStep =
  | 'collectWood'
  | 'forgeSword'
  | 'equipSword'
  | 'sendExpedition'
  | 'awaitReport'
  | 'readReport'
  | 'outro'
  | 'done';

export type SaveData = {
  gold: number;
  materials: Record<string, number>;
  consumables: Record<string, number>;
  gear: GearInstance[];
  /** Item ids of the tools the player owns, e.g. pickaxes. */
  tools: string[];
  knownRecipes: string[];
  heroes: HeroState[];
  expeditions: ActiveExpedition[];
  /** Finished expeditions, newest first. */
  reports: ExpeditionReport[];
  /** Dungeons won at least once. */
  clearedDungeons: string[];
  /** Spawn id → time the spawn expires; collected spawns stay hidden until then. */
  collected: Record<string, number>;
  tutorial: {
    step: TutorialStep;
    /** Where the guaranteed first wood node sits, set from the first GPS fix. */
    woodSpot: LatLng | null;
  };
  /** Steps counted while the app was open today (Android has no step history). */
  steps: { day: string; count: number };
  /** Chests opened on `day`. */
  chests: { day: string; opened: string[] };
  /** Counter for unique gear ids. */
  nextUid: number;
};

export function createInitialSave(): SaveData {
  return {
    gold: 0,
    materials: {},
    consumables: {},
    gear: [],
    tools: [],
    heroes: startingHeroes,
    expeditions: [],
    reports: [],
    clearedDungeons: [],
    knownRecipes: recipes.filter((r) => r.unlockedByDefault).map((r) => r.id),
    collected: {},
    tutorial: { step: 'collectWood', woodSpot: null },
    steps: { day: '', count: 0 },
    chests: { day: '', opened: [] },
    nextUid: 1,
  };
}
