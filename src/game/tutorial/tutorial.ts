import { recipeById } from '@/content/lookup';
import { tutorialHints, tutorialTargets } from '@/content/tutorial';

import { offsetPosition } from '../generation/geo';
import type { LatLng, StaticSpawn } from '../generation/types';
import type { SaveData, TutorialStep } from '../save';

export type TutorialScreen = 'map' | 'forge' | 'alchemy' | 'inventory' | 'team' | 'hero' | 'expeditions';
export type MenuTarget = 'forge' | 'team' | 'expeditions';

export const TUTORIAL_SPAWN_ID = 'tutorial:wood';
const FIRST_RECIPE = 'woodSword';

/** Steps during which only wood shows on the map; animals and herbs appear once the sword is forged. */
const WOOD_ONLY: TutorialStep[] = ['collectWood', 'forgeSword'];

/** Wood the first sword needs; the guaranteed node gives exactly this. */
const woodForFirstRecipe = () =>
  recipeById[FIRST_RECIPE].inputs.find((input) => input.materialId === 'wood')?.amount ?? 0;

export function limitsToWood(save: SaveData) {
  return WOOD_ONLY.includes(save.tutorial.step);
}

/** The tutorial's first expedition: short and certain to succeed. */
export function isTutorialExpedition(save: SaveData) {
  return save.tutorial.step === 'sendExpedition';
}

/** Pins the guaranteed first wood node about 10 m from the player's first position. */
export function placeTutorialWood(save: SaveData, position: LatLng): SaveData {
  if (save.tutorial.step !== 'collectWood' || save.tutorial.woodSpot) return save;
  return { ...save, tutorial: { ...save.tutorial, woodSpot: offsetPosition(position, 8, 6) } };
}

/** The guaranteed wood node, shown until it is picked up. */
export function tutorialSpawns(save: SaveData): StaticSpawn[] {
  const { step, woodSpot } = save.tutorial;
  if (step !== 'collectWood' || !woodSpot || TUTORIAL_SPAWN_ID in save.collected) return [];
  return [
    {
      id: TUTORIAL_SPAWN_ID,
      kind: 'wood',
      resourceId: 'tree',
      tile: 'tutorial',
      quantity: woodForFirstRecipe(),
      boosted: false,
      expiresAt: Number.MAX_SAFE_INTEGER,
      position: woodSpot,
    },
  ];
}

/** Whether a step's goal is met, so the tutorial can move past it. */
function isComplete(save: SaveData, step: TutorialStep): boolean {
  const hasSword = save.gear.some((g) => g.itemId === FIRST_RECIPE);
  const anyArmed = save.heroes.some((h) => h.equipment.weapon !== null);
  switch (step) {
    case 'collectWood':
      return (save.materials.wood ?? 0) >= woodForFirstRecipe() || hasSword || anyArmed;
    case 'forgeSword':
      return hasSword || anyArmed;
    case 'equipSword':
      return anyArmed;
    case 'sendExpedition':
      return save.expeditions.length > 0 || save.reports.length > 0;
    case 'awaitReport':
      return save.reports.length > 0;
    case 'readReport':
      return save.reports.some((r) => r.seen);
    default:
      // The outro waits for the player to close it.
      return false;
  }
}

const ORDER: TutorialStep[] = [
  'collectWood',
  'forgeSword',
  'equipSword',
  'sendExpedition',
  'awaitReport',
  'readReport',
  'outro',
  'done',
];

/** Moves past every step whose goal is already met. */
export function advanceTutorial(save: SaveData): SaveData {
  let step = save.tutorial.step;
  while (isComplete(save, step)) step = ORDER[ORDER.indexOf(step) + 1];
  return step === save.tutorial.step ? save : { ...save, tutorial: { ...save.tutorial, step } };
}

/** Closes the tutorial: from the outro, or from debug to skip it. */
export function finishTutorial(save: SaveData): SaveData {
  return { ...save, tutorial: { ...save.tutorial, step: 'done' } };
}

export function tutorialHint(save: SaveData, screen: TutorialScreen): string | null {
  const hints = tutorialHints[save.tutorial.step];
  return hints[screen] ?? hints.default ?? null;
}

export function tutorialTarget(save: SaveData): MenuTarget | null {
  return tutorialTargets[save.tutorial.step] ?? null;
}
