import { chests } from '@/content/chests';
import { MASTERY_TYPES } from '@/content/forging';
import { guildTracks } from '@/content/guild';
import { itemById, recipeById } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import { craft } from '../crafting/crafting';
import { dailyRotation, rotationDay } from '../dungeons/rotation';
import { startExpedition } from '../expeditions/expeditions';
import { masteryOf } from '../forging/mastery';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { rosterCap } from '../guild/guild';
import { applyTraining } from '../guild/training';
import { activateLure, isLureActive } from '../rewards/lures';
import { chestState, openChest, recordSteps, stepsRecorded } from '../rewards/chests';
import { generateSanctumsAround } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '../save';
import { generateTavernsAround } from '../taverns/taverns';
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
  reachChance,
  recruitHeroes,
  sendExpeditions,
  stockProvisions,
  type RunLog,
  type Sim,
} from './bot';
import { profiles, simConfig, type SimConfig } from './config';
import { PICKAXES, walkYield, type WalkRates } from './walking';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RunOptions = {
  profile: string;
  days: number;
  seed: string;
  rates: WalkRates;
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
  sim.log.crafts.push({ day: sim.day, kind: 'tutorial', itemId: sword.itemId, tier: 1, quality: sword.quality, mastery: masteryOf(sim.save, 'sword').level, materials: { wood: -wood } });
  sim.save = advanceTutorial(equip(sim.save, sim.save.heroes[0].id, 'weapon', sword.uid));
  sim.save = startExpedition(sim.save, tutorialRules.firstExpedition.dungeonId, sim.save.heroes.map((h) => h.id), sim.now, 1, sim.rotation);
  collectExpedition(sim, sim.save.expeditions[0]);
  sim.save = finishTutorial(sim.save);
}

function session(sim: Sim, walkMinutes: number, steps: number, dayKey: string, first: boolean) {
  sim.save = pruneExpired(sim.save, sim.now);
  sim.rotation = dailyRotation(rotationDay(sim.now));

  // Walking, with a lure on the first walk of the day.
  const pickaxes = PICKAXES.filter((id) => sim.save.tools.includes(id)).length;
  act(sim, 'walk', (save) => ({ ...save, materials: addMaterials(save.materials, walkYield(sim.rates.perMinute[pickaxes], walkMinutes, sim.rng, sim.config)) }));
  if (first && sim.save.lures > 0 && !isLureActive(sim.save, sim.now)) {
    sim.save = activateLure(sim.save, sim.location, sim.now);
    act(sim, 'lure', (save) => ({ ...save, materials: addMaterials(save.materials, walkYield(sim.rates.lure, 1, sim.rng, sim.config)) }));
  }

  // Collect.
  const due = sim.save.expeditions.filter((e) => e.endsAt <= sim.now).sort((a, b) => a.endsAt - b.endsAt);
  for (const expedition of due) collectExpedition(sim, expedition);
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
}

/** Plays `days` days of a profile with the bot and returns everything that happened. */
export function runSim({ profile: name, days, seed, rates, config = simConfig, afterSession }: RunOptions): RunLog {
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
    rng,
    rotation: dailyRotation(rotationDay(startedAt)),
    location,
    tavern,
    reach: { meters: 0, tavern: false, sanctums: [], maps: new Map() },
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
      potionsAtHome: 0,
      emergencySupply: 0,
    },
  };

  for (let day = 0; day < days; day++) {
    sim.day = day + 1;
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
