import { recipeById } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { grantTutorialLoot, resolveExpedition } from '../expeditions/expeditions';
import { addMaterials } from '../inventory';
import type { SaveData, TutorialSpawn } from '../save';
import { equip, isAway } from '../team/team';
import type { MaterialStack, RecipeDef } from '../types';
import { finishTutorial, isTutorialDungeon, kitHeld, tutorialLaunched, tutorialStepOrder } from './tutorial';

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
