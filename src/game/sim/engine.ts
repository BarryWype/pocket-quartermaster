import { chests } from '@/content/chests';
import { gatheringConfig } from '@/content/gatheringConfig';
import { MASTERY_TYPES } from '@/content/forging';
import { guildTracks } from '@/content/guild';
import { itemById, recipeById } from '@/content/lookup';
import { patrolRules } from '@/content/patrols';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { dailyRotation, rotationDay } from '../dungeons/rotation';
import { startExpedition } from '../expeditions/expeditions';
import { mealItems, supplyHeld } from '../expeditions/provisions';
import { masteryOf } from '../forging/mastery';
import { rollToScale } from '../forging/roll';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { windowIndex, windowRange } from '../generation/time';
import type { LatLng } from '../generation/types';
import { partySize, rosterCap } from '../guild/guild';
import { applyTraining } from '../guild/training';
import { applyBackgroundResults, backgroundStep, snapshotBackground, type PatrolSettings } from '../patrols/escort';
import { PATROL_KINDS, TRAVELLER_KINDS, isTravellerKind, patrolsAround, patrolPositionAt, patrolTier, type PatrolSpawn, type PatrolSubject, type TierRoll } from '../patrols/generate';
import { patrolOdds, resolvePatrolFights, startPatrolFight } from '../patrols/fight';
import { isGone } from '../patrols/visibility';
import { acceptRecruit, helpProblem, helpTraveller, trade, traderOffers } from '../patrols/travellers';
import { activateLure, isLureActive } from '../rewards/lures';
import { chestState, openChest, recordSteps, stepsRecorded } from '../rewards/chests';
import { generateSanctumsAround } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '../save';
import { generateTavernsAround } from '../taverns/taverns';
import { currentHp, isExhausted } from '../team/health';
import { canWield, equip } from '../team/team';
import { advanceTutorial, finishTutorial } from '../tutorial/tutorial';
import { addMaterials } from '../inventory';
import { pruneExpired } from '../upkeep';
import {
  act,
  buyGuildRanks,
  challengeSanctums,
  collectExpedition,
  digTreasure,
  forge,
  highestTier,
  homeHeroes,
  infuseWeapons,
  mark,
  markCoreKit,
  reachChance,
  recruitHeroes,
  sendExpeditions,
  stockProvisions,
  type RunLog,
  type Sim,
} from './bot';
import { profiles, simConfig, type SimConfig } from './config';
import type { PatrolRates } from './patrols';
import { targets } from './targets';
import { PICKAXES, bonusScaled, roundRandom, walkYield, type WalkRates } from './walking';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

export type RunOptions = {
  profile: string;
  days: number;
  seed: string;
  rates: WalkRates;
  patrolRates: PatrolRates;
  config?: SimConfig;
  /** Called after every session, e.g. to check the save. */
  afterSession?: (save: SaveData) => void;
};

/** Throws if the save is in a state the game should never allow. */
export function checkSave(save: SaveData) {
  if (save.gold < 0) throw new Error(`Negative gold: ${save.gold}`);
  for (const [id, amount] of Object.entries(save.materials)) if (amount < 0) throw new Error(`Negative ${id}`);
  for (const [id, amount] of Object.entries(save.consumables)) if (amount < 0) throw new Error(`Negative ${id}`);
  if (save.heroes.length > rosterCap(save)) throw new Error('Roster over its cap');
  for (const hero of save.heroes) {
    const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
    if (weapon && !canWield(hero, itemById[weapon.itemId])) throw new Error(`${hero.id} wields ${weapon.itemId}`);
    if (save.expeditions.filter((e) => e.heroIds.includes(hero.id)).length > 1) throw new Error(`${hero.id} is on two expeditions`);
  }
}

/** The tutorial, through the same functions the screens call, then skipped to the end. */
function playTutorial(sim: Sim) {
  const wood = recipeById.woodSword.inputs[0].amount;
  // The guaranteed tutorial node gives exactly the sword's wood.
  if ((sim.save.materials.wood ?? 0) < wood) act(sim, 'walk', (save) => ({ ...save, materials: { ...save.materials, wood } }));
  sim.save = advanceTutorial(sim.save);
  act(sim, 'forge', (save) => craft(save, recipeById.woodSword));
  const sword = sim.save.gear[sim.save.gear.length - 1];
  sim.log.crafts.push({ day: sim.day, kind: 'tutorial', itemId: sword.itemId, tier: 1, quality: sword.quality, roll: rollToScale(sword.roll ?? 1), mastery: masteryOf(sim.save, 'sword').level, materials: { wood: -wood } });
  sim.save = advanceTutorial(equip(sim.save, sim.save.heroes[0].id, 'weapon', sword.uid));
  sim.save = startExpedition(sim.save, tutorialRules.firstExpedition.dungeonId, sim.save.heroes.map((h) => h.id), sim.now, 1, sim.rotation);
  collectExpedition(sim, sim.save.expeditions[0]);
  sim.save = finishTutorial(sim.save);
}

/** A walk's materials at measured rates; its first gathers of the day get the walking bonus (logged as `<source>Bonus`). */
function walk(sim: Sim, source: string, perMinute: Record<string, number>, gathersPerMinute: number, minutes: number) {
  const gathers = gathersPerMinute * minutes;
  const bonusGathers = Math.min(sim.bonusGathers, gathers);
  const bonusMinutes = gathers > 0 ? (bonusGathers / gathers) * minutes : 0;
  act(sim, source, (save) => ({
    ...save,
    materials: addMaterials(save.materials, walkYield(perMinute, minutes - bonusMinutes, sim.rng, sim.config)),
  }));
  if (bonusMinutes > 0) {
    act(sim, `${source}Bonus`, (save) => ({
      ...save,
      materials: addMaterials(save.materials, bonusScaled(walkYield(perMinute, bonusMinutes, sim.rng, sim.config))),
    }));
    sim.bonusGathers -= bonusGathers;
  }
}

/** The odds a party must reach for the bot to fight a patrol itself. */
const ENGAGE_ODDS = 0.75;
/** A pilgrim is paid from the supply stock while this many points are held, else with a meal. */
const PILGRIM_SUPPLY_STOCK = 8;

/** Keeps the save's escort hero set: the home hero with the most current HP, as the game's setEscort screen does. */
function setEscort(sim: Sim, at: number) {
  const home = homeHeroes(sim.save)
    .filter((h) => !isExhausted(h, at))
    .sort((a, b) => currentHp(sim.save, b, at) - currentHp(sim.save, a, at))[0];
  if (home) sim.save = { ...sim.save, escort: { heroId: home.id } };
}

/** Patrols and travellers met on this session's walk, at the measured sighting rate. */
function patrolSession(sim: Sim, minutes: number) {
  const log = sim.log.patrols;
  if (sim.profile.pocketEscort) setEscort(sim, sim.now);

  const drawn: { kind: PatrolSubject; tierRoll: TierRoll; at: number; example: PatrolSpawn }[] = [];
  for (const kind of [...PATROL_KINDS, ...TRAVELLER_KINDS]) {
    for (const tierRoll of ['current', 'below', 'elite'] as TierRoll[]) {
      const examples = (sim.patrolRates.examples[kind] ?? {})[tierRoll] ?? [];
      if (!examples.length) continue;
      const seen = roundRandom((sim.patrolRates.perKindRoll[kind] ?? {})[tierRoll] * minutes, sim.rng);
      for (let n = 0; n < seen; n++) {
        drawn.push({ kind, tierRoll, at: sim.now + sim.rng.next() * minutes * MINUTE, example: examples[n % examples.length] });
      }
    }
  }
  drawn.sort((a, b) => a.at - b.at);

  const placed = new Set<string>();
  for (const { kind, tierRoll, at, example } of drawn) {
    // What the walk met: a spawn the game itself has around the player right
    // now, so the background rules can find it too — else a live copy of the
    // example, with this window and a fresh id, so its window covers `at`.
    const live = patrolsAround(sim.location, at).filter(
      (s) => s.kind === kind && s.tierRoll === tierRoll && !placed.has(s.id) && !isGone(s, { ...sim.save.beatenPatrols, ...sim.save.helpedTravellers }, at),
    );
    let spawn: PatrolSpawn;
    if (live.length) {
      spawn = live[sim.rng.int(0, live.length - 1)];
    } else {
      const window = windowIndex(at, patrolRules.windowMinutes);
      const { start, end } = windowRange(window, patrolRules.windowMinutes);
      spawn = { ...example, id: `sim:${sim.patrolSpawns++}:${window}`, window, startsAt: start, endsAt: end };
    }
    placed.add(spawn.id);
    const player = patrolPositionAt(spawn, at);
    const { tier, elite } = patrolTier(spawn, highestTier(sim.save));
    log.seen.push({ kind, tier, elite });

    if (isTravellerKind(kind)) {
      helpTravellerSpawn(sim, spawn, at, player);
      continue;
    }
    const pocket = at - sim.now >= minutes * (1 - sim.profile.autoShare) * MINUTE;
    if (pocket && sim.profile.pocketEscort && patrolRules.escort.types.includes(kind) && !elite) escortFight(sim, spawn, at, player);
    else if (sim.rng.chance(sim.profile.patrolEngageShare)) engagePatrol(sim, spawn, at, player);
  }
}

/** The escort hero takes the spawn on alone, through the game's own background rules. */
function escortFight(sim: Sim, spawn: PatrolSpawn, at: number, player: LatLng) {
  setEscort(sim, at); // a fight may have stood the escort down; point it at the healthiest hero again
  const settings: PatrolSettings = { escortHeroId: sim.save.escort?.heroId ?? null, alertFor: 'off', patrolAlerts: false, escortAlerts: false };
  const stepped = backgroundStep(snapshotBackground(sim.save, settings, at), [{ position: player, timestamp: at }], at);
  const result = stepped.state.pending[0];
  if (result) {
    act(sim, 'escortPatrol', (save) => applyBackgroundResults(save, stepped.state.pending, at));
    sim.log.patrols.escortFights.push({ kind: result.kind, tier: result.tier, won: result.won, knockout: result.hpAfter <= 0, xp: result.won ? result.rewards.xp : 0 });
  } else if (stepped.state.escort?.paused) {
    sim.log.patrols.escortPauses++;
  }
}

/** The bot fights the patrol itself: the cheapest party whose odds reach ENGAGE_ODDS, healthiest heroes first. */
function engagePatrol(sim: Sim, spawn: PatrolSpawn, at: number, player: LatLng) {
  const candidates = homeHeroes(sim.save)
    .filter((h) => !isExhausted(h, at))
    .sort((a, b) => currentHp(sim.save, b, at) - currentHp(sim.save, a, at));
  const full = Math.min(partySize(sim.save), candidates.length);
  for (let size = 1; size <= full; size++) {
    const heroIds = candidates.slice(0, size).map((h) => h.id);
    if (patrolOdds(sim.save, spawn, heroIds, at, sim.config.odds.runs).success < ENGAGE_ODDS) continue;
    const id = `p${sim.save.nextUid}`;
    const fighting = startPatrolFight(sim.save, spawn, heroIds, player, at);
    const fight = fighting.patrolFights.find((f) => f.id === id)!;
    const { save } = resolvePatrolFights(fighting, fight.endsAt);
    act(sim, 'patrol', () => save);
    sim.log.patrols.fights.push({ kind: fight.kind, tier: fight.tier, elite: fight.elite, won: fight.won, xp: fight.won ? fight.rewards.xp * heroIds.length : 0 });
    return;
  }
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
  if (reward.kind === 'keyFragment') log.keyFragments++;
  if (reward.kind === 'recruit' && sim.config.patrols.travellerRecruits && save.heroes.length < rosterCap(save)) {
    act(sim, 'traveller', (next) => acceptRecruit(next, reward.offer));
    log.recruits.push(sim.day);
    mark(sim, `recruit:${sim.save.heroes.length}`);
  }
}

function session(sim: Sim, walkMinutes: number, steps: number, dayKey: string, first: boolean) {
  sim.save = pruneExpired(sim.save, sim.now);
  sim.rotation = dailyRotation(rotationDay(sim.now));

  // Walking, with a lure on the first walk of the day. The day's first gathers
  // (the lure's, then the walk's) get the daily walking bonus.
  const pickaxes = PICKAXES.filter((id) => sim.save.tools.includes(id)).length;
  if (first && sim.save.lures > 0 && !isLureActive(sim.save, sim.now)) {
    const spent = Math.min(sim.bonusGathers, sim.rates.lureSpawns);
    const lureYield = spent > 0 ? bonusScaled(walkYield(sim.rates.lure, 1, sim.rng, sim.config)) : walkYield(sim.rates.lure, 1, sim.rng, sim.config);
    sim.save = activateLure(sim.save, sim.location, sim.now);
    act(sim, spent > 0 ? 'walkBonus' : 'lure', (save) => ({ ...save, materials: addMaterials(save.materials, lureYield) }));
    sim.bonusGathers -= spent;
  }
  const autoMinutes = walkMinutes * sim.profile.autoShare;
  walk(sim, 'walk', sim.rates.perMinute[pickaxes], sim.rates.gathersPerMinute[pickaxes], walkMinutes - autoMinutes);
  walk(sim, 'autoGather', sim.rates.autoPerMinute[pickaxes], sim.rates.autoGathersPerMinute[pickaxes], autoMinutes);

  // Collect. Heroes back from an expedition are collected first, so they are home for the walk's patrols.
  const due = sim.save.expeditions.filter((e) => e.endsAt <= sim.now).sort((a, b) => a.endsAt - b.endsAt);
  for (const expedition of due) collectExpedition(sim, expedition);
  if (sim.config.patrols.enabled) patrolSession(sim, walkMinutes);
  sim.save = applyTraining(sim.save, sim.now);
  sim.save = recordSteps(sim.save, dayKey, steps);
  for (const chest of chests) {
    if (chestState(sim.save, chest, stepsRecorded(sim.save, dayKey), dayKey) === 'ready') {
      act(sim, 'chest', (save) => openChest(save, chest.id, stepsRecorded(save, dayKey), dayKey).save);
    }
  }

  if (sim.save.tutorial.step !== 'done') playTutorial(sim);
  forge(sim);
  stockProvisions(sim);
  infuseWeapons(sim);
  recruitHeroes(sim);
  buyGuildRanks(sim);
  challengeSanctums(sim);
  digTreasure(sim);
  sendExpeditions(sim);
  markCoreKit(sim);
}

/** Plays `days` days of a profile with the bot and returns everything that happened. */
export function runSim({ profile: name, days, seed, rates, patrolRates, config = simConfig, afterSession }: RunOptions): RunLog {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown profile ${name}`);
  const rng = createRng(`sim|${seed}|${name}`);
  const startedAt = config.startDay + rng.int(0, config.startOffsetDays) * DAY;
  const location = config.location;
  const tavern = generateTavernsAround(location).sort((a, b) => distanceMeters(location, a.position) - distanceMeters(location, b.position))[0];
  const hours = [...profile.sessionHours].sort((a, b) => a - b);
  const sessionTimes = (day: number) => hours.map((h) => startedAt + day * DAY + h * HOUR);

  const sim: Sim = {
    save: createInitialSave(),
    now: startedAt,
    day: 1,
    startedAt,
    profile,
    config,
    rates,
    patrolRates,
    patrolSpawns: 0,
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
    log: {
      profile: name,
      seed,
      days,
      milestones: {},
      daily: [],
      expeditions: [],
      crafts: [],
      goldIn: [],
      goldOut: [],
      gathered: {},
      used: {},
      missing: {},
      sanctums: [],
      recruits: [],
      guildBuys: [],
      patrols: {
        seen: [],
        fights: [],
        escortFights: [],
        escortPauses: 0,
        travellers: { wounded: 0, pilgrim: 0, trader: 0 },
        rewards: { gold: 0, shards: 0, treasureSpot: 0, blessing: 0, keyFragment: 0, recruit: 0 },
        recruits: [],
        keyFragments: 0,
        trades: 0,
      },
      potionsAtHome: 0,
      emergencySupply: 0,
    },
  };

  for (let day = 0; day < days; day++) {
    sim.day = day + 1;
    sim.bonusGathers = gatheringConfig.walkingBonus.gathers;
    const dayStart = startedAt + day * DAY;
    const dayKey = new Date(dayStart).toISOString().slice(0, 10);
    const meters = profile.walkMinutes * 60 * config.walk.speed;
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
      session(sim, profile.walkMinutes / hours.length, profile.stepsPerDay / hours.length, dayKey, i === 0);
      idle += homeHeroes(sim.save).length / sim.save.heroes.length;
      afterSession?.(sim.save);
    });

    const save = sim.save;
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
      charters: save.charters,
      guildRanks: guildTracks.reduce((s, t) => s + (save.guild[t.id] ?? 0), 0),
      mastery: Object.fromEntries(MASTERY_TYPES.map((t) => [t, masteryOf(save, t).level])),
      stock: { ...save.materials },
    });
  }
  return sim.log;
}
