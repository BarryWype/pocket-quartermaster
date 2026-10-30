import { recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { readyExpeditions, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { canGather, collectSpawn } from '../gathering/gathering';
import { distanceMeters } from '../generation/geo';
import type { StaticSpawn } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import {
  advanceTutorial,
  nextTutorialStep,
  placeTutorialWood,
  TUTORIAL_SPAWN_ID,
  tutorialHint,
  tutorialSpawns,
  tutorialTarget,
} from './tutorial';

const player = { latitude: -41.2865, longitude: 174.7762 };
const now = 1_000_000;

const herbSpawn: StaticSpawn = {
  id: 'herb:x:1:0',
  kind: 'herb',
  resourceId: 'herb',
  tile: 'x',
  quantity: 1,
  boosted: false,
  expiresAt: now + 1,
  position: player,
};

function gatherTutorialWood(save: SaveData) {
  const placed = placeTutorialWood(save, player);
  const result = collectSpawn(placed, tutorialSpawns(placed)[0], { position: player, speed: 0 }, now);
  if (!result.ok) throw new Error(result.reason);
  return advanceTutorial(result.save);
}

describe('tutorial wood', () => {
  it('places the guaranteed wood about 10 m away, once', () => {
    const save = placeTutorialWood(createInitialSave(), player);
    const spot = save.tutorial.woodSpot!;
    expect(distanceMeters(player, spot)).toBeLessThan(20);
    const moved = { latitude: player.latitude + 0.01, longitude: player.longitude };
    expect(placeTutorialWood(save, moved).tutorial.woodSpot).toEqual(spot);
  });

  it('gives exactly the wood for the first sword, then disappears', () => {
    expect(tutorialSpawns(createInitialSave())).toEqual([]);
    const save = gatherTutorialWood(createInitialSave());
    expect(save.materials.wood).toBe(recipeById.sword1.inputs[0].amount);
    expect(save.collected).toHaveProperty(TUTORIAL_SPAWN_ID);
    expect(tutorialSpawns(save)).toEqual([]);
  });

  it('waits until there is enough wood for the sword', () => {
    const save = { ...createInitialSave(), materials: { wood: 2 } };
    expect(advanceTutorial(save).tutorial.step).toBe('collectWood');
  });
});

describe('tutorial walkthrough', () => {
  it('goes gather → forge → equip → send → wait → read → Sanctum → outro → done', () => {
    let save = gatherTutorialWood(createInitialSave());
    expect(save.tutorial.step).toBe('forgeSword');
    expect(tutorialTarget(save)).toBe('forge');

    save = advanceTutorial(craft(save, recipeById.sword1));
    expect(save.tutorial.step).toBe('equipSword');
    expect(tutorialTarget(save)).toBe('team');

    save = advanceTutorial(equip(save, 'bram', 'weapon', save.gear[0].uid));
    expect(save.tutorial.step).toBe('sendExpedition');
    expect(tutorialTarget(save)).toBe('expeditions');

    save = advanceTutorial(startExpedition(save, 'ratCellar', ['bram', 'lyra', 'mira'], now));
    expect(save.tutorial.step).toBe('awaitReport');
    expect(save.expeditions[0].endsAt).toBe(now + 5000);

    // Back after 5 seconds, waiting for the player to collect the loot.
    expect(readyExpeditions(save, now + 5000)).toHaveLength(1);
    expect(advanceTutorial(save).tutorial.step).toBe('awaitReport');
    const { save: back, report } = resolveExpedition(save, save.expeditions[0]);
    expect(report.success).toBe(true);
    expect(report.sigil).toBe(1);
    expect(back.sigils).toEqual([1]);
    expect(back.firstSigilGiven).toBe(false);
    save = advanceTutorial(back);
    expect(save.tutorial.step).toBe('readReport');

    save = advanceTutorial({ ...save, reports: save.reports.map((r) => ({ ...r, seen: true })) });
    expect(save.tutorial.step).toBe('findSanctum');
    expect(tutorialHint(save, 'map')).toMatch(/Lucky/);
    expect(nextTutorialStep(save, 'outro')).toBe(save);

    save = nextTutorialStep(save, 'findSanctum');
    expect(save.tutorial.step).toBe('sanctumIntro');
    expect(tutorialHint(save, 'sanctum')).toMatch(/Tap to close/);
    expect(tutorialHint(save, 'map')).toBeNull();

    save = nextTutorialStep(save, 'sanctumIntro');
    expect(save.tutorial.step).toBe('outro');
    expect(tutorialHint(save, 'map')).toMatch(/Tap to close/);

    save = nextTutorialStep(save, 'outro');
    expect(save.tutorial.step).toBe('done');
    expect(tutorialHint(save, 'map')).toBeNull();
  });

  it('shows only wood until the sword is forged', () => {
    const fresh = createInitialSave();
    expect(canGather(fresh, herbSpawn)).toBe(false);
    expect(canGather({ ...fresh, tutorial: { step: 'forgeSword', woodSpot: null } }, herbSpawn)).toBe(false);
    expect(canGather({ ...fresh, tutorial: { step: 'equipSword', woodSpot: null } }, herbSpawn)).toBe(true);
  });

  it('skips steps the player already did out of order', () => {
    const save: SaveData = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'sword1', quality: 'normal' }],
    };
    expect(advanceTutorial(save).tutorial.step).toBe('equipSword');
  });

  it('gives each screen its own hint where it has one', () => {
    const save = { ...createInitialSave(), tutorial: { step: 'equipSword' as const, woodSpot: null } };
    expect(tutorialHint(save, 'hero')).toMatch(/Weapon slot/);
    expect(tutorialHint(save, 'map')).toMatch(/Team/);
    expect(tutorialHint(createInitialSave(), 'forge')).toBeNull();
  });
});
