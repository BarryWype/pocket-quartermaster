import { expeditionRules } from '@/content/dungeons';
import { lootConfig } from '@/content/loot/config';
import { mobById, patrolMobId } from '@/content/enemies';
import { patrolKinds, patrolRules, patrolTexts, type PatrolRules } from '@/content/patrols';
import { patrolThreats } from '@/content/threats';

import { estimatePartyOdds, ODDS_RUNS, type Odds } from '../expeditions/odds';
import { highestUnlockedTier, untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type RunOptions, type RunResult } from '../expeditions/simulate';
import { pickaxeTier } from '../gathering/gathering';
import { guildBonus, partySize } from '../guild/guild';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import { sourceAmounts } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { rollSourceLoot } from '../loot/roll';
import { emptyLoot, type Loot, type LootSourceId } from '../loot/types';
import type { SaveData } from '../save';
import { applyRunHp, isExhausted } from '../team/health';
import { isAway } from '../team/team';
import type { BossDef, Briefing, DungeonDef, EncounterDef, ExpeditionReport } from '../types';
import { isPatrolKind, patrolTier, pruneByWindow, type PatrolKind, type PatrolSpawn } from './generate';
import { distanceTo, isGone } from './visibility';

const MINUTE = 60_000;

/** The threat each patrol kind carries: only its run-level effects apply. */
export function patrolBriefing(kind: PatrolKind): Briefing {
  return { threats: [patrolThreats[kind]], restriction: null, opportunity: null };
}

/** The run options a patrol fight uses: no mishaps, with the patrol's threat. */
export function patrolRunOptions(kind: PatrolKind): RunOptions {
  return { rules: { ...expeditionRules, mishapChance: 0 }, briefing: patrolBriefing(kind), elixirs: true };
}

/** What the game state knows when rewards are rolled: the save does not have to be at hand. */
export type RewardContext = {
  /** Guild gold bonus folded in, `1 + guildBonus(save, 'gold')`. */
  goldMultiplier: number;
  /** The party's Luck. */
  luck: number;
  /** The player's pickaxe tier: caches never hold ore above it. */
  pickaxeTier: number;
  /** The highest unlocked tier, for looted gear. */
  playerTier: number;
};

export const rewardContextOf = (save: SaveData, luck = 0): RewardContext => ({
  goldMultiplier: 1 + guildBonus(save, 'gold'),
  luck,
  pickaxeTier: pickaxeTier(save),
  playerTier: highestUnlockedTier(save),
});

export const PATROL_SOURCES: Record<PatrolKind, LootSourceId> = { goblins: 'patrolGoblins', herd: 'patrolHerd', bandits: 'patrolBandits' };

/**
 * The fight itself, as a mini dungeon: one or two encounters, the last group a
 * weak boss, and no loot, blueprints or main rewards — those are rolled by
 * `patrolRewards` so they can be worked out without a run.
 */
export function patrolDungeon(spawn: PatrolSpawn, tier: number, elite: boolean, rules: PatrolRules = patrolRules): DungeonDef {
  const patrolKind = spawn.kind;
  if (!isPatrolKind(patrolKind)) throw new Error(`No fight with a ${patrolKind}`);
  const kind = patrolKinds[patrolKind];
  const encounters: EncounterDef[] = kind.groups.map((group) => ({
    type: 'fight',
    weight: group.weight,
    mobs: [{ mobId: patrolMobId(patrolKind, tier, group.role, elite), count: group.count }],
  }));
  const { gold, xp } = sourceAmounts(PATROL_SOURCES[patrolKind], tier);
  return {
    id: `patrol:${patrolKind}:${tier}${elite ? ':elite' : ''}`,
    name: patrolTexts.kinds[patrolKind],
    emoji: '⚔️',
    tier,
    durationMinutes: kind.fightMinutes,
    encounterCount: [1, 2],
    encounters,
    boss: mobById[patrolMobId(patrolKind, tier, 'boss', elite)] as BossDef,
    gold: [gold, gold],
    xp,
  };
}

/**
 * What a win over the spawn pays: its kind's row of the loot matrix. Elites
 * pay more gold and XP. Patrol rows never drop blueprints, so the context
 * needs no known recipes (the background escort rolls without the save).
 */
export function patrolRewards(
  context: RewardContext,
  spawn: PatrolSpawn,
  tier: number,
  elite: boolean,
  enemies: string[],
  rng: Rng,
): Loot {
  if (!isPatrolKind(spawn.kind)) throw new Error(`No rewards from a ${spawn.kind}`);
  const source = PATROL_SOURCES[spawn.kind];
  const amounts = sourceAmounts(source, tier);
  const elites = elite ? lootConfig.eliteMultiplier : 1;
  return rollSourceLoot({
    source,
    tier,
    luck: context.luck,
    modifiers: [],
    enemies,
    base: { gold: Math.round(amounts.gold * elites * context.goldMultiplier), xp: Math.round(amounts.xp * elites) },
    context: { playerTier: context.playerTier, pickaxeTier: context.pickaxeTier, knownRecipes: [], favouredTypes: [] },
    rng,
  });
}

/** The mob ids a run fought, for monster parts. */
export const foughtEnemies = (run: RunResult) => run.encounters.flatMap((e) => e.mobs.map((m) => m.mobId));

/** A fight under way, resolved when its time is up: the run has already been played out. */
export type PatrolFight = {
  id: string;
  patrolId: string;
  kind: PatrolKind;
  tier: number;
  elite: boolean;
  heroIds: string[];
  startedAt: number;
  endsAt: number;
  /** The patrol's window, so a win hides it until then. */
  windowEndsAt: number;
  won: boolean;
  hp: RunResult['hp'];
  /** Consumables that never triggered, broken back down at resolution (see threats/salvage.ts). */
  salvaged: ExpeditionReport['salvaged'];
  rewards: Loot;
};

export type PatrolFightProblem = 'tooFar' | 'gone' | 'away' | 'exhausted' | 'partySize' | 'empty' | null;

/** Why these heroes cannot fight this patrol from here now, or null. */
export function patrolFightProblem(
  save: SaveData,
  spawn: PatrolSpawn,
  heroIds: string[],
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): PatrolFightProblem {
  if (!isPatrolKind(spawn.kind) || isGone(spawn, { ...save.beatenPatrols, ...save.helpedTravellers }, now)) return 'gone';
  if (distanceTo(spawn, player, now) > rules.engageMeters) return 'tooFar';
  if (heroIds.length === 0) return 'empty';
  if (heroIds.length > partySize(save)) return 'partySize';
  for (const heroId of heroIds) {
    const hero = save.heroes.find((h) => h.id === heroId);
    if (!hero || isAway(save, heroId)) return 'away';
    if (isExhausted(hero, now)) return 'exhausted';
  }
  return null;
}

/**
 * Sends home heroes at a patrol: the fight is played out at once, but its
 * result waits for the fight's time. Heroes keep the HP they left with until
 * then, and their used-up consumables are settled at resolution.
 */
export function startPatrolFight(
  save: SaveData,
  spawn: PatrolSpawn,
  heroIds: string[],
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): SaveData {
  const problem = patrolFightProblem(save, spawn, heroIds, player, now, rules);
  const kind = spawn.kind;
  if (problem || !isPatrolKind(kind)) throw new Error(`Cannot fight this patrol: ${problem}`);

  const { tier, elite } = patrolTier(spawn, highestUnlockedTier(save));
  const dungeon = patrolDungeon(spawn, tier, elite, rules);
  const party = prepareParty(save, heroIds, now, true);
  const id = `p${save.nextUid}`;
  const run = simulateRun(party, dungeon, `${id}|${spawn.id}`, patrolRunOptions(kind));
  const rewards = run.bossDefeated
    ? patrolRewards(rewardContextOf(save, party.reduce((sum, m) => sum + m.luck, 0)), spawn, tier, elite, foughtEnemies(run), createRng(`${id}|rewards`))
    : emptyLoot();

  return {
    ...save,
    patrolFights: [
      ...save.patrolFights,
      {
        id,
        patrolId: spawn.id,
        kind,
        tier,
        elite,
        heroIds,
        startedAt: now,
        endsAt: now + dungeon.durationMinutes * MINUTE,
        windowEndsAt: spawn.endsAt,
        won: run.bossDefeated,
        hp: run.hp,
        salvaged: untriggeredSalvage(party, run),
        rewards,
      },
    ],
    beatenPatrols: pruneByWindow(save.beatenPatrols, now, rules),
    // The escort hero set out with the player instead: the background task stands down.
    escort: save.escort && heroIds.includes(save.escort.heroId) ? null : save.escort,
    nextUid: save.nextUid + 1,
  };
}

/** The party's chances at a patrol now, with the HP the heroes have. */
export function patrolOdds(
  save: SaveData,
  spawn: PatrolSpawn,
  heroIds: string[],
  now: number,
  runs = ODDS_RUNS,
  rules: PatrolRules = patrolRules,
): Odds {
  const kind = spawn.kind;
  if (!isPatrolKind(kind)) throw new Error(`No fight with a ${kind}`);
  const { tier, elite } = patrolTier(spawn, highestUnlockedTier(save));
  return estimatePartyOdds(
    prepareParty(save, heroIds, now, true),
    patrolDungeon(spawn, tier, elite, rules),
    runs,
    patrolRunOptions(kind),
  );
}

/**
 * Settles the consumables of heroes back from a patrol fight, as expeditions
 * do: the slot is emptied, and what never triggered is broken back down into
 * materials and gold (never back into the stock).
 */
export function settleConsumables(save: SaveData, heroIds: string[], salvaged: ExpeditionReport['salvaged']): SaveData {
  const salvageGold = salvaged.reduce((sum, s) => sum + s.gold, 0);
  const salvageMaterials = salvaged.flatMap((s) => s.materials);
  const heroes = save.heroes.map((hero) => {
    if (!heroIds.includes(hero.id) || (!hero.equipment.consumable && !hero.equipment.potion)) return hero;
    return { ...hero, equipment: { ...hero.equipment, consumable: null, ...(hero.equipment.potion ? { potion: null } : {}) } };
  });
  return {
    ...save,
    gold: save.gold + salvageGold,
    materials: addMaterials(save.materials, salvageMaterials),
    heroes,
  };
}

/**
 * Pays a won patrol fight (see `grantLoot`) and hides the patrol for its
 * window. Rewards rolled before the loot matrix lack the newer fields, so
 * they are filled in first.
 */
export function grantPatrolWin(save: SaveData, heroIds: string[], rewards: Loot, patrolId: string, windowEndsAt: number, now: number): SaveData {
  const granted = grantLoot(save, heroIds, { ...emptyLoot(), ...rewards }, now);
  return { ...granted, beatenPatrols: { ...granted.beatenPatrols, [patrolId]: windowEndsAt } };
}

/**
 * Settles the fights whose time is up: heroes come back with the HP the run
 * left them (a knock-out exhausts them), and a win pays its rewards and hides
 * the patrol until the window ends. A lost patrol stays on the map.
 */
export function resolvePatrolFights(
  save: SaveData,
  now: number,
  rules: PatrolRules = patrolRules,
): { save: SaveData; resolved: PatrolFight[] } {
  const due = save.patrolFights.filter((fight) => fight.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  if (due.length === 0) return { save, resolved: [] };

  let next: SaveData = { ...save, patrolFights: save.patrolFights.filter((fight) => fight.endsAt > now) };
  for (const fight of due) {
    next = settleConsumables(next, fight.heroIds, fight.salvaged);
    if (fight.won) next = grantPatrolWin(next, fight.heroIds, fight.rewards, fight.patrolId, fight.windowEndsAt, fight.endsAt);
    next = applyRunHp(next, fight.hp, fight.endsAt);
  }
  return { save: { ...next, beatenPatrols: pruneByWindow(next.beatenPatrols, now, rules) }, resolved: due };
}
