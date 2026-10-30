import { recipeById } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { createInitialSave, type SaveData, type TutorialStep } from '../save';
import { equip } from '../team/team';
import { skipTutorial, restartTutorial, jumpToStep } from './skip';
import { collectTutorialSpawn, placeTutorialSpawns, shownTutorialSpawns } from './spawns';
import { advanceTutorial, nextTutorialStep } from './tutorial';

const player = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;
const at = now + 60_000;

const swordGear = (save: SaveData) => save.gear.filter((g) => g.itemId === tutorialRules.swordRecipe);
const bram = (save: SaveData) => save.heroes.find((h) => h.id === 'bram')!;
const kitAnywhere = (save: SaveData) =>
  (save.consumables[tutorialRules.kitRecipe] ?? 0) > 0 ||
  save.heroes.some((h) => h.equipment.consumable === tutorialRules.kitRecipe);

/** Picks up the current step's nodes standing on them. */
function gatherStep(save: SaveData, at: number) {
  let next = placeTutorialSpawns(save, player, null, at);
  for (const spawn of shownTutorialSpawns(next)) {
    const result = collectTutorialSpawn(next, spawn.id, player, at);
    if (!result.ok) throw new Error(result.reason);
    next = result.save;
  }
  return advanceTutorial(next);
}

/** Plays the tutorial up to `step` with the real functions. */
function playTo(step: TutorialStep): SaveData {
  let save = placeTutorialSpawns(createInitialSave(), player, null, now);
  if (step === 'gatherWood') return save;
  save = gatherStep(save, now);
  if (step === 'forgeSword') return save;
  save = advanceTutorial(craft(save, recipeById.sword1));
  if (step === 'equipSword') return save;
  save = advanceTutorial(equip(save, 'bram', 'weapon', swordGear(save)[0].uid));
  if (step === 'seeThreat') return save;
  save = nextTutorialStep(save, 'seeThreat', now);
  if (step === 'gatherKit') return save;
  save = gatherStep(save, now + 1);
  if (step === 'craftKit') return save;
  save = advanceTutorial(craft(save, recipeById.huntersPack));
  if (step === 'equipKit') return save;
  save = advanceTutorial(equip(save, 'bram', 'consumable', tutorialRules.kitRecipe));
  if (step === 'sendExpedition') return save;
  save = advanceTutorial(startExpedition(save, tutorialRules.dungeonId, ['bram', 'lyra', 'mira'], now));
  if (step === 'awaitReport') return save;
  return advanceTutorial(resolveExpedition(save, save.expeditions[0]).save);
}

/** Plays the rest of the tutorial from `save` to done. */
function playThrough(save: SaveData): SaveData {
  let next = save;
  while (next.tutorial.step !== 'done') {
    switch (next.tutorial.step) {
      case 'gatherWood':
      case 'gatherKit':
        next = gatherStep(next, now + 2);
        break;
      case 'forgeSword':
        next = advanceTutorial(craft(next, recipeById.sword1));
        break;
      case 'equipSword':
        next = advanceTutorial(equip(next, 'bram', 'weapon', swordGear(next)[0].uid));
        break;
      case 'seeThreat':
        next = nextTutorialStep(next, 'seeThreat', now + 2);
        break;
      case 'craftKit':
        next = advanceTutorial(craft(next, recipeById.huntersPack));
        break;
      case 'equipKit':
        next = advanceTutorial(equip(next, 'bram', 'consumable', tutorialRules.kitRecipe));
        break;
      case 'sendExpedition':
        next = advanceTutorial(startExpedition(next, tutorialRules.dungeonId, ['bram', 'lyra', 'mira'], now + 2));
        break;
      case 'awaitReport':
        next = advanceTutorial(resolveExpedition(next, next.expeditions[0]).save);
        break;
      case 'readReport':
        next = nextTutorialStep(next, 'readReport', now + 2);
        break;
    }
  }
  return next;
}

const STEPS: TutorialStep[] = [
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
];

describe('skipping the tutorial', () => {
  it.each(STEPS)('from %s gives what playing it out would', (step) => {
    const before = playTo(step);
    const skipped = skipTutorial(before, at);

    expect(skipped.tutorial.step).toBe('done');
    expect(swordGear(skipped)).toHaveLength(1);
    expect(bram(skipped).equipment.weapon).toBe(swordGear(skipped)[0].uid);

    // The Hunter's pack: crafted by the skip before its equip step, held or carried around it, spent by the run after.
    if (STEPS.indexOf(step) < STEPS.indexOf('equipKit')) {
      expect(skipped.consumables[tutorialRules.kitRecipe]).toBe(1);
    } else if (step === 'equipKit' || step === 'sendExpedition') {
      expect(kitAnywhere(skipped)).toBe(true);
    } else {
      expect(kitAnywhere(skipped)).toBe(false);
    }

    expect(skipped.tutorial.rewarded).toBe(true);
    expect(skipped.firstWinDay).not.toBeNull();
    expect(new Set(skipped.knownRecipes).size).toBe(skipped.knownRecipes.length);
    expect(skipped.quests.list.filter((q) => q.id.startsWith('first|'))).toHaveLength(1);

    // The leftovers match a tutorial played through from the same point.
    const played = playThrough(before);
    expect(skipped.materials).toEqual(played.materials);
    expect(skipped.knownRecipes).toEqual(played.knownRecipes);
    expect(skipped.gear).toHaveLength(played.gear.length);
  });

  it('gives nothing on a second skip', () => {
    const skipped = skipTutorial(playTo('gatherWood'), at);
    const again = skipTutorial(skipped, at + 1);
    expect(again).toBe(skipped);
    expect(again.materials).toEqual(skipped.materials);
    expect(again.gear).toHaveLength(skipped.gear.length);
    expect(again.consumables).toEqual(skipped.consumables);
    expect(again.knownRecipes).toEqual(skipped.knownRecipes);
    expect(again.quests.list).toEqual(skipped.quests.list);
  });

  it('resolves a tutorial expedition under way, once', () => {
    const skipped = skipTutorial(playTo('awaitReport'), at);
    expect(skipped.expeditions).toHaveLength(0);
    expect(skipped.reports).toHaveLength(1);
    expect(skipped.reports[0].success).toBe(true);
    expect(skipped.tutorial.rewarded).toBe(true);
  });

  it('pays the same loot as a played run', () => {
    expect(skipTutorial(playTo('gatherWood'), at).knownRecipes).toEqual(playThrough(playTo('gatherWood')).knownRecipes);
  });

  it('leaves a done tutorial alone', () => {
    const done = playThrough(playTo('readReport'));
    expect(skipTutorial(done, at)).toBe(done);
  });
});

describe('debug tutorial tools', () => {
  it('restarting from done gives the fresh tutorial back, keeping the sword', () => {
    const restarted = restartTutorial(playThrough(playTo('gatherWood')));
    expect(restarted.tutorial.step).toBe('gatherWood');
    expect(restarted.tutorial.spawns).toEqual([]);
    expect(restarted.tutorial.rewarded).toBe(false);
    expect(restarted.quests.list.filter((q) => q.id.startsWith('first|'))).toHaveLength(0);
    expect(swordGear(restarted)).toHaveLength(1);
  });

  it.each([...STEPS, 'done'] as TutorialStep[])('jumps to %s and lands on it', (step) => {
    expect(jumpToStep(playTo('gatherWood'), step, at).tutorial.step).toBe(step);
  });

  it('jumping to an earlier step restarts the tutorial first', () => {
    const base = playTo('craftKit');
    const jumped = jumpToStep(base, 'gatherKit', at);
    // The kept wood, sword and pack meet the earlier goals, so the play runs on to done.
    expect(jumped.tutorial.step).toBe('done');
    expect(swordGear(jumped)).toHaveLength(1);
    expect(jumped.quests.list.filter((q) => q.id.startsWith('first|'))).toHaveLength(1);
    expect(jumped).toEqual(jumpToStep(restartTutorial(base), 'gatherKit', at));
  });

  it('jumping to done matches a tutorial played through', () => {
    const base = playTo('gatherWood');
    const jumped = jumpToStep(base, 'done', at);
    const played = playThrough(base);
    expect(jumped.materials).toEqual(played.materials);
    expect(jumped.gear).toHaveLength(played.gear.length);
    expect(jumped.knownRecipes).toEqual(played.knownRecipes);
    expect(jumped.tutorial.rewarded).toBe(true);
  });
});
