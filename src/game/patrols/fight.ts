import { dungeons, expeditionRules } from '@/content/dungeons';
import { mobById, patrolMobId } from '@/content/enemies';
import { resources } from '@/content/resources';
import { patrolKinds, patrolRules, patrolTexts, type PatrolRules } from '@/content/patrols';
import { patrolThreats } from '@/content/threats';
import { traitById } from '@/content/traits';

import { ELEMENTS, shardId, type Element } from '../elements';
import { estimatePartyOdds, ODDS_RUNS, type Odds } from '../expeditions/odds';
import { highestUnlockedTier, untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type RunOptions, type RunResult } from '../expeditions/simulate';
import { pickaxeTier } from '../gathering/gathering';
import { guildBonus, partySize } from '../guild/guild';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import { rollLoot } from '../rewards/loot';
import type { SaveData } from '../save';
import { applyRunHp, isExhausted } from '../team/health';
import { addXp, isAway } from '../team/team';
import type { BossDef, Briefing, DungeonDef, EncounterDef, ExpeditionReport, MaterialStack } from '../types';
import { isPatrolKind, patrolTier, pruneByWindow, type PatrolKind, type PatrolSpawn } from './generate';
import { distanceTo, isGone } from './visibility';

const MINUTE = 60_000;

/** The threat each patrol kind carries: only its run-level effects apply. */
export function patrolBriefing(kind: PatrolKind): Briefing {
  return { threats: [patrolThreats[kind]], restriction: null, opportunity: null };
}

/** The run options a patrol fight uses: no mishaps, with the patrol's threat. */
export function patrolRunOptions(kind: PatrolKind): RunOptions {
  return { rules: { ...expeditionRules, mishapChance: 0 }, briefing: patrolBriefing(kind) };
}

/** What the game state knows when rewards are rolled: the save does not have to be at hand. */
export type RewardContext = {
  /** Guild gold bonus folded in, `1 + guildBonus(save, 'gold')`. */
  goldMultiplier: number;
  /** The party's Luck, folded into gold and material rewards. */
  luck: number;
  /** The player's pickaxe tier: caches and trades never hold ore above it. */
  pickaxeTier: number;
};

export const rewardContextOf = (save: SaveData, luck = 0): RewardContext => ({
  goldMultiplier: 1 + guildBonus(save, 'gold'),
  luck,
  pickaxeTier: pickaxeTier(save),
});

export type PatrolRewards = {
  gold: number;
  /** XP per hero. */
  xp: number;
  materials: MaterialStack[];
  /** One shard of an element, goblin patrols sometimes carry. */
  shards?: { element: Element; amount: number };
};

/** The shard stack of a reward, folded in with the materials when granted. */
export const rewardMaterials = (rewards: PatrolRewards): MaterialStack[] =>
  rewards.shards ? [...rewards.materials, { materialId: shardId(rewards.shards.element), amount: rewards.shards.amount }] : rewards.materials;

/** The tier's short dungeon: patrols pay a share of what it gives. */
const shortDungeon = (tier: number) => dungeons.find((d) => d.tier === tier && d.slot === 'short')!;

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
  const short = shortDungeon(tier);
  const gold = Math.round(((short.gold[0] + short.gold[1]) / 2) * (kind.goldShareOfShort ?? 0));
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
    xp: Math.round(short.xp * rules.xpShareOfShortDungeon),
    loot: [],
    recipeDrops: [],
    mainRewardChance: 0,
  };
}

/**
 * What a win over the spawn pays: goblins carry a little gold and sometimes a
 * shard, herds meat and hide, bandits a stolen cache of the materials the
 * player's own pickaxe could gather. Elites pay twice as much.
 */
export function patrolRewards(
  context: RewardContext,
  spawn: PatrolSpawn,
  tier: number,
  elite: boolean,
  rng: Rng,
  rules: PatrolRules = patrolRules,
): PatrolRewards {
  if (!isPatrolKind(spawn.kind)) throw new Error(`No rewards from a ${spawn.kind}`);
  const kind = patrolKinds[spawn.kind];
  const short = shortDungeon(tier);
  const eliteMultiplier = elite ? rules.elite.rewardMultiplier : 1;
  // Lucky parties carry more home.
  const luckGold = 1 + expeditionRules.luck.goldPerPoint * context.luck;
  const materials = kind.loot
    ? rollLoot(rng, kind.loot).map((stack) => ({ ...stack, amount: Math.round(stack.amount * eliteMultiplier * luckGold) }))
    : kind.cacheNodes
      ? cacheMaterials(context, rng, kind.cacheNodes).map((stack) => ({ ...stack, amount: Math.round(stack.amount * eliteMultiplier * luckGold) }))
      : [];
  return {
    gold: Math.round(((short.gold[0] + short.gold[1]) / 2) * (kind.goldShareOfShort ?? 0) * eliteMultiplier * context.goldMultiplier * luckGold),
    xp: Math.round(short.xp * rules.xpShareOfShortDungeon * eliteMultiplier),
    materials,
    ...(kind.shardChance && rng.chance(kind.shardChance)
      ? { shards: { element: ELEMENTS[rng.int(0, ELEMENTS.length - 1)], amount: Math.round(eliteMultiplier * luckGold) } }
      : {}),
  };
}

/** Materials worth a few nodes, drawn from the resource table the player's pickaxe covers. */
function cacheMaterials(context: RewardContext, rng: Rng, nodes: number): MaterialStack[] {
  const pool = resources.filter((resource) => (resource.pickaxeTier ?? 0) <= context.pickaxeTier);
  const gained: MaterialStack[] = [];
  for (let node = 0; node < nodes; node++) {
    const resource = rng.weighted(pool, (r) => r.weight);
    for (const { materialId, amount } of resource.yields) {
      gained.push({ materialId, amount: amount * rng.int(1, 2) });
    }
  }
  return gained.reduce<MaterialStack[]>((stacks, stack) => {
    const held = stacks.find((s) => s.materialId === stack.materialId);
    return held ? stacks.map((s) => (s === held ? { ...s, amount: s.amount + stack.amount } : s)) : [...stacks, stack];
  }, []);
}

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
  rewards: PatrolRewards;
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
  const party = prepareParty(save, heroIds, now);
  const id = `p${save.nextUid}`;
  const run = simulateRun(party, dungeon, `${id}|${spawn.id}`, patrolRunOptions(kind));
  const rewards = run.bossDefeated
    ? patrolRewards(rewardContextOf(save, party.reduce((sum, m) => sum + m.luck, 0)), spawn, tier, elite, createRng(`${id}|rewards`), rules)
    : { gold: 0, xp: 0, materials: [] };

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
        salvaged: untriggeredSalvage(party, run, { barren: false, gold: 0 }),
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
    prepareParty(save, heroIds, now),
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
    if (!heroIds.includes(hero.id) || !hero.equipment.consumable) return hero;
    return { ...hero, equipment: { ...hero.equipment, consumable: null } };
  });
  return {
    ...save,
    gold: save.gold + salvageGold,
    materials: addMaterials(save.materials, salvageMaterials),
    heroes,
  };
}

/** Pays a won patrol fight: gold, materials, XP per hero (trait and Guild Hall bonuses) and the patrol hidden for its window. */
export function grantPatrolWin(save: SaveData, heroIds: string[], rewards: PatrolRewards, patrolId: string, windowEndsAt: number): SaveData {
  const guildXp = 1 + guildBonus(save, 'heroXp');
  return {
    ...save,
    gold: save.gold + rewards.gold,
    materials: addMaterials(save.materials, rewardMaterials(rewards)),
    heroes: save.heroes.map((hero) => {
      if (!heroIds.includes(hero.id)) return hero;
      const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
      return addXp(hero, Math.round(rewards.xp * xpBonus * guildXp));
    }),
    beatenPatrols: { ...save.beatenPatrols, [patrolId]: windowEndsAt },
  };
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
    if (fight.won) next = grantPatrolWin(next, fight.heroIds, fight.rewards, fight.patrolId, fight.windowEndsAt);
    next = applyRunHp(next, fight.hp, fight.endsAt);
  }
  return { save: { ...next, beatenPatrols: pruneByWindow(next.beatenPatrols, now, rules) }, resolved: due };
}
