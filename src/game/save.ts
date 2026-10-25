import { startingHeroes } from '@/content/heroes';
import { recipes } from '@/content/recipes';

import type { ActiveExpedition, ExpeditionReport, GearInstance, HeroState } from './types';

export type SaveData = {
  gold: number;
  materials: Record<string, number>;
  consumables: Record<string, number>;
  gear: GearInstance[];
  /** Item ids of owned tools such as pickaxes. */
  tools: string[];
  knownRecipes: string[];
  heroes: HeroState[];
  expeditions: ActiveExpedition[];
  /** Finished expeditions, newest first. */
  reports: ExpeditionReport[];
  /** Spawn id → time the spawn expires; collected spawns stay hidden until then. */
  collected: Record<string, number>;
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
    knownRecipes: recipes.filter((r) => r.unlockedByDefault).map((r) => r.id),
    collected: {},
    steps: { day: '', count: 0 },
    chests: { day: '', opened: [] },
    nextUid: 1,
  };
}
