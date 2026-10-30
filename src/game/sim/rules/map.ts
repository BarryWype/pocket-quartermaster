import { dungeons } from '@/content/dungeons';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import type { PlaceKind } from '@/content/places';
import { weaknessByBoss } from '@/content/weaknesses';

import { distanceMeters } from '../../generation/geo';
import type { LatLng } from '../../generation/types';
import type { Loot, LootSourceId } from '../../loot/types';
import { fish, fishProblem } from '../../places/dock';
import { placeFightBriefing, placeFightDungeon, placeFightProblem, resolvePlaceFights, startPlaceFight } from '../../places/fights';
import { placesWithin, type PlaceSpawn } from '../../places/generate';
import { heistOdds, heistProblem, resolveHeists, startHeist } from '../../places/heists';
import { digProblem, digRuin } from '../../places/ruins';
import { buy, buyProblem, placeStock, stockLeft } from '../../places/shops';
import { blessRelics as blessAtChapel, blessRelicsProblem } from '../../places/services';
import { underwaterBriefing, underwaterDungeonFor, underwaterLaunchProblem, launchUnderwater } from '../../secrets/dungeon';
import { hasKey } from '../../secrets/keys';
import { isPlaceRevealed, isRevealed } from '../../reveal/reveal';
import { enterProblem, enterSecret, recruitAtSecret, secretRecruit, secretRecruitProblem } from '../../secrets/places';
import { secretPlaces } from '../../secrets/tips';
import { isExhausted } from '../../team/health';
import { act, bestParty, countLoot, highestTier, homeHeroes, mark, nextForgeRecipe, skip, takeVisit, withLoadout, type PlaceRow, type Sim } from '../bot';
import { emptySlots } from './loadout';

const MINUTE = 60_000;
/** How far from the player the walk looks for a place to visit. */
const SEARCH_METERS = 2000;
/** How far the bot goes to buy the boss's weakness item. */
const BUY_METERS = 1500;

/** The nearest spawn of the kind that `accepts` passes, or undefined. */
export function nearestSpawn(spawns: PlaceSpawn[], kind: PlaceKind, position: LatLng, accepts: (spawn: PlaceSpawn) => boolean): PlaceSpawn | undefined {
  return spawns
    .filter((spawn) => spawn.kind === kind && accepts(spawn))
    .sort((a, b) => distanceMeters(position, a.position) - distanceMeters(position, b.position))[0];
}

/** The nearest live spawn of the kind around the player that the game would let them use. */
const spawnFor = (sim: Sim, kind: PlaceKind, accepts: (spawn: PlaceSpawn) => boolean) =>
  nearestSpawn(placesWithin(sim.location, SEARCH_METERS, sim.now), kind, sim.location, accepts);

/** Logs a place visit. */
const row = (sim: Sim, kind: string, tier: number, odds: number | null, won: boolean | null) => {
  const visit: PlaceRow = { day: sim.day, kind, tier, odds, won };
  sim.log.places.push(visit);
};

/** A fight event or the monster lair: the best party, started and resolved at once. */
function fightAt(sim: Sim, kind: FightPlaceKind): boolean {
  const tier = highestTier(sim.save);
  const candidates = homeHeroes(sim.save)
    .filter((h) => !isExhausted(h, sim.now))
    .map((h) => h.id);
  const probe = candidates.slice(0, placeFightRules.kinds[kind].party);
  const spawn = spawnFor(sim, kind, (s) => placeFightProblem(sim.save, s, probe, s.position, sim.now) === null);
  if (!spawn) return false;
  const dungeon = placeFightDungeon(spawn, tier);
  const briefing = placeFightBriefing(sim.save, spawn);
  const party = bestParty(sim, dungeon, candidates, briefing);
  if (party.heroIds.length === 0 || party.odds.success < sim.config.odds.place) return false;
  sim.save = withLoadout(emptySlots(sim.save, party.heroIds), party.heroIds, dungeon, briefing);
  if (placeFightProblem(sim.save, spawn, party.heroIds, spawn.position, sim.now) !== null) return false;
  const endsAt = sim.now + dungeon.durationMinutes * MINUTE;
  let won = false;
  act(sim, 'place', (save) => startPlaceFight(save, spawn, party.heroIds, spawn.position, sim.now));
  act(sim, 'place', (save) => {
    const done = resolvePlaceFights(save, endsAt);
    for (const fight of done.resolved) {
      if (fight.placeId === spawn.id) won = fight.won;
      if (fight.won) countLoot(sim, fight.reward);
    }
    return done.save;
  });
  row(sim, spawn.kind, tier, party.odds.success, won);
  return true;
}

/** Digs the nearest ruin: its loot row, and a relic on the dig that completes the set. */
function digAt(sim: Sim): boolean {
  const spawn = spawnFor(sim, 'ruins', (s) => digProblem(sim.save, s, s.position, sim.now) === null);
  if (!spawn) return false;
  let relic = false;
  let loot: Loot | null = null;
  act(sim, 'ruinsDig', (save) => {
    const dug = digRuin(save, spawn, spawn.position, sim.now);
    relic = dug.relic;
    loot = dug.reward;
    return dug.save;
  });
  if (loot) countLoot(sim, loot);
  if (relic) {
    mark(sim, 'relicFound');
    sim.log.loot.relics = (sim.log.loot.relics ?? 0) + 1;
  }
  row(sim, spawn.kind, highestTier(sim.save), null, null);
  return true;
}

/** Robs the nearest thieves' guild with the home hero best at its locks. */
function heistAt(sim: Sim): boolean {
  const hero = homeHeroes(sim.save)
    .filter((h) => !isExhausted(h, sim.now))
    .sort((a, b) => heistOdds(sim.save, b.id) - heistOdds(sim.save, a.id))[0];
  if (!hero) return false;
  const odds = heistOdds(sim.save, hero.id);
  if (odds < sim.config.odds.heist) return false;
  const spawn = spawnFor(sim, 'thievesGuild', (s) => heistProblem(sim.save, s, hero.id, s.position, sim.now) === null);
  if (!spawn) return false;
  let won = false;
  act(sim, 'heist', (save) => startHeist(save, spawn, hero.id, spawn.position, sim.now));
  const endsAt = sim.save.heists.find((h) => h.placeId === spawn.id)!.endsAt;
  act(sim, 'heist', (save) => {
    const done = resolveHeists(save, endsAt);
    for (const heist of done.resolved) {
      if (heist.placeId === spawn.id) won = heist.success;
      if (heist.success) countLoot(sim, heist.reward);
    }
    return done.save;
  });
  row(sim, spawn.kind, highestTier(sim.save), odds, won);
  return true;
}

/** One catch at the nearest dock. */
function fishAt(sim: Sim): boolean {
  const spawn = spawnFor(sim, 'fishingDock', (s) => fishProblem(sim.save, s, s.position, sim.now) === null);
  if (!spawn) return false;
  let loot: Loot | null = null;
  act(sim, 'fishingDock', (save) => {
    const caught = fish(save, spawn, spawn.position, sim.now);
    loot = caught.loot;
    return caught.save;
  });
  if (loot) countLoot(sim, loot);
  row(sim, spawn.kind, highestTier(sim.save), null, null);
  return true;
}

const SOURCES: { source: LootSourceId; kind: PlaceKind }[] = [
  ...(['banditCamp', 'goblinRaid', 'beastDen', 'hauntedCrypt', 'elementalRift', 'abandonedCaravan', 'wantedOutlaw', 'monsterLair'] as FightPlaceKind[]).map(
    (kind) => ({ source: kind as LootSourceId, kind: kind as PlaceKind }),
  ),
  { source: 'ruinsDig', kind: 'ruins' },
  { source: 'heist', kind: 'thievesGuild' },
  { source: 'fishingDock', kind: 'fishingDock' },
];

/**
 * The places each walk session visits: every fight event, the lair, a ruin, a
 * heist and the dock, one per visit owed — only once the gradual reveal shows
 * the kind, the owed visit kept back until then. A visit that finds nothing
 * (or odds too low) is logged as skipped.
 */
export function visitPlaces(sim: Sim) {
  for (const { source, kind } of SOURCES) {
    if (!isPlaceRevealed(sim.save, kind)) continue;
    while (takeVisit(sim, source)) {
      const visited =
        kind === 'ruins' ? digAt(sim) : kind === 'thievesGuild' ? heistAt(sim) : kind === 'fishingDock' ? fishAt(sim) : fightAt(sim, kind as FightPlaceKind);
      if (!visited) skip(sim, source);
    }
  }
}

/** Buys the highest tier's boss its weakness item at the nearest place that stocks it. */
export function buyWeakness(sim: Sim) {
  const tier = highestTier(sim.save);
  const boss = dungeons.find((d) => d.isBoss && d.tier === tier && !sim.save.clearedDungeons.includes(d.id));
  const weakness = boss ? weaknessByBoss[boss.boss.id] : undefined;
  if (!weakness || (sim.save.consumables[weakness.itemId] ?? 0) > 0) return;
  if (!isPlaceRevealed(sim.save, weakness.place)) return;
  const spawn = nearestSpawn(placesWithin(sim.location, BUY_METERS, sim.now), weakness.place, sim.location, (s) =>
    placeStock(sim.save, s, sim.now).some((line) => line.id === weakness.itemId),
  );
  if (!spawn) return;
  const line = placeStock(sim.save, spawn, sim.now).find((l) => l.id === weakness.itemId)!;
  if (buyProblem(sim.save, spawn, line.key, 1, spawn.position, sim.now) !== null) return;
  act(sim, 'weakness', (save) => buy(save, spawn, line.key, 1, spawn.position, sim.now));
  row(sim, spawn.kind, tier, null, null);
}

/** Blesses every held holy symbol at the nearest chapel, turning them into their stronger blessed version. */
export function blessSymbols(sim: Sim) {
  if ((sim.save.consumables.holyRelics ?? 0) < 1 || !isPlaceRevealed(sim.save, 'chapel')) return;
  const spawn = nearestSpawn(placesWithin(sim.location, BUY_METERS, sim.now), 'chapel', sim.location, (s) =>
    blessRelicsProblem(sim.save, s, s.position, sim.now) === null,
  );
  if (!spawn) return;
  act(sim, 'chapel', (save) => blessAtChapel(save, spawn, spawn.position, sim.now));
  row(sim, 'chapel', highestTier(sim.save), null, null);
}

/** Buys what the next wanted forge is short of at the nearest place stocking it, when the gold covers it. */
export function buyForgeMaterials(sim: Sim) {
  const recipe = nextForgeRecipe(sim.save);
  if (!recipe) return;
  const spawns = placesWithin(sim.location, BUY_METERS, sim.now);
  for (const { materialId, amount } of recipe.inputs) {
    const missing = amount - (sim.save.materials[materialId] ?? 0);
    if (missing <= 0) continue;
    const stocked = (spawn: PlaceSpawn) => placeStock(sim.save, spawn, sim.now).find((l) => l.kind === 'material' && l.id === materialId);
    const spawn = spawns
      .filter((s) => isPlaceRevealed(sim.save, s.kind) && stocked(s))
      .sort((a, b) => distanceMeters(sim.location, a.position) - distanceMeters(sim.location, b.position))[0];
    if (!spawn) continue;
    const line = stocked(spawn)!;
    const count = Math.min(missing, stockLeft(sim.save, spawn, line));
    if (count <= 0 || buyProblem(sim.save, spawn, line.key, count, spawn.position, sim.now) !== null) continue;
    act(sim, 'materials', (save) => buy(save, spawn, line.key, count, spawn.position, sim.now));
  }
}

/** The tipped underwater dungeon, launched with the best party when its odds reach the place threshold. */
function underwaterAt(sim: Sim, place: PlaceSpawn): boolean {
  if (underwaterLaunchProblem(sim.save, place, place.position, sim.now) !== null) return false;
  const dungeon = underwaterDungeonFor(sim.save);
  const briefing = underwaterBriefing(sim.save, place);
  const party = bestParty(sim, dungeon, homeHeroes(sim.save).map((h) => h.id), briefing);
  if (party.heroIds.length === 0 || party.odds.success < sim.config.odds.place) return false;
  sim.save = withLoadout(emptySlots(sim.save, homeHeroes(sim.save).map((h) => h.id)), party.heroIds, dungeon, briefing);
  act(sim, 'secret', (save) => launchUnderwater(save, place, party.heroIds, place.position, sim.now));
  mark(sim, 'secretPlace');
  row(sim, place.kind, dungeon.tier, party.odds.success, null);
  return true;
}

/** Opens every tipped secret place the player can: dens and markets are entered and their rare class hired. */
export function openSecrets(sim: Sim) {
  if (!isRevealed(sim.save, 'secrets')) return;
  for (const place of secretPlaces(sim.save, sim.now)) {
    if (place.kind === 'underwaterDungeon') {
      underwaterAt(sim, place);
      continue;
    }
    if (!hasKey(sim.save) || enterProblem(sim.save, place, place.position, sim.now) !== null) continue;
    act(sim, 'secret', (save) => enterSecret(save, place, place.position, sim.now));
    mark(sim, 'secretPlace');
    row(sim, place.kind, highestTier(sim.save), null, null);
    const offer = secretRecruit(sim.save, place);
    sim.log.offered[offer.id] = offer.classId;
    if (secretRecruitProblem(sim.save, place, place.position, sim.now) === null) {
      act(sim, 'secret', (save) => recruitAtSecret(save, place, place.position, sim.now));
      sim.log.recruits.push({ day: sim.day, classId: offer.classId, price: offer.price, trait: offer.trait });
      mark(sim, `recruit:${sim.save.heroes.length}`);
    }
  }
}
