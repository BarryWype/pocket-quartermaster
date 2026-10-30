import { expeditionRules } from '@/content/dungeons';
import { mobById, placeMobId } from '@/content/enemies';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { placeInfo, placeRules, type PlaceKind } from '@/content/places';

import { ELEMENTS, type Element } from '../elements';
import { estimatePartyOdds, ODDS_RUNS, type Odds } from '../expeditions/odds';
import { highestUnlockedTier, untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type RunOptions } from '../expeditions/simulate';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { foughtEnemies, settleConsumables } from '../patrols/fight';
import { rollForSave, sourceAmounts } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { emptyLoot, type Loot } from '../loot/types';
import type { SaveData } from '../save';
import { applyRunHp, isExhausted } from '../team/health';
import { isAway } from '../team/team';
import type { ActiveThreat, Briefing, BossDef, DungeonDef, EncounterDef, PlaceFight } from '../types';
import { placeGroupOf, placesAround, type PlaceSpawn } from './generate';

const MINUTE = 60_000;

/** The kinds of places home heroes can fight at. */
export const isFightPlace = (kind: PlaceKind): kind is FightPlaceKind => kind in placeFightRules.kinds;

const rulesOf = (kind: FightPlaceKind) => placeFightRules.kinds[kind];

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
  const { gold, xp } = sourceAmounts(kind, tier);
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
    xp,
  };
}

/**
 * What a win at a place pays: its row of the loot matrix, at the player's
 * tier. A rift's shards are its element; the lair's are rolled.
 */
export function placeLoot(kind: FightPlaceKind, save: SaveData, luck: number, enemies: string[], rng: Rng, element?: Element): Loot {
  return rollForSave(save, kind, rng, { luck, enemies, ...(element ? { element } : {}) });
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
  const reward: Loot = run.bossDefeated
    ? placeLoot(
        kind,
        save,
        party.reduce((sum, m) => sum + m.luck, 0),
        foughtEnemies(run),
        createRng(`${id}|rewards`),
        kind === 'elementalRift' ? riftElement(spawn) : undefined,
      )
    : emptyLoot();

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
        salvaged: untriggeredSalvage(party, run),
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
      next = grantLoot(next, fight.heroIds, fight.reward, fight.endsAt);
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
