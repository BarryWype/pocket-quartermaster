import { recipeById } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { grantTutorialLoot, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { addMaterials } from '../inventory';
import { createInitialSave, type SaveData, type TutorialSpawn, type TutorialStep } from '../save';
import { equip, isAway } from '../team/team';
import type { MaterialStack, RecipeDef } from '../types';
import {
  advanceTutorial,
  finishTutorial,
  isTutorialDungeon,
  kitHeld,
  nextTutorialStep,
  tutorialLaunched,
  tutorialStepOrder,
} from './tutorial';
import { collectTutorialSpawn, placeTutorialSpawns, shownTutorialSpawns } from './spawns';

/** Crafts `recipe`, making up any material shortfall first so a skip never fails. */
const craftAnyway = (save: SaveData, recipe: RecipeDef): SaveData => {
  const missing = recipe.inputs
    .map((input) => ({ materialId: input.materialId, amount: input.amount - (save.materials[input.materialId] ?? 0) }))
    .filter((input) => input.amount > 0);
  return craft(missing.length > 0 ? { ...save, materials: addMaterials(save.materials, missing) } : save, recipe);
};

/**
 * Skips the tutorial from wherever it stands, paying out exactly what playing
 * it out would have: the nodes nobody picked up, the sword on the warrior, a
 * Hunter's pack if it was still owed, the tutorial expedition resolved at once
 * when under way, its loot otherwise, and the handover. Never anything twice.
 */
export function skipTutorial(save: SaveData, now: number): SaveData {
  if (save.tutorial.step === 'done') return save;

  // The pack is still owed only before its equip step, before the run, and while none is held.
  const packOwed =
    tutorialStepOrder.indexOf(save.tutorial.step) < tutorialStepOrder.indexOf('equipKit') &&
    !tutorialLaunched(save) &&
    !kitHeld(save);

  // An expedition still under way is collected now, its report lands like any other.
  const underWay = save.expeditions.find((e) => e.guaranteed && isTutorialDungeon(e.dungeonId));
  let next = underWay
    ? resolveExpedition(save, { ...underWay, endsAt: Math.min(underWay.endsAt, now) }).save
    : save;

  // Every node the steps planned and was never picked up, in one go.
  const picked = new Set(next.tutorial.spawns.filter((s) => s.collected).map((s) => s.id));
  const gains: MaterialStack[] = [];
  const spawns: TutorialSpawn[] = [...next.tutorial.spawns.filter((s) => s.collected)];
  for (const [step, materials] of Object.entries(tutorialRules.spawns)) {
    if (!materials) continue;
    materials.forEach((materialId, i) => {
      const id = `tutorial:${step}:${i}`;
      if (picked.has(id)) return;
      gains.push({ materialId, amount: 1 });
      const placed = next.tutorial.spawns.find((s) => s.id === id);
      spawns.push(placed ? { ...placed, collected: true } : { id, materialId, position: null, spawnedAt: now, collected: true });
    });
  }
  next = {
    ...next,
    materials: addMaterials(next.materials, gains),
    tutorial: { ...next.tutorial, spawns },
  };

  // The sword, forged if the step never got that far, then on the warrior.
  const warrior = (s: SaveData) => s.heroes.find((h) => h.classId === 'warrior');
  if (!next.gear.some((g) => g.itemId === tutorialRules.swordRecipe) && warrior(next)?.equipment.weapon == null) {
    next = craftAnyway(next, recipeById[tutorialRules.swordRecipe]);
  }
  const sword = next.gear.find((g) => g.itemId === tutorialRules.swordRecipe);
  const armed = warrior(next);
  if (sword && armed && armed.equipment.weapon == null && !isAway(next, armed.id)) {
    next = equip(next, armed.id, 'weapon', sword.uid);
  }

  if (packOwed) next = craftAnyway(next, recipeById[tutorialRules.kitRecipe]);

  if (!next.tutorial.rewarded) next = grantTutorialLoot(next, next.heroes.map((h) => h.id), now);
  return finishTutorial(next, now);
}

/**
 * Debug: the tutorial starts over. The step and its nodes reset to a fresh
 * save's and the first quest is dropped; items, gear and heroes are kept —
 * the reveal hides again on its own, since it waits for step 'done'.
 */
export function restartTutorial(save: SaveData): SaveData {
  return {
    ...save,
    tutorial: createInitialSave().tutorial,
    quests: { ...save.quests, list: save.quests.list.filter((q) => !q.id.startsWith('first|')) },
  };
}

/** Picks up the current step's nodes from wherever they are, then moves the tutorial on. */
const collectAll = (save: SaveData, now: number): SaveData => {
  let next = placeTutorialSpawns(save, null, undefined, now);
  for (const spawn of shownTutorialSpawns(next)) {
    const result = collectTutorialSpawn(next, spawn.id, null, now, { anywhere: true });
    if (result.ok) next = result.save;
  }
  return advanceTutorial(next);
};

/** Moves one step on without an action, for a step whose actor the save no longer has (e.g. a dismissed warrior). */
const stepPast = (save: SaveData): SaveData => ({
  ...save,
  tutorial: { ...save.tutorial, step: tutorialStepOrder[tutorialStepOrder.indexOf(save.tutorial.step) + 1] },
});

/**
 * Debug: moves the tutorial to `step`. The same or an earlier step restarts
 * first; a later one plays every step in between with the real functions, as
 * a player would — the nodes placed and collected from wherever, the sword
 * forged (any shortfall made up) and equipped on the warrior, the threat
 * closed, the Hunter's pack crafted and handed to the first hero at home, the
 * run sent with everyone home, resolved, the report closed. Steps whose goal
 * the kept items already meet are skipped by `advanceTutorial`. Never throws.
 */
export function jumpToStep(save: SaveData, step: TutorialStep, now: number): SaveData {
  let next = tutorialStepOrder.indexOf(step) <= tutorialStepOrder.indexOf(save.tutorial.step) ? restartTutorial(save) : save;
  for (;;) {
    next = advanceTutorial(next);
    if (next.tutorial.step === step || next.tutorial.step === 'done') return next;
    switch (next.tutorial.step) {
      case 'gatherWood':
      case 'gatherKit': {
        // Nodes already picked up whose materials went elsewhere: nothing left to gather, so move on.
        const gathered = collectAll(next, now);
        next = gathered.tutorial.step === next.tutorial.step ? stepPast(gathered) : gathered;
        break;
      }
      case 'forgeSword':
        next = advanceTutorial(craftAnyway(next, recipeById[tutorialRules.swordRecipe]));
        break;
      case 'equipSword': {
        const warrior = next.heroes.find((h) => h.classId === 'warrior');
        const sword = next.gear.find((g) => g.itemId === tutorialRules.swordRecipe);
        next =
          warrior && sword && warrior.equipment.weapon == null && !isAway(next, warrior.id)
            ? advanceTutorial(equip(next, warrior.id, 'weapon', sword.uid))
            : stepPast(next);
        break;
      }
      case 'seeThreat':
        next = nextTutorialStep(next, 'seeThreat', now);
        break;
      case 'craftKit':
        next = advanceTutorial(craftAnyway(next, recipeById[tutorialRules.kitRecipe]));
        break;
      case 'equipKit': {
        const hero = next.heroes.find((h) => !isAway(next, h.id));
        next = hero && hero.equipment.consumable == null ? advanceTutorial(equip(next, hero.id, 'consumable', tutorialRules.kitRecipe)) : stepPast(next);
        break;
      }
      case 'sendExpedition': {
        const party = next.heroes.filter((h) => !isAway(next, h.id)).map((h) => h.id);
        try {
          next = advanceTutorial(startExpedition(next, tutorialRules.dungeonId, party, now));
        } catch {
          next = stepPast(next);
        }
        break;
      }
      case 'awaitReport': {
        const underWay = next.expeditions.find((e) => e.guaranteed && isTutorialDungeon(e.dungeonId));
        next = underWay ? advanceTutorial(resolveExpedition(next, underWay).save) : stepPast(next);
        break;
      }
      case 'readReport':
        next = nextTutorialStep(next, 'readReport', now);
        break;
    }
  }
}
