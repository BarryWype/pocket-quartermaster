import { recipeById } from '@/content/lookup';
import { relics } from '@/content/loot/relics';
import { secretRules } from '@/content/secrets';
import { trinketId } from '@/content/trinkets';
import { useGameStore } from '@/store/gameStore';

import { craft } from '../crafting/crafting';
import { forgeWithComponent } from '../forging/components';
import { relicRecipe, restoreRelic } from '../forging/relics';
import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import type { LatLng } from '../generation/types';
import { createRng } from '../generation/rng';
import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import { resolveHeists, startHeist } from '../places/heists';
import { resolvePlaceFights, startPlaceFight } from '../places/fights';
import type { PlaceSpawn } from '../places/generate';
import { buy, placeStock } from '../places/shops';
import { resolvePatrolFights, startPatrolFight } from '../patrols/fight';
import type { PatrolSpawn } from '../patrols/generate';
import { challengeSanctum } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '@/game/save';
import { secretPrize } from '../secrets/prize';
import { blackMarketGoods, buyAtBlackMarket, enterSecret } from '../secrets/places';
import { secretPlaceId } from '../secrets/tips';
import { healAll } from '../team/health';
import { equip } from '../team/team';
import { restartTutorial, jumpToStep, skipTutorial } from '../tutorial/skip';

const ALL = ['bram', 'lyra', 'mira'];
const POSITION: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const NOW = 1_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The values that appear twice, so a failure names the colliding uid. */
const duplicated = (values: string[]) => [...new Set(values.filter((value, i) => values.indexOf(value) !== i))];

function expectUniqueIds(save: SaveData) {
  for (const piece of save.gear) {
    expect(typeof piece.uid).toBe('string');
    expect(piece.uid.length).toBeGreaterThan(0);
  }
  expect(duplicated(save.gear.map((piece) => piece.uid))).toEqual([]);
  expect(duplicated(save.relics.map((relic) => relic.uid))).toEqual([]);
  expect(duplicated(save.heroes.map((hero) => hero.id))).toEqual([]);
}

/** Forges a Wooden sword, topping the materials up first so the step never fails. */
const craftSword = (save: SaveData): SaveData => {
  const materials = { ...save.materials };
  for (const { materialId, amount } of recipeById.sword1.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
  return craft({ ...save, materials }, recipeById.sword1);
};

/** Forges a Wooden sword with a dragon claw, topping the recipe and the claw up first. */
const forgeSwordWithClaw = (save: SaveData): SaveData => {
  const materials: Record<string, number> = { ...save.materials, dragonClaw: (save.materials.dragonClaw ?? 0) + 1 };
  for (const { materialId, amount } of recipeById.sword1.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
  return forgeWithComponent({ ...save, materials }, recipeById.sword1, 'dragonClaw');
};

const spawnOf = (kind: PlaceSpawn['kind'], suffix: string): PlaceSpawn => ({
  id: `place:${kind}:tile:${suffix}`,
  kind,
  group: kind,
  tile: 'tile',
  position: POSITION,
  startsAt: 0,
  expiresAt: NOW + 1_000_000,
  roll: 0,
});

/** A save with the tutorial done and a veteran party, ready for expeditions and place fights. */
const veteran = (): SaveData => {
  let save: SaveData = {
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g2', itemId: 'bow1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g3', itemId: 'wand1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g4', itemId: 'mail1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ],
    heroes: createInitialSave().heroes.map((hero) => ({ ...hero, level: 15 })),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  return equip(save, 'bram', 'armor', 'g4');
};

describe('unique uids', () => {
  it('crafting and forging with a component give every piece a fresh uid', () => {
    let save = createInitialSave();
    for (let i = 0; i < 5; i++) {
      save = craftSword(save);
      expectUniqueIds(save);
      save = forgeSwordWithClaw(save);
      expectUniqueIds(save);
    }
  });

  it('restoring relics gives every piece a fresh uid', () => {
    let save = createInitialSave();
    for (let i = 0; i < 8; i++) {
      const relic = relics[i % relics.length];
      save = grantLoot(save, [], { ...emptyLoot(), relics: [relic.id] }, NOW);
      const recipe = relicRecipe(relic);
      const materials = { ...save.materials };
      for (const { materialId, amount } of recipe.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
      const gem = recipe.valuables![0];
      save = restoreRelic(
        { ...save, materials, valuables: { ...save.valuables, [`${gem.valuableId}:1`]: (save.valuables[`${gem.valuableId}:1`] ?? 0) + gem.amount } },
        save.relics.at(-1)!.uid,
      );
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('grantLoot gives fresh uids to gear, trinkets, prize pieces and relics', () => {
    let save = createInitialSave();
    for (let i = 0; i < 8; i++) {
      save = grantLoot(
        save,
        ALL,
        {
          ...emptyLoot(),
          gear: [
            { uid: '', itemId: 'sword1', rarity: 'common' as const },
            { uid: '', itemId: trinketId('hawkEyeRing', 1), rarity: 'rare' as const },
            { uid: '', itemId: 'mail1', rarity: 'common' as const },
          ],
          relics: ['rustyCoin', 'oldBoot'],
          treasureMaps: [{ rarity: 'common', tier: 1 }],
        },
        NOW + i,
      );
      save = grantLoot(save, [], secretPrize(1, createRng(`prize|${i}`)), NOW + i);
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('buying gear at the smithy gives every piece a fresh uid', () => {
    let save: SaveData = { ...createInitialSave(), gold: 100_000 };
    for (let i = 0; i < 6; i++) {
      let line: ReturnType<typeof placeStock>[number] | undefined;
      let spawn: PlaceSpawn | undefined;
      for (let j = i; j < i + 40 && !line; j++) {
        spawn = spawnOf('smithy', `${j}:1`);
        line = placeStock(save, spawn, NOW).find((stockLine) => stockLine.kind === 'gear');
      }
      save = buy(save, spawn!, line!.key, 1, POSITION, NOW);
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('buying gear at the black market gives every piece a fresh uid', () => {
    let save: SaveData = { ...createInitialSave(), gold: 100_000 };
    for (let i = 0; i < 6; i++) {
      const tip = {
        id: `blackMarket|heist-${i}`,
        secret: 'blackMarket' as const,
        source: 'heist' as const,
        sourceId: `heist-${i}`,
        anchor: POSITION,
        foundAt: NOW,
        expiresAt: NOW + secretRules.lifetimeHours * HOUR,
      };
      const place: PlaceSpawn = {
        id: secretPlaceId(tip),
        kind: 'blackMarket',
        group: 'secret',
        tile: 'secret',
        position: POSITION,
        startsAt: NOW,
        expiresAt: tip.expiresAt,
        roll: 0,
      };
      save = enterSecret({ ...save, secretTips: [...save.secretTips, tip], keyFragments: save.keyFragments + 4 }, place, POSITION, NOW);
      const line = blackMarketGoods(save, place).find((good) => good.kind === 'gear');
      if (line) save = buyAtBlackMarket(save, place, line.key, POSITION, NOW);
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('playing the tutorial to a step gives every crafted piece a fresh uid', () => {
    let save = createInitialSave();
    for (let i = 0; i < 5; i++) {
      save = jumpToStep(restartTutorial(save), 'done', NOW + i * HOUR);
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('skipping the tutorial gives every crafted piece a fresh uid', () => {
    let save = createInitialSave();
    for (let i = 0; i < 5; i++) {
      save = skipTutorial(restartTutorial(save), NOW + i * HOUR);
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('debug gear and hero grants give every piece and hero a fresh uid', () => {
    useGameStore.getState().resetSave();
    for (let i = 0; i < 6; i++) {
      useGameStore.getState().addGear('sword1', 'common');
      useGameStore.getState().addHero('warrior', 3, 'quickLearner');
      useGameStore.setState({ save: craftSword(useGameStore.getState().save) });
      expectUniqueIds(useGameStore.getState().save);
    }
    useGameStore.getState().resetSave();
  });

  it('challenging Sanctums keeps every uid unique across wins', () => {
    let save: SaveData = {
      ...createInitialSave(),
      sigils: Array.from({ length: 8 }, () => 1),
      heroes: createInitialSave().heroes.map((hero) => ({ ...hero, level: 9 })),
    };
    save = grantLoot(
      save,
      [],
      {
        ...emptyLoot(),
        gear: ['sword5', 'bow5', 'wand5', 'mail5', 'mail5', 'mail5'].map((itemId) => ({ uid: '', itemId, rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 })),
      },
      NOW,
    );
    const uids = save.gear.map((piece) => piece.uid);
    save = equip(save, 'bram', 'weapon', uids[0]);
    save = equip(save, 'lyra', 'weapon', uids[1]);
    save = equip(save, 'mira', 'weapon', uids[2]);
    save = equip(save, 'bram', 'armor', uids[3]);
    save = equip(save, 'lyra', 'armor', uids[4]);
    save = equip(save, 'mira', 'armor', uids[5]);

    let wins = 0;
    for (let i = 0; i < 8; i++) {
      const spawn = { id: `sanctum:emberForge:tile:${i}:${i}`, sanctumId: 'emberForge', position: POSITION, expiresAt: NOW + DAY };
      const { save: challenged, result } = challengeSanctum(save, spawn, 1, ALL, POSITION, NOW);
      if (result.win) wins++;
      save = craftSword(challenged);
      expectUniqueIds(save);
      save = healAll(save);
    }
    expect(wins).toBeGreaterThan(0);
  });

  it('resolving expeditions keeps every uid unique', () => {
    let save = veteran();
    for (let i = 0; i < 6; i++) {
      const started = startExpedition(save, 'ratCellar', ALL, NOW + i * HOUR);
      save = resolveExpedition(started, started.expeditions[0]).save;
      save = craftSword(save);
      expectUniqueIds(save);
      save = healAll(save);
    }
  });

  it('place fights keep every uid unique', () => {
    let save = veteran();
    for (let i = 0; i < 6; i++) {
      const started = startPlaceFight(save, spawnOf('banditCamp', `${i}:1`), ALL, POSITION, NOW);
      save = resolvePlaceFights(started, NOW + 1_000_000).save;
      save = craftSword(save);
      expectUniqueIds(save);
      save = healAll(save);
    }
  });

  it('heists keep every uid unique', () => {
    let save = veteran();
    for (let i = 0; i < 6; i++) {
      const started = startHeist(save, spawnOf('thievesGuild', `${i}:1`), 'bram', POSITION, NOW);
      save = resolveHeists(started, NOW + 1_000_000_000).save;
      save = craftSword(save);
      expectUniqueIds(save);
    }
  });

  it('patrol fights keep every uid unique', () => {
    let save = veteran();
    for (let i = 0; i < 6; i++) {
      const spawn: PatrolSpawn = {
        id: `patrol:goblins:${i}`,
        tile: 'tile',
        window: 0,
        kind: 'goblins',
        difficulty: 'easy',
        tier: 1,
        path: { waypoints: [POSITION], loopMs: HOUR, phaseMs: 0 },
        startsAt: 0,
        endsAt: NOW + 1_000_000,
      };
      const started = startPatrolFight(save, spawn, ALL, POSITION, NOW);
      save = resolvePatrolFights(started, NOW + 1_000_000).save;
      save = craftSword(save);
      expectUniqueIds(save);
      save = healAll(save);
    }
  });
});
