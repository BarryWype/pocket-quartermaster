import { tutorialRules } from '@/content/tutorial';
import { recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { resolveExpedition, startExpedition, tutorialLoot } from '../expeditions/expeditions';
import { rotationDay } from '../dungeons/rotation';
import { offsetPosition } from '../generation/geo';
import { briefingCoverage } from '../threats/coverage';
import type { PlaceSpawn } from '../places/generate';
import { targetFirstQuest } from '../quests/targets';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { collectTutorialSpawn, placeTutorialSpawns, shownTutorialSpawns } from './spawns';
import {
  advanceTutorial,
  finishTutorial,
  isClosableHint,
  nextTutorialStep,
  tutorialHint,
  tutorialTarget,
} from './tutorial';

const player = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;

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

describe('tutorial walkthrough', () => {
  it('goes gather → forge → equip → threat → kit → send → report → done', () => {
    let save = gatherStep(createInitialSave(), now);
    expect(save.materials.wood).toBe(4);
    expect(save.tutorial.step).toBe('forgeSword');
    expect(tutorialTarget(save)).toBe('forge');

    save = advanceTutorial(craft(save, recipeById.sword1));
    expect(save.tutorial.step).toBe('equipSword');
    expect(tutorialTarget(save)).toBe('team');
    expect(tutorialHint(save, 'team')).toMatch(/Bram/);

    save = advanceTutorial(equip(save, 'bram', 'weapon', save.gear[0].uid));
    expect(save.tutorial.step).toBe('seeThreat');
    expect(isClosableHint(save)).toBe(true);
    expect(tutorialHint(save, 'expeditions')).toMatch(/Beasts/);
    expect(tutorialTarget(save)).toBe('expeditions');

    save = nextTutorialStep(save, 'seeThreat', now);
    expect(save.tutorial.step).toBe('gatherKit');
    expect(tutorialHint(save, 'map')).toMatch(/Hunter/);

    save = gatherStep(save, now + 1);
    expect(save.tutorial.step).toBe('craftKit');
    expect(tutorialTarget(save)).toBe('provisions');

    save = advanceTutorial(craft(save, recipeById.huntersPack));
    expect(save.tutorial.step).toBe('equipKit');

    save = advanceTutorial(equip(save, 'bram', 'consumable', tutorialRules.kitRecipe));
    expect(save.tutorial.step).toBe('sendExpedition');

    save = advanceTutorial(startExpedition(save, tutorialRules.dungeonId, ['bram', 'lyra', 'mira'], now));
    expect(save.tutorial.step).toBe('awaitReport');
    expect(save.expeditions[0].endsAt - now).toBe(tutorialRules.seconds * 1000);

    const endsAt = save.expeditions[0].endsAt;
    const { save: back, report } = resolveExpedition(save, save.expeditions[0]);
    expect(report.success).toBe(true);
    expect(report.firstWin).toBe(true);
    expect(back.firstWinDay).toBe(rotationDay(endsAt));
    expect(back.tutorial.rewarded).toBe(true);
    save = advanceTutorial(back);
    expect(save.tutorial.step).toBe('readReport');
    expect(isClosableHint(save)).toBe(true);

    save = nextTutorialStep(save, 'readReport', now);
    expect(save.tutorial.step).toBe('done');
    expect(tutorialHint(save, 'map')).toBeNull();
    const quest = save.quests.list[0];
    expect(quest).toMatchObject({ objective: 'visit', band: 'short', acceptedAt: now });
  });

  it('skips steps the player already did out of order', () => {
    const save: SaveData = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'sword1', quality: 'normal' }],
    };
    expect(advanceTutorial(save).tutorial.step).toBe('equipSword');
  });
});

describe('the tutorial threat', () => {
  it('reads red until a Hunter’s pack covers it', () => {
    const save = createInitialSave();
    const party = ['bram', 'lyra', 'mira'];
    const uncovered = briefingCoverage(save, party, tutorialRules.briefing);
    expect(uncovered.threats[0].threat.id).toBe('beasts');
    // A level-1 keyword threat reads gold (partial) with nobody answering it.
    expect(uncovered.threats[0].display).toBe('partial');
    const kitted = equip({ ...save, consumables: { ...save.consumables, huntersPack: 1 } }, 'bram', 'consumable', 'huntersPack');
    expect(briefingCoverage(kitted, party, tutorialRules.briefing).threats[0].display).toBe('covered');
  });
});

describe('the tutorial expedition', () => {
  const ready = (): SaveData => ({
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'sendExpedition' },
  });

  it('always wins and pays the same first-win loot whatever the party', () => {
    for (let i = 0; i < 10; i++) {
      const started = startExpedition({ ...ready(), nextUid: i }, tutorialRules.dungeonId, ['bram'], now);
      const expedition = started.expeditions[0];
      const { save, report } = resolveExpedition(started, expedition);
      expect(report.success).toBe(true);
      expect(report.firstWin).toBe(true);
      expect(save.firstWinDay).toBe(rotationDay(expedition.endsAt));
      expect(save.tutorial.rewarded).toBe(true);
      expect(report.loot).toEqual(tutorialLoot(ready(), expedition.endsAt));
      expect(report.loot.recipeIds).toHaveLength(1);
      expect(['sword1', 'mail1']).not.toContain(report.loot.recipeIds[0]);
    }
    const resolve = (heroIds: string[]) => {
      const started = startExpedition(ready(), tutorialRules.dungeonId, heroIds, now);
      return resolveExpedition(started, started.expeditions[0]).report.loot;
    };
    expect(resolve(['bram', 'lyra', 'mira'])).toEqual(resolve(['bram']));
  });
});

describe('the first quest', () => {
  const place = (id: string, kind: PlaceSpawn['kind'], meters: number): PlaceSpawn => ({
    id,
    kind,
    group: 'g',
    tile: 't',
    position: offsetPosition(player, 0, meters),
    startsAt: 0,
    expiresAt: now + 1_000_000,
    roll: 0,
  });

  it('is added once, accepted, short', () => {
    const save = finishTutorial(createInitialSave(), now);
    expect(save.tutorial.step).toBe('done');
    expect(save.quests.list).toHaveLength(1);
    expect(save.quests.list[0]).toMatchObject({ objective: 'visit', band: 'short', acceptedAt: now });
    expect(finishTutorial(save, now + 1).quests.list).toHaveLength(1);
  });

  it('targets the nearest revealed place, falls back to a farther band', () => {
    const save = finishTutorial(createInitialSave(), now);
    const near = place('p1', 'market', 200);
    const far = place('p2', 'smithy', 1200);
    const hidden = place('p3', 'ruins', 100);
    expect(targetFirstQuest(save, [], player, now)).toBe(save);
    expect(targetFirstQuest(save, [hidden], player, now)).toBe(save);
    const targeted = targetFirstQuest(save, [far, near, hidden], player, now);
    expect(targeted.quests.list[0].target).toMatchObject({ placeId: 'p1', kind: 'market' });
    expect(targeted.quests.list[0].band).toBe('short');
    const fallback = targetFirstQuest(save, [far], player, now);
    expect(fallback.quests.list[0].target).toMatchObject({ placeId: 'p2', kind: 'smithy' });
    expect(fallback.quests.list[0].band).toBe('long');
  });
});
