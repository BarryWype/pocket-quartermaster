import { dungeons, expeditionRules } from '@/content/dungeons';
import { mobById, placeMobId } from '@/content/enemies';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { placeRewardTables, type PlaceRewardTable } from '@/content/placeRewards';
import { placeInfo, placeRules, type PlaceKind } from '@/content/places';

import { ELEMENTS, shardId, type Element } from '../elements';
import { estimatePartyOdds, ODDS_RUNS, type Odds } from '../expeditions/odds';
import { highestUnlockedTier, untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type RunOptions } from '../expeditions/simulate';
import { forgedItem } from '../crafting/crafting';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { cacheMaterials, rewardContextOf, settleConsumables, type RewardContext } from '../patrols/fight';
import { rollLoot } from '../rewards/loot';
import type { SaveData } from '../save';
import { applyRunHp, isExhausted } from '../team/health';
import { isAway } from '../team/team';
import type { ActiveThreat, Briefing, BossDef, DungeonDef, EncounterDef, PlaceFight, PlaceReward } from '../types';
import { placeGroupOf, placesAround, type PlaceSpawn } from './generate';
import { grantPlaceReward } from './grant';
import { gearPool, recipeCandidates } from './shops';

const MINUTE = 60_000;

/** The kinds of places home heroes can fight at. */
export const isFightPlace = (kind: PlaceKind): kind is FightPlaceKind => kind in placeFightRules.kinds;

const rulesOf = (kind: FightPlaceKind) => placeFightRules.kinds[kind];

/** The tier's short dungeon: place fights pay a share of what it gives. */
const shortDungeon = (tier: number) => dungeons.find((d) => d.tier === tier && d.slot === 'short')!;

/** The element a rift shows, fixed for as long as the rift stands. */
export function riftElement(spawn: PlaceSpawn): Element {
  return createRng(`rift|${spawn.id}`).weighted(ELEMENTS, () => 1);
}

/** The briefing a place's fight runs under: its threat, maybe an opportunity. */
export function placeFightBriefing(save: SaveData, spawn: PlaceSpawn): Briefing {
  const kind = spawn.kind;
  if (!isFightPlace(kind)) throw new Error(`No fight at a ${kind}`);
  const { threat } = rulesOf(kind);
  const level = highestUnlockedTier(save) >= placeFightRules.levelTwoFromTier ? 2 : 1;
  const id = Array.isArray(threat) ? createRng(`threat|${spawn.id}`).weighted(threat, () => 1) : threat;
  const active: ActiveThreat = { id, level, ...(id === 'element' ? { element: riftElement(spawn) } : {}) };
  const rng = createRng(`opportunity|${spawn.id}`);
  const opportunity = rng.chance(placeFightRules.opportunityChance) ? rng.weighted(placeFightRules.opportunities, () => 1) : null;
  return { threats: [active], restriction: null, opportunity };
}

/** The run options a place fight uses: no mishaps, with its briefing. */
export function placeRunOptions(save: SaveData, spawn: PlaceSpawn): RunOptions {
  return { rules: { ...expeditionRules, mishapChance: 0 }, briefing: placeFightBriefing(save, spawn), elixirs: true };
}

/** The fight itself, as a mini dungeon like a patrol's (see patrols/fight.ts). */
export function placeFightDungeon(spawn: PlaceSpawn, tier: number): DungeonDef {
  const kind = spawn.kind;
  if (!isFightPlace(kind)) throw new Error(`No fight at a ${kind}`);
  const { elite, groups, minutes } = rulesOf(kind);
  const element = kind === 'elementalRift' ? riftElement(spawn) : undefined;
  const encounters: EncounterDef[] = groups.map((group) => ({
    type: 'fight',
    weight: group.weight,
    mobs: [{ mobId: placeMobId(kind, tier, group.role, elite, element), count: group.count }],
  }));
  const short = shortDungeon(tier);
  const gold = Math.round(((short.gold[0] + short.gold[1]) / 2) * (placeRewardTables[kind]?.goldShareOfShort ?? 0));
  return {
    id: `place:${kind}:${tier}${elite ? ':elite' : ''}`,
    name: placeInfo[kind].name,
    emoji: placeInfo[kind].emoji,
    tier,
    durationMinutes: minutes,
    encounterCount: [1, 2],
    encounters,
    boss: mobById[placeMobId(kind, tier, 'boss', elite, element)] as BossDef,
    gold: [gold, gold],
    xp: Math.round(short.xp * placeFightRules.xpShareOfShortDungeon),
    loot: [],
    recipeDrops: [],
    mainRewardChance: 0,
  };
}

/**
 * What a win at a place pays, rolled from its placeholder table. The element
 * is the rift's spawn-chosen one, or rolled here when absent (the lair's).
 * Deterministic for a given rng.
 */
export function rollPlaceReward(
  table: PlaceRewardTable,
  context: RewardContext,
  tier: number,
  rng: Rng,
  save: SaveData,
  element?: Element,
): PlaceReward {
  const short = shortDungeon(tier);
  // Lucky parties carry more home.
  const luckGold = 1 + expeditionRules.luck.goldPerPoint * context.luck;
  const rolled = table.cacheNodes ? cacheMaterials(context, rng, table.cacheNodes) : table.loot ? rollLoot(rng, table.loot) : [];
  const materials = rolled.map((stack) => ({ ...stack, amount: Math.round(stack.amount * luckGold) }));
  const shards = table.shards
    ? [
        {
          materialId: shardId(element ?? ELEMENTS[rng.int(0, ELEMENTS.length - 1)]),
          amount: rng.int(table.shards[0], table.shards[1]),
        },
      ]
    : [];
  const consumables =
    table.consumableChance && table.consumablePool && rng.chance(table.consumableChance)
      ? [{ itemId: table.consumablePool[rng.int(0, table.consumablePool.length - 1)], amount: 1 }]
      : [];
  const keyFragments = table.keyFragmentChance && rng.chance(table.keyFragmentChance) ? 1 : 0;
  const pool = gearPool(save);
  const gear =
    table.gearChance && rng.chance(table.gearChance) && pool.length > 0
      ? [{ uid: 'reward', itemId: forgedItem(pool[rng.int(0, pool.length - 1)])!.id, quality: table.gearQuality ?? 'normal', roll: 1 }]
      : [];
  const recipePool = recipeCandidates(save).filter((candidate) => candidate.recipe.station === 'forge');
  const recipeId =
    table.recipeChance && rng.chance(table.recipeChance) && recipePool.length > 0
      ? recipePool[rng.int(0, recipePool.length - 1)].recipe.id
      : undefined;
  return {
    gold: Math.round(((short.gold[0] + short.gold[1]) / 2) * table.goldShareOfShort * context.goldMultiplier * luckGold),
    xp: Math.round(short.xp * placeFightRules.xpShareOfShortDungeon),
    materials: [...materials, ...shards],
    consumables,
    gear,
    ...(recipeId ? { recipeId } : {}),
    keyFragments,
  };
}

export type PlaceFightProblem = 'gone' | 'tooFar' | 'empty' | 'partySize' | 'away' | 'exhausted' | null;

/** Why these heroes cannot fight at this place from here now, or null. */
export function placeFightProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  heroIds: string[],
  player: LatLng,
  now: number,
): PlaceFightProblem {
  const kind = spawn.kind;
  if (
    !isFightPlace(kind) ||
    spawn.expiresAt <= now ||
    spawn.id in save.usedPlaces ||
    save.placeFights.some((fight) => fight.placeId === spawn.id)
  )
    return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  if (heroIds.length === 0) return 'empty';
  const min = kind === 'monsterLair' ? placeFightRules.lair.minParty : 1;
  if (heroIds.length > rulesOf(kind).party || heroIds.length < min) return 'partySize';
  for (const heroId of heroIds) {
    const hero = save.heroes.find((h) => h.id === heroId);
    if (!hero || isAway(save, heroId)) return 'away';
    if (isExhausted(hero, now)) return 'exhausted';
  }
  return null;
}

/**
 * Sends home heroes at a place, like a patrol fight: the run plays out at
 * once and its result waits for the fight's time.
 */
export function startPlaceFight(save: SaveData, spawn: PlaceSpawn, heroIds: string[], player: LatLng, now: number): SaveData {
  const problem = placeFightProblem(save, spawn, heroIds, player, now);
  const kind = spawn.kind;
  if (problem || !isFightPlace(kind)) throw new Error(`Cannot fight at this place: ${problem}`);

  const tier = highestUnlockedTier(save);
  const dungeon = placeFightDungeon(spawn, tier);
  const party = prepareParty(save, heroIds, now, true);
  const id = `f${save.nextUid}`;
  const run = simulateRun(party, dungeon, `${id}|${spawn.id}`, placeRunOptions(save, spawn));
  const reward: PlaceReward = run.bossDefeated
    ? rollPlaceReward(
        placeRewardTables[kind]!,
        rewardContextOf(save, party.reduce((sum, m) => sum + m.luck, 0)),
        tier,
        createRng(`${id}|rewards`),
        save,
        kind === 'elementalRift' ? riftElement(spawn) : undefined,
      )
    : { gold: 0, xp: 0, materials: [], consumables: [], gear: [], keyFragments: 0 };

  return {
    ...save,
    placeFights: [
      ...save.placeFights,
      {
        id,
        placeId: spawn.id,
        kind,
        tier,
        heroIds,
        startedAt: now,
        endsAt: now + dungeon.durationMinutes * MINUTE,
        placeExpiresAt: spawn.expiresAt,
        won: run.bossDefeated,
        hp: run.hp,
        salvaged: untriggeredSalvage(party, run, { barren: false, gold: 0 }),
        reward,
      },
    ],
    // The escort hero set out with the player instead: the background task stands down.
    escort: save.escort && heroIds.includes(save.escort.heroId) ? null : save.escort,
    nextUid: save.nextUid + 1,
  };
}

/** The party's chances at a place now, with the HP the heroes have. */
export function placeFightOdds(save: SaveData, spawn: PlaceSpawn, heroIds: string[], now: number, runs = ODDS_RUNS): Odds {
  const kind = spawn.kind;
  if (!isFightPlace(kind)) throw new Error(`No fight at a ${kind}`);
  return estimatePartyOdds(prepareParty(save, heroIds, now, true), placeFightDungeon(spawn, highestUnlockedTier(save)), runs, placeRunOptions(save, spawn));
}

/**
 * Settles the fights whose time is up: heroes come back with the HP the run
 * left them, and a win pays its rewards and hides the place until it expires.
 * A lost fight leaves the place on the map.
 */
export function resolvePlaceFights(save: SaveData, now: number): { save: SaveData; resolved: PlaceFight[] } {
  const due = save.placeFights.filter((fight) => fight.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  if (due.length === 0) return { save, resolved: [] };

  let next: SaveData = { ...save, placeFights: save.placeFights.filter((fight) => fight.endsAt > now) };
  for (const fight of due) {
    next = settleConsumables(next, fight.heroIds, fight.salvaged);
    if (fight.won) {
      next = grantPlaceReward(next, fight.heroIds, fight.reward);
      next = { ...next, usedPlaces: { ...next.usedPlaces, [fight.placeId]: fight.placeExpiresAt } };
    }
    next = applyRunHp(next, fight.hp, fight.endsAt);
  }
  return { save: next, resolved: due };
}

/** Live monster lairs around a position: each one boosts nearby patrol spawns. */
export function activeLairs(position: LatLng, timeMs: number, usedPlaces: Record<string, number>): LatLng[] {
  return placesAround(position, timeMs, [placeGroupOf('monsterLair')])
    .filter((spawn) => spawn.kind === 'monsterLair' && spawn.startsAt <= timeMs && spawn.expiresAt > timeMs && !(spawn.id in usedPlaces))
    .map((spawn) => spawn.position);
}
