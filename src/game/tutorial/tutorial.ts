import { recipeById } from '@/content/lookup';
import { frTutorialHints } from '@/content/fr/tutorial';
import { tutorialHints, tutorialRules, tutorialTargets } from '@/content/tutorial';
import { localized } from '@/i18n/locale';

import { createRng } from '../generation/rng';
import { newQuest } from '../quests/arrival';
import type { SaveData, TutorialStep } from '../save';

export type TutorialScreen = 'map' | 'forge' | 'provisions' | 'inventory' | 'team' | 'hero' | 'expeditions';
export type MenuTarget = 'forge' | 'provisions' | 'team' | 'expeditions';

/** The dungeon the tutorial's expedition goes to. */
export const isTutorialDungeon = (dungeonId: string) => dungeonId === tutorialRules.dungeonId;

/** Wood the first sword needs; the gathering step spawns exactly this much. */
const woodForFirstRecipe = () =>
  recipeById[tutorialRules.swordRecipe].inputs.find((input) => input.materialId === 'wood')?.amount ?? 0;

/** The warrior the sword goes to. */
const warrior = (save: SaveData) => save.heroes.find((h) => h.classId === 'warrior');

/** A Hunter's pack held in the stock or carried by any hero. */
export const kitHeld = (save: SaveData) =>
  (save.consumables[tutorialRules.kitRecipe] ?? 0) > 0 ||
  save.heroes.some((h) => h.equipment.consumable === tutorialRules.kitRecipe);

/** The tutorial expedition has been sent, or its loot has already been given. */
export function tutorialLaunched(save: SaveData) {
  return (
    save.tutorial.rewarded || save.expeditions.some((e) => e.guaranteed && isTutorialDungeon(e.dungeonId))
  );
}

/**
 * The tutorial's first expedition: until it is launched, the tutorial dungeon
 * is the one to send and takes seconds.
 */
export function isTutorialExpedition(save: SaveData) {
  return save.tutorial.step !== 'done' && !tutorialLaunched(save);
}

/** Whether a step's goal is met, so the tutorial can move past it. */
function isComplete(save: SaveData, step: TutorialStep): boolean {
  const hasSword = save.gear.some((g) => g.itemId === tutorialRules.swordRecipe);
  const armed = warrior(save)?.equipment.weapon != null;
  // Everything before the send is moot once the expedition is out.
  const launched = tutorialLaunched(save);
  switch (step) {
    case 'gatherWood':
      return launched || (save.materials.wood ?? 0) >= woodForFirstRecipe() || hasSword || armed;
    case 'forgeSword':
      return launched || hasSword || armed;
    case 'equipSword':
      return launched || armed;
    case 'seeThreat':
      return false;
    case 'gatherKit':
      return (
        launched ||
        kitHeld(save) ||
        (['meat', 'hide', 'bone'] as const).every((id) => (save.materials[id] ?? 0) >= 1)
      );
    case 'craftKit':
      return launched || kitHeld(save);
    case 'equipKit':
      return launched || save.heroes.some((h) => h.equipment.consumable === tutorialRules.kitRecipe);
    case 'sendExpedition':
      return launched;
    case 'awaitReport':
      return save.tutorial.rewarded;
    case 'readReport':
      return false;
    default:
      return false;
  }
}

/** The tutorial's steps, in the order they play. */
export const tutorialStepOrder: TutorialStep[] = [
  'gatherWood',
  'forgeSword',
  'equipSword',
  'seeThreat',
  'gatherKit',
  'craftKit',
  'equipKit',
  'sendExpedition',
  'awaitReport',
  'readReport',
  'done',
];

/** Moves past every step whose goal is already met. */
export function advanceTutorial(save: SaveData): SaveData {
  let step = save.tutorial.step;
  while (isComplete(save, step)) step = tutorialStepOrder[tutorialStepOrder.indexOf(step) + 1];
  return step === save.tutorial.step ? save : { ...save, tutorial: { ...save.tutorial, step } };
}

/** Steps whose hint waits for a tap to close. */
const CLOSABLE: TutorialStep[] = ['seeThreat', 'readReport'];

export function isClosableHint(save: SaveData) {
  return CLOSABLE.includes(save.tutorial.step);
}

/** Moves on from `step` if it is the current one: a threat card or a report closed. */
export function nextTutorialStep(save: SaveData, step: TutorialStep, now: number): SaveData {
  if (save.tutorial.step !== step || step === 'done') return save;
  if (step === 'readReport') return finishTutorial(save, now);
  return { ...save, tutorial: { ...save.tutorial, step: tutorialStepOrder[tutorialStepOrder.indexOf(step) + 1] } };
}

/** Ends the tutorial and hands over: the first quest points at the nearest place. */
export function finishTutorial(save: SaveData, now: number): SaveData {
  const done: SaveData = { ...save, tutorial: { ...save.tutorial, step: 'done' } };
  if (save.quests.list.some((q) => q.id.startsWith('first|'))) return done;
  const quest = { ...newQuest(`first|${now}`, 'short', 'visit', save, createRng('first'), now), acceptedAt: now };
  return { ...done, quests: { ...done.quests, list: [...done.quests.list, quest] } };
}

export function tutorialHint(save: SaveData, screen: TutorialScreen): string | null {
  const hints = localized({ en: tutorialHints, fr: frTutorialHints })[save.tutorial.step];
  return hints[screen] ?? hints.default ?? null;
}

export function tutorialTarget(save: SaveData): MenuTarget | null {
  return tutorialTargets[save.tutorial.step] ?? null;
}
