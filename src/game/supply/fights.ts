import { isElitePatrolKind } from '@/content/enemies';
import { patrolRow, patrolRules, type PatrolDifficulty } from '@/content/patrols';

import { untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type RunResult } from '../expeditions/simulate';
import { createAnimalPath } from '../generation/animalPaths';
import { createRng, type Rng } from '../generation/rng';
import { windowIndex } from '../generation/time';
import { partyLootModifiers } from '../loot/modifiers';
import { mergeLoot } from '../loot/roll';
import { emptyLoot, type Loot } from '../loot/types';
import { foughtEnemies, patrolDungeon, patrolRewards, patrolRunOptions, rewardContextOf } from '../patrols/fight';
import { isPatrolKind, type PatrolKind, type PatrolSpawn } from '../patrols/generate';
import type { SaveData } from '../save';
import { applyRunHp } from '../team/health';
import type { ExpeditionReport } from '../types';

const MINUTE = 60_000;

/** A fight's outcome, kept until the heroes are home: who won, the HP it left, unused consumables, the loot. */
export type FightResult = {
  won: boolean;
  hp: RunResult['hp'];
  salvaged: ExpeditionReport['salvaged'];
  rewards: Loot;
};

/** A patrol spawn of a given kind and difficulty, for fights the supply lines meet off the map: a placeholder path in the cell's tile. */
export function patrolSpawnOf(kind: PatrolKind, difficulty: PatrolDifficulty, tier: number, cell: string, at: number, id: string, rng: Rng = createRng(id)): PatrolSpawn {
  const tile = cell.slice(0, patrolRules.precision);
  return {
    id,
    tile,
    window: windowIndex(at, patrolRules.windowMinutes),
    kind,
    difficulty,
    tier,
    path: createAnimalPath(tile, rng, patrolRules.waypoints, patrolRules.windowMinutes),
    startsAt: at,
    endsAt: at + patrolRules.windowMinutes * MINUTE,
  };
}

/** A patrol of the tier's row at a difficulty, the kind picked from a seed: for danger that comes from no patrol. */
export function syntheticPatrol(tier: number, difficulty: PatrolDifficulty, seedKey: string, cell: string, at: number): PatrolSpawn {
  const rng = createRng(seedKey);
  const kind = patrolRow(tier)[difficulty][rng.chance(0.5) ? 0 : 1];
  return patrolSpawnOf(kind, difficulty, tier, cell, at, `synthetic:${seedKey}`, rng);
}

/**
 * Plays a patrol fight out at once, like `startPatrolFight`: the party's HP as
 * of `at`, rewards rolled (extra rolls included). The returned save has the
 * run's HP applied, so a later fight of the same outing starts from it.
 */
export function playPatrolFight(
  save: SaveData,
  heroIds: string[],
  spawn: PatrolSpawn,
  seed: string,
  at: number,
): { save: SaveData; result: FightResult } {
  const kind = spawn.kind as PatrolKind;
  if (!isPatrolKind(kind) || spawn.difficulty === null) throw new Error(`No fight with a ${spawn.kind}`);
  const party = prepareParty(save, heroIds, at, true);
  const elite = isElitePatrolKind(kind);
  const run = simulateRun(party, patrolDungeon(spawn, spawn.tier, elite), seed, patrolRunOptions(spawn));
  const rollRewards = (rng: Rng) =>
    patrolRewards(
      rewardContextOf(save, party.reduce((sum, m) => sum + m.luck, 0), partyLootModifiers(party), at),
      spawn,
      spawn.tier,
      elite,
      foughtEnemies(run),
      rng,
    );
  let rewards: Loot = run.bossDefeated ? rollRewards(createRng(`${seed}|rewards`)) : emptyLoot();
  for (let i = 0; i < run.extraLootRolls; i++) rewards = mergeLoot(rewards, rollRewards(createRng(`${seed}|rewards|extra|${i}`)));
  return {
    save: applyRunHp(save, run.hp, at),
    result: { won: run.bossDefeated, hp: run.hp, salvaged: untriggeredSalvage(party, run), rewards },
  };
}
