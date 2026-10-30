import { gatheringConfig } from '@/content/gatheringConfig';
import { rosterRules } from '@/content/roster';
import { MASTERY_TYPES } from '@/content/forging';
import { guildTracks } from '@/content/guild';
import { REVEAL_KINDS } from '@/content/reveal';
import { dungeonById, itemById, recipeById } from '@/content/lookup';
import { components } from '@/content/loot/components';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { dailyRotation, rotationDay } from '../dungeons/rotation';
import { startExpedition } from '../expeditions/expeditions';
import { mealItems, supplyHeld } from '../expeditions/provisions';
import { masteryOf } from '../forging/mastery';
import { rollToScale } from '../forging/roll';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { rosterCap } from '../guild/guild';
import { applyTraining } from '../guild/training';
import { TRAVELLER_KINDS, isTravellerKind, patrolsAround, patrolPositionAt, patrolTier, type PatrolKind, type PatrolSpawn, type PatrolSubject } from '../patrols/generate';
import { PATROL_SOURCES, patrolOdds, resolvePatrolFights, startPatrolFight } from '../patrols/fight';
import { isGone } from '../patrols/visibility';
import { acceptRecruit, helpProblem, helpTraveller, trade, traderOffers } from '../patrols/travellers';
import { activateLure, isLureActive } from '../rewards/lures';
import { chestState, openChest, recordSteps, stepChests, stepsRecorded } from '../rewards/chests';
import { generateSanctumsAround } from '../sanctums/sanctums';
import { hasKey } from '../secrets/keys';
import { isRevealed } from '../reveal/reveal';
import { createInitialSave, type SaveData } from '../save';
import { generateTavernsAround } from '../taverns/taverns';
import { currentHp, isExhausted } from '../team/health';
import { equip } from '../team/team';
import { advanceTutorial, finishTutorial, nextTutorialStep } from '../tutorial/tutorial';
import { collectTutorialSpawn, placeTutorialSpawns, shownTutorialSpawns } from '../tutorial/spawns';
import { addMaterials } from '../inventory';
import type { LootSourceId } from '../loot/types';
import { pruneExpired, rollDailyApproaches } from '../upkeep';
import {
  act,
  buyGuildRanks,
  skip,
  takeVisit,
  challengeSanctums,
  collectExpedition,
  digTreasure,
  doQuests,
  forge,
  highestTier,
  homeHeroes,
  infuseWeapons,
  mark,
  markCoreKit,
  noteQuestGathers,
  reachChance,
  recruitHeroes,
  sendExpeditions,
  spendPicks,
  stockProvisions,
  type RunLog,
  type Sim,
  countLoot,
  emptyLog,
} from './bot';
import { probe } from './probe';
import { forgeComponents, restoreRelics } from './rules/forge';
import { craftCharms, craftStatPotions, readManuals, sellMaterials, sellValuables } from './rules/inventory';
import { buyWeakness, openSecrets, visitPlaces } from './rules/map';
import { profiles, simConfig, type Profile, type SimConfig } from './config';
import { targets } from './targets';
import { PICKAXES, bonusScaled, walkYield, type WalkRates } from './walking';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RunOptions = {
  profile: string;
  seed: string;
  rates: WalkRates;
  /** Stops earlier than the profile's day cap. */
  maxDays?: number;
  config?: SimConfig;
  /** Called after every session, e.g. to check the save. */
  afterSession?: (save: SaveData) => void;
  /** Called at the end of each simulated day, after the daily row is pushed. */
  afterDay?: (day: number, save: SaveData) => void;
};

/** Throws if the save is in a state the game should never allow. */
export function checkSave(save: SaveData) {
  if (save.gold < 0) throw new Error(`Negative gold: ${save.gold}`);
  for (const [id, amount] of Object.entries(save.materials)) if (amount < 0) throw new Error(`Negative ${id}`);
  for (const [id, amount] of Object.entries(save.consumables)) if (amount < 0) throw new Error(`Negative ${id}`);
  if (save.heroes.length > rosterCap(save)) throw new Error('Roster over its cap');
  for (const hero of save.heroes) {
    const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
    if (weapon && (itemById[weapon.itemId] as { slot?: string }).slot !== 'weapon') throw new Error(`${hero.id} wields ${weapon.itemId}`);
    if (save.expeditions.filter((e) => e.heroIds.includes(hero.id)).length > 1) throw new Error(`${hero.id} is on two expeditions`);
  }
}

/** The tutorial, through the same pure functions the screens call, played out at the sim's spot. */
function playTutorial(sim: Sim) {
  const warrior = sim.save.heroes.find((h) => h.classId === 'warrior')!;
  const pick = () => {
    for (const spawn of shownTutorialSpawns(sim.save)) {
      const result = collectTutorialSpawn(sim.save, spawn.id, sim.location, sim.now, { anywhere: true });
      if (result.ok) sim.save = result.save;
    }
    sim.save = advanceTutorial(sim.save);
  };

  sim.save = placeTutorialSpawns(sim.save, sim.location, null, sim.now);
  pick();
  act(sim, 'forge', (save) => craft(save, recipeById.sword1));
  const sword = sim.save.gear[sim.save.gear.length - 1];
  const wood = recipeById.sword1.inputs[0].amount;
  sim.log.crafts.push({ day: sim.day, kind: 'tutorial', itemId: sword.itemId, tier: 1, quality: sword.quality, roll: rollToScale(sword.roll ?? 1), mastery: masteryOf(sim.save, 'sword').level, materials: { wood: -wood } });
  sim.save = advanceTutorial(equip(sim.save, warrior.id, 'weapon', sword.uid));
  sim.save = nextTutorialStep(sim.save, 'seeThreat', sim.now);

  sim.save = placeTutorialSpawns(sim.save, sim.location, null, sim.now);
  pick();
  act(sim, 'provisions', (save) => craft(save, recipeById.huntersPack));
  sim.save = advanceTutorial(equip(sim.save, sim.save.heroes[0].id, 'consumable', tutorialRules.kitRecipe));
  sim.save = advanceTutorial(sim.save);
  sim.save = startExpedition(sim.save, tutorialRules.dungeonId, sim.save.heroes.map((h) => h.id), sim.now, 1, sim.rotation);
  collectExpedition(sim, sim.save.expeditions[0]);
  sim.save = nextTutorialStep(sim.save, 'readReport', sim.now);
  sim.save = finishTutorial(sim.save, sim.now);
}

/** A walk's materials at measured rates; its first gathers of the day get the walking bonus (logged as `<source>Bonus`). */
function walk(sim: Sim, source: string, perMinute: Record<string, number>, gathersPerMinute: number, minutes: number) {
  const gathers = gathersPerMinute * minutes;
  const bonusGathers = Math.min(sim.bonusGathers, gathers);
  const bonusMinutes = gathers > 0 ? (bonusGathers / gathers) * minutes : 0;
  const gained = act(sim, source, (save) => ({
    ...save,
    materials: addMaterials(save.materials, walkYield(perMinute, minutes - bonusMinutes, sim.rng, sim.config)),
  }));
  noteQuestGathers(sim, gained);
  if (bonusMinutes > 0) {
    const bonus = act(sim, `${source}Bonus`, (save) => ({
      ...save,
      materials: addMaterials(save.materials, bonusScaled(walkYield(perMinute, bonusMinutes, sim.rng, sim.config))),
    }));
    noteQuestGathers(sim, bonus);
    sim.bonusGathers -= bonusGathers;
  }
}

/** The odds a party must reach for the bot to fight a patrol itself. */
const ENGAGE_ODDS = 0.75;
/** A pilgrim is paid from the supply stock while this many points are held, else with a meal. */
const PILGRIM_SUPPLY_STOCK = 8;
/** Places the walk looks for a patrol or traveller: around home, then this far along each of 8 bearings. */
const SEARCH_METERS = [0, 500, 1000];

const PATROL_VISITS: [LootSourceId, PatrolKind][] = (Object.entries(PATROL_SOURCES) as [PatrolKind, LootSourceId][]).map(([kind, source]) => [source, kind]);

/** A live spawn of one of these kinds the walk can meet now, not beaten or helped yet. */
function findSpawn(sim: Sim, kinds: PatrolSubject[]): PatrolSpawn | null {
  const gone = { ...sim.save.beatenPatrols, ...sim.save.helpedTravellers };
  for (const meters of SEARCH_METERS) {
    for (let bearing = 0; bearing < (meters ? 8 : 1); bearing++) {
      const angle = (bearing / 8) * 2 * Math.PI;
      const at = offsetPosition(sim.location, Math.cos(angle) * meters, Math.sin(angle) * meters);
      const live = patrolsAround(at, sim.now).filter((s) => kinds.includes(s.kind) && !sim.met.has(s.id) && !isGone(s, gone, sim.now));
      if (live.length) return live[sim.rng.int(0, live.length - 1)];
    }
  }
  return null;
}

/** The patrols and travellers the profile meets on this walk, once the map shows them. */
function meetPatrols(sim: Sim) {
  if (!isRevealed(sim.save, 'patrols')) return;
  for (const [source, kind] of PATROL_VISITS) {
    while (takeVisit(sim, source)) {
      const spawn = findSpawn(sim, [kind]);
      if (!spawn) {
        skip(sim, source);
        continue;
      }
      sim.met.add(spawn.id);
      const { tier, elite } = patrolTier(spawn, highestTier(sim.save));
      sim.log.patrols.seen.push({ kind, tier, elite });
      if (!engagePatrol(sim, spawn, sim.now, patrolPositionAt(spawn, sim.now))) skip(sim, source);
    }
  }
  while (takeVisit(sim, 'traveller')) {
    const spawn = findSpawn(sim, TRAVELLER_KINDS);
    if (!spawn) {
      skip(sim, 'traveller');
      continue;
    }
    sim.met.add(spawn.id);
    const { tier, elite } = patrolTier(spawn, highestTier(sim.save));
    sim.log.patrols.seen.push({ kind: spawn.kind, tier, elite });
    helpTravellerSpawn(sim, spawn, sim.now, patrolPositionAt(spawn, sim.now));
  }
}

/** The bot fights the patrol itself: the cheapest party whose odds reach ENGAGE_ODDS, healthiest heroes first. */
function engagePatrol(sim: Sim, spawn: PatrolSpawn, at: number, player: LatLng) {
  const candidates = homeHeroes(sim.save)
    .filter((h) => !isExhausted(h, at))
    .sort((a, b) => currentHp(sim.save, b, at) - currentHp(sim.save, a, at));
  const full = Math.min(rosterRules.partySize, candidates.length);
  for (let size = 1; size <= full; size++) {
    const heroIds = candidates.slice(0, size).map((h) => h.id);
    if (patrolOdds(sim.save, spawn, heroIds, at, sim.config.odds.runs).success < ENGAGE_ODDS) continue;
    const id = `p${sim.save.nextUid}`;
    const fighting = startPatrolFight(sim.save, spawn, heroIds, player, at);
    const fight = fighting.patrolFights.find((f) => f.id === id)!;
    const { save } = resolvePatrolFights(fighting, fight.endsAt);
    act(sim, 'patrol', () => save);
    sim.log.patrols.fights.push({ kind: fight.kind, tier: fight.tier, elite: fight.elite, won: fight.won, xp: fight.won ? fight.rewards.xp * heroIds.length : 0 });
    if (fight.won) countLoot(sim, fight.rewards);
    return true;
  }
  return false;
}

/** Wounded travellers get a potion, pilgrims a meal (supply while the stock is deep), traders are traded with. */
function helpTravellerSpawn(sim: Sim, spawn: PatrolSpawn, at: number, player: LatLng) {
  const log = sim.log.patrols;
  const kind = spawn.kind;
  if (!isTravellerKind(kind)) return;
  if (kind === 'trader') {
    let traded = false;
    for (const offer of traderOffers(spawn, sim.save)) {
      for (let used = 0; used < offer.usesLeft && (sim.save.materials[offer.give.materialId] ?? 0) > targets.unusedStockpile; used++) {
        act(sim, 'trader', (save) => trade(save, spawn, offer.index, player, at));
        log.trades++;
        traded = true;
      }
    }
    if (traded) log.travellers.trader++;
    return;
  }
  if (helpProblem(sim.save, spawn, player, at) !== null) return;
  const choice =
    kind === 'pilgrim'
      ? supplyHeld(sim.save.consumables) >= PILGRIM_SUPPLY_STOCK || !mealItems.some((i) => (sim.save.consumables[i.id] ?? 0) > 0)
        ? 'supply'
        : 'meal'
      : undefined;
  const { save, reward } = helpTraveller(sim.save, spawn, player, at, choice);
  act(sim, 'traveller', () => save);
  log.travellers[kind]++;
  log.rewards[reward.kind]++;
  if (reward.kind === 'loot') {
    log.keyFragments += reward.loot.keyFragments;
    countLoot(sim, reward.loot);
  }
  if (reward.kind === 'recruit' && save.heroes.length < rosterCap(save)) {
    act(sim, 'traveller', (next) => rollDailyApproaches(acceptRecruit(next, reward.offer), sim.now));
    log.recruits.push(sim.day);
    mark(sim, `recruit:${sim.save.heroes.length}`);
  }
}

function session(sim: Sim, walking: boolean, firstWalk: boolean, steps: number, dayKey: string) {
  sim.save = rollDailyApproaches(pruneExpired(sim.save, sim.now), sim.now);
  sim.rotation = dailyRotation(rotationDay(sim.now));

  // Walking, with a lure on the day's first walk. The day's first gathers
  // (the lure's, then the walk's) get the daily walking bonus.
  if (walking) {
    const pickaxes = PICKAXES.filter((id) => sim.save.tools.includes(id)).length;
    if (firstWalk && sim.save.lures > 0 && !isLureActive(sim.save, sim.now)) {
      const spent = Math.min(sim.bonusGathers, sim.rates.lureSpawns);
      const lureYield = spent > 0 ? bonusScaled(walkYield(sim.rates.lure, 1, sim.rng, sim.config)) : walkYield(sim.rates.lure, 1, sim.rng, sim.config);
      sim.save = activateLure(sim.save, sim.location, sim.now);
      act(sim, spent > 0 ? 'walkBonus' : 'lure', (save) => ({ ...save, materials: addMaterials(save.materials, lureYield) }));
      sim.bonusGathers -= spent;
    }
    const minutes = sim.profile.walkMinutes;
    const autoMinutes = minutes * sim.profile.autoShare;
    walk(sim, 'walk', sim.rates.perMinute[pickaxes], sim.rates.gathersPerMinute[pickaxes], minutes - autoMinutes);
    walk(sim, 'autoGather', sim.rates.autoPerMinute[pickaxes], sim.rates.autoGathersPerMinute[pickaxes], autoMinutes);
  }

  // Collect. Heroes back from an expedition are collected first, so they are home for the walk's patrols.
  const due = sim.save.expeditions.filter((e) => e.endsAt <= sim.now).sort((a, b) => a.endsAt - b.endsAt);
  for (const expedition of due) collectExpedition(sim, expedition);
  if (walking) {
    meetPatrols(sim);
    visitPlaces(sim);
    sellValuables(sim);
    sellMaterials(sim);
    buyWeakness(sim);
  }
  sim.save = applyTraining(sim.save, sim.now);
  sim.save = recordSteps(sim.save, dayKey, steps);
  for (const chest of stepChests) {
    if (chestState(sim.save, chest, stepsRecorded(sim.save, dayKey), dayKey) === 'ready') {
      const opened = openChest(sim.save, chest.id, stepsRecorded(sim.save, dayKey), dayKey, sim.now);
      countLoot(sim, opened.reward);
      act(sim, 'chest', () => opened.save);
    }
  }

  if (sim.save.tutorial.step !== 'done') playTutorial(sim);
  doQuests(sim, walking);
  forge(sim);
  forgeComponents(sim);
  restoreRelics(sim);
  spendPicks(sim);
  stockProvisions(sim);
  craftCharms(sim);
  craftStatPotions(sim);
  readManuals(sim);
  infuseWeapons(sim);
  openSecrets(sim);
  recruitHeroes(sim);
  buyGuildRanks(sim);
  challengeSanctums(sim);
  digTreasure(sim);
  sendExpeditions(sim);
  markCoreKit(sim);
}

/** Milestones for what a session ends with: a component, a relic, a mysterious key, a secret place tip. */
function markHoldings(sim: Sim) {
  if (components.some((c) => (sim.save.materials[c.id] ?? 0) > 0)) mark(sim, 'componentFound');
  if (sim.save.relics.length) mark(sim, 'relicFound');
  if (hasKey(sim.save)) mark(sim, 'firstKey');
  if (sim.save.secretTips.length) mark(sim, 'firstTip');
}

/** The day each map kind first shows (`reveal:${kind}`), checked once per session. */
function markReveals(sim: Sim) {
  for (const kind of REVEAL_KINDS) if (isRevealed(sim.save, kind)) mark(sim, `reveal:${kind}`);
}

/** Activities whose visits are counted per day; the others (first clears, bosses) are outcomes. */
const OUTCOMES: LootSourceId[] = ['firstTierClear', 'tierBoss', 'stepChest'];

/** The day's steps: just enough to open the profile's step chests. */
const stepsPerDay = (profile: Profile) => stepChests[Math.max(0, Math.min(stepChests.length, Math.round(profile.visits.stepChest ?? 0)) - 1)].steps;

/** Plays a profile with the bot until the tier 5 boss falls or the profile's day cap, and returns everything that happened. */
export function runSim({ profile: name, seed, rates, maxDays, config = simConfig, afterSession, afterDay }: RunOptions): RunLog {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown profile ${name}`);
  const days = maxDays ?? profile.maxDays;
  const rng = createRng(`sim|${seed}|${name}`);
  const startedAt = config.startDay + rng.int(0, config.startOffsetDays) * DAY;
  const location = config.location;
  const tavern = generateTavernsAround(location, startedAt).sort((a, b) => distanceMeters(location, a.position) - distanceMeters(location, b.position))[0];
  const hours = [...profile.sessionHours].sort((a, b) => a - b);
  const sessionTimes = (day: number) => hours.map((h) => startedAt + day * DAY + h * HOUR);
  const visits = { ...profile.visits, expeditions: (profile.visits.dungeonRun ?? 0) + (profile.visits.firstWin ?? 0), dungeonRun: 0, firstWin: 0 };
  for (const source of OUTCOMES) delete visits[source];
  const steps = stepsPerDay(profile);

  const sim: Sim = {
    save: createInitialSave(),
    now: startedAt,
    day: 1,
    startedAt,
    profile,
    config,
    rates,
    due: { quests: 0, expeditions: 0 },
    met: new Set(),
    rng,
    rotation: dailyRotation(rotationDay(startedAt)),
    location,
    tavern,
    reach: { meters: 0, tavern: false, sanctums: [], maps: new Map() },
    bonusGathers: gatheringConfig.walkingBonus.gathers,
    collectionAt: (time) => {
      const day = Math.max(0, Math.floor((time - startedAt) / DAY));
      return [...sessionTimes(day), ...sessionTimes(day + 1)].find((t) => t >= time) ?? time;
    },
    oddsCache: new Map(),
    launched: new Map(),
    waiting: new Set(),
    log: emptyLog(name, seed),
  };

  let probedTier = 0;
  for (let day = 0; day < days && !sim.log.finished; day++) {
    sim.day = day + 1;
    sim.bonusGathers = gatheringConfig.walkingBonus.gathers;
    const dayStart = startedAt + day * DAY;
    const dayKey = new Date(dayStart).toISOString().slice(0, 10);
    // Quests and expeditions owed carry over a day at most; place visits keep their fractions.
    for (const [key, perDay] of Object.entries(visits)) {
      const owed = sim.due[key] ?? 0;
      sim.due[key] = (key === 'quests' || key === 'expeditions' ? owed % 1 : owed) + (perDay ?? 0);
    }
    const meters = profile.walkHours.length * profile.walkMinutes * 60 * config.walk.speed;
    sim.reach = { meters, tavern: false, sanctums: [], maps: new Map() };
    sim.reach.tavern = rng.chance(reachChance(sim, distanceMeters(location, tavern.position)));
    // The nearest Sanctum of each kind today.
    const nearest = new Map<string, ReturnType<typeof generateSanctumsAround>[number]>();
    for (const spawn of generateSanctumsAround(location, dayStart + HOUR)) {
      const known = nearest.get(spawn.sanctumId);
      if (!known || distanceMeters(location, spawn.position) < distanceMeters(location, known.position)) nearest.set(spawn.sanctumId, spawn);
    }
    sim.reach.sanctums = [...nearest.values()].filter((s) => rng.chance(reachChance(sim, distanceMeters(location, s.position))));

    let idle = 0;
    sessionTimes(day).forEach((time, i) => {
      sim.now = time;
      session(sim, profile.walkHours.includes(hours[i]), hours[i] === Math.min(...profile.walkHours), steps / hours.length, dayKey);
      idle += homeHeroes(sim.save).length / sim.save.heroes.length;
      markHoldings(sim);
      markReveals(sim);
      const bossOut = sim.save.expeditions.some((x) => dungeonById[x.dungeonId].isBoss && dungeonById[x.dungeonId].tier === highestTier(sim.save));
      if (bossOut || highestTier(sim.save) !== probedTier || (sim.day % config.probeEveryDays === 0 && i === hours.length - 1)) {
        probedTier = highestTier(sim.save);
        sim.log.probes.push(...probe(sim));
      }
      afterSession?.(sim.save);
    });

    const save = sim.save;
    sim.log.days = sim.day;
    sim.log.finished = 'boss:5' in sim.log.milestones;
    sim.log.daily.push({
      day: sim.day,
      gold: save.gold,
      tier: highestTier(save),
      roster: save.heroes.length,
      avgLevel: save.heroes.reduce((s, h) => s + h.level, 0) / save.heroes.length,
      maxLevel: Math.max(...save.heroes.map((h) => h.level)),
      idle: idle / hours.length,
      pickaxes: PICKAXES.filter((id) => save.tools.includes(id)).length,
      sigils: save.sigils.length,
      guildRanks: guildTracks.reduce((s, t) => s + (save.guild[t.id] ?? 0), 0),
      mastery: Object.fromEntries(MASTERY_TYPES.map((t) => [t, masteryOf(save, t).level])),
      stock: { ...save.materials },
      consumables: { ...save.consumables },
      valuables: { ...save.valuables },
      topLevel: [...save.heroes.map((h) => h.level)].sort((a, b) => b - a).slice(0, 3).reduce((a, b, _, all) => a + b / all.length, 0),
    });
    afterDay?.(sim.day, sim.save);
  }
  sim.log.knownRecipes = [...sim.save.knownRecipes];
  return sim.log;
}
