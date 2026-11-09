import { dungeons } from '@/content/dungeons';
import { difficultyRules } from '@/content/difficulty';
import { rosterRules } from '@/content/roster';
import { affinityRules, classAffinities, gearProfiles, type Affinity } from '@/content/equipment';
import { guildTrackById, guildTracks } from '@/content/guild';
import { familyOfThreat, type FamilyId } from '@/content/families';
import { heroClasses, xpRules } from '@/content/heroes';
import { dungeonById, itemById, recipeById } from '@/content/lookup';
import { gathererRules, jobs as jobList, type JobDef } from '@/content/jobs';
import { lootConfig } from '@/content/loot/config';
import { shopRules } from '@/content/shops';
import { recipes } from '@/content/recipes';
import { traitById } from '@/content/traits';
import type { Rarity } from '@/content/gear';

import { canCraft, craft, craftableCount, craftMany, forgedItem, isKnown } from '../crafting/crafting';
import { type Rotation } from '../dungeons/rotation';
import {
  briefingOf,
  firstWinAvailable,
  highestUnlockedTier,
  isDungeonAvailable,
  launchPlan,
  overnightUnderWay,
  resolveExpedition,
  runProvisions,
  startExpedition,
  type Loadout,
} from '../expeditions/expeditions';
import { pieceDamageStat } from '../equipment/damageStat';
import { estimateOdds, type Odds } from '../expeditions/odds';
import { mealItems, supplyHeld, supplyItems } from '../expeditions/provisions';

import { answersMemberOf, EMPTY_BRIEFING, prepareParty, simulateRun } from '../expeditions/simulate';
import { salvage } from '../forging/salvage';
import { familyLevels, gearFamilyTags, partyFamilies, type FamilyLevels } from '../families/families';
import { gearStats } from '../gear/stats';
import { trinketEffect } from '../loot/trinkets';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { buyRank, guildBonus, isGuildUnlocked, rankPrice, rankProblem } from '../guild/guild';
import { hasMaterials } from '../inventory';
import { addAnchor } from '../jobs/gatherer';
import { assignJob, collectJob, isJobOpen, jobChoices, jobMaterials, jobOutputDetail, jobWorker, openJobs, recallFromJob, setJobChoice } from '../jobs/jobs';
import { isRevealed } from '../reveal/reveal';
import type { PatrolKind, PatrolSubject, TravellerKind } from '../patrols/generate';
import type { TravellerReward } from '../patrols/travellers';
import { collectTreasure, liveTreasureMaps, readTreasureMap } from '../rewards/treasure';
import { challengeSanctum, sanctumById, sanctumDungeon, type SanctumSpawn } from '../sanctums/sanctums';
import type { Loot, LootCategory, LootSourceId, TrophyDrop } from '../loot/types';
import type { SaveData } from '../save';
import { buySupply, buySupplyProblem, isTavernUnlocked, offerLevel, recruit, recruitPrice, tavernOffers, type TavernSpawn } from '../taverns/taverns';
import { currentHp, drinkPotion, drinkProblem, maxHp } from '../team/health';
import { affinityOf, equip, equipPreview, hasPotionSlot, heroDamageStat, heroStats, isBusy, isOnExpedition, rosterFull, unequip } from '../team/team';
import { briefingCoverage } from '../threats/coverage';
import { heroAnswers, type AnswersMember } from '../threats/answers';
import { scoreThreat } from '../threats/score';
import type { ActiveExpedition, ArmourType, HelmetType, Briefing, DungeonDef, GearDef, GearInstance, HeroClassId, HeroState, OffhandType, RecipeDef, Stats, WeaponType } from '../types';
import { expectedLevels, type Profile, type SimConfig } from './config';
import { playerMetersPerMinute } from './gathererPace';
import { partRecipeFor } from './rules/inventory';
import { sparePieces } from '../families/dress';
import { sparesToKeep } from './rules/families';
import { applySwaps, suggestParty, type GearSwap } from '../threats/suggest';
import { emptySlots, fillPotions, heldPotion, oilIds, pickCharm, pickWeakness, statPotionIds, withCharm, withElixir, withOil, withStatPotion } from './rules/loadout';
import { PICKAXES, type WalkRates } from './walking';
import { questRules } from '@/content/quests';
import { questUpkeep } from '../quests/arrival';
import { complete, questEvent } from '../quests/progress';
import { claimQuest, reachMark } from '../quests/rewards';
import { needsPlace } from '../quests/targets';
import type { Quest } from '../quests/types';

/** The briefing a launch today would get: the rotation's, without threats during the safe start. */
const todaysBriefing = (sim: Sim, dungeon: DungeonDef) => briefingOf(sim.save, dungeon, sim.rotation, sim.now);

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export type ExpeditionRow = {
  day: number;
  /** Hours since the run started. */
  hour: number;
  id: string;
  dungeonId: string;
  tier: number;
  boss: boolean;
  /** An overnight expedition: rewards follow time away, not taps. */
  overnight: boolean;
  /** The briefing's threats, e.g. "ambush L2 met". */
  threats: string;
  classes: string[];
  odds: number;
  success: boolean;
  outcome: string;
  gold: number;
  xp: number;
  /** Rarity of the party's worn weapons and armour at launch. */
  rarities: Record<Rarity, number>;
  /** Abilities that changed an encounter, e.g. "tagBonus:beast". */
  effects: Record<string, number>;
  /** The same by the class that used them, as "class|effect" ("local" for a local's tip). */
  classEffects: Record<string, number>;
  /** Hours from launch to the end of the run. */
  hours: number;
  /** The party's average level at launch. */
  level: number;
  /** The day's first win, its loot row rolled on top. */
  firstWin: boolean;
  /** A blueprint dropped. */
  blueprint: boolean;
  /** The party's average share of max HP at launch. */
  startHp: number;
  hunger: string;
  supplyUsed: number;
  meal: string | null;
  /** Healing potions drunk in the dungeon. */
  potions: number;
  /** Consumables the party carried (charms, potions, weakness items). */
  consumables: string[];
  /** The party's family levels at launch, as dressed for the briefing. */
  families: FamilyLevels;
  /** Hours from launch to the session that collected the run: what limits runs per week. */
  cycleHours: number;
};

export type CraftRow = {
  day: number;
  kind: 'pickaxe' | 'upgrade' | 'family' | 'reforge' | 'component' | 'relic' | 'consumable' | 'provision' | 'salvage' | 'tutorial';
  itemId: string;
  tier: number;
  rarity: Rarity | null;
  /** The piece's stat dice total (3–18), for forged gear. */
  roll: number | null;
  /** Materials used (negative) or returned (positive). */
  materials: Record<string, number>;
};

export type DayRow = {
  day: number;
  gold: number;
  tier: number;
  roster: number;
  avgLevel: number;
  maxLevel: number;
  /** Share of heroes left at home after each session's launches, averaged over the day. */
  idle: number;
  pickaxes: number;
  sigils: number;
  guildRanks: number;
  stock: Record<string, number>;
  consumables: Record<string, number>;
  valuables: Record<string, number>;
  /** Average level of the three highest-level heroes. */
  topLevel: number;
  /** Average number of affixes on the heroes' worn gear. */
  affixes: number;
  /** Share of the heroes wearing a helmet. */
  helmets: number;
};

export type RunLog = {
  profile: string;
  seed: string;
  days: number;
  milestones: Record<string, number>;
  daily: DayRow[];
  expeditions: ExpeditionRow[];
  crafts: CraftRow[];
  goldIn: { day: number; source: string; amount: number }[];
  /** Times each loot category dropped, over every source. */
  loot: Partial<Record<LootCategory, number>>;
  goldOut: { day: number; sink: string; amount: number }[];
  /** Material → source → amount gathered (or sink → amount used). */
  gathered: Record<string, Record<string, number>>;
  used: Record<string, Record<string, number>>;
  /** Tier → material → how often it was missing for a forge the bot wanted. */
  missing: Record<number, Record<string, number>>;
  sanctums: { day: number; tier: number; odds: number; win: boolean }[];
  recruits: { day: number; classId: string; price: number; trait: string }[];
  /** Offers seen, by offer id: at the tavern, from a traveller, or at a secret place. */
  offered: Record<string, string>;
  guildBuys: { day: number; track: string; rank: number; gold: number }[];
  /** Everything the walks met — patrols fought and travellers helped. */
  patrols: PatrolLog;
  /** Healing potions drunk at home. */
  potionsAtHome: number;
  /** Emergency jerky bought at taverns. */
  emergencySupply: number;
  /** Daily quests claimed, by band, and the secret place tips their strange marks gave. */
  quests: { claimed: Record<Quest['band'], number>; tips: number };
  /** The win odds probe, every `probeEveryDays` days and at each new tier (see probe.ts). */
  probes: ProbeRow[];
  /** Day → material → [gathered, used]. */
  materialFlow: Record<number, Record<string, [number, number]>>;
  /** Day → job id → material → gathered from that guild job (sources `job:<id>`), the jobs report. */
  jobFlow: Record<number, Record<string, Record<string, number>>>;
  /** Day → material → work-tool scavenge from won fights (loot's `scavenged`). */
  scavenge: Record<number, Record<string, number>>;
  /** Day → the gatherer's nodes gathered and wounds settled, as the day's collects clear them. */
  gatherer: Record<number, { nodes: number; wounds: number }>;
  /** Recipes known at the end. */
  knownRecipes: string[];
  /** Map places visited: fight events, the lair, ruins, heists, the dock, secret places. */
  places: PlaceRow[];
  /** Visits the profile planned that couldn't happen (nothing there, odds too low), by activity. */
  skipped: Record<string, number>;
  /** Whole expeditions still owed at a day's start, by why the last session stopped. */
  notLaunched: Record<string, number>;
  /** Place visits owed that couldn't happen, by reason; 'hidden' is the kind still behind the reveal. */
  placesNotDone: Record<string, number>;
  /** Every looted piece (gear, trinkets and relics), with the loot source it came from; a relic is named `relic:<id>` and has no rarity. */
  gearLoot: { day: number; source: LootSourceId; itemId: string | null; rarity: Rarity | null }[];
  /** Each reroll: its day and what it cost (gold and materials, negative amounts). */
  rerolls: { day: number; gold: number; materials: Record<string, number> }[];
  /** The day of each elemental stone applied to a piece. */
  stones: number[];
  /** Every trophy and blueprint overflow drop (what replaced components), with its source. */
  trophies: ({ day: number; source: LootSourceId } & TrophyDrop)[];
  /** The tier 5 boss was beaten before the profile's day cap. */
  finished: boolean;
};

/** One probe measurement: the best prepared party's odds, and for normal dungeons the same party with its consumable slots empty. */
export type ProbeRow = {
  day: number;
  /** Hours since the game started. */
  at: number;
  tier: number;
  kind: 'normal' | 'boss' | 'event' | 'patrol';
  id: string;
  prepared: number;
  unprepared: number | null;
  /** Normal dungeons: the not-prepared party's best family level in its natural gear (the natural party). */
  natural: number | null;
};

/** A map place visit; odds and won only for fights and heists. */
export type PlaceRow = { day: number; kind: string; tier: number; odds: number | null; won: boolean | null };

/** A run's log before anything happened. */
export const emptyLog = (profile: string, seed: string): RunLog => ({
  profile,
  seed,
  days: 0,
  milestones: {},
  daily: [],
  expeditions: [],
  crafts: [],
  goldIn: [],
  loot: {},
  goldOut: [],
  gathered: {},
  used: {},
  missing: {},
  sanctums: [],
  recruits: [],
  offered: {},
  guildBuys: [],
  patrols: { seen: [], fights: [], travellers: { wounded: 0, pilgrim: 0, trader: 0 }, rewards: { loot: 0, recruit: 0 }, recruits: [], keyFragments: 0, trades: 0 },
  potionsAtHome: 0,
  emergencySupply: 0,
  quests: { claimed: { short: 0, medium: 0, long: 0, secret: 0 }, tips: 0 },
  probes: [],
  materialFlow: {},
  jobFlow: {},
  scavenge: {},
  gatherer: {},
  knownRecipes: [],
  places: [],
  skipped: {},
  notLaunched: {},
  placesNotDone: {},
  gearLoot: [],
  rerolls: [],
  stones: [],
  trophies: [],
  finished: false,
});

/** Everything met on a walk, at the tier it would have fought at. */
export type PatrolSeenRow = { kind: PatrolSubject; tier: number; elite: boolean };
/** A patrol fight the player's party took on; xp is the win's XP summed over the party. */
export type PatrolFightRow = { kind: PatrolKind; tier: number; elite: boolean; won: boolean; xp: number };

export type PatrolLog = {
  seen: PatrolSeenRow[];
  fights: PatrolFightRow[];
  /** Travellers helped, and the rewards they rolled. */
  travellers: Record<TravellerKind, number>;
  rewards: Record<TravellerReward['kind'], number>;
  /** Days a traveller joined the roster, key fragments rolled and trades made. */
  recruits: number[];
  keyFragments: number;
  trades: number;
};

/** Everything a session works with. The save only changes through the game's own functions. */
export type Sim = {
  save: SaveData;
  now: number;
  /** 1 = the first day. */
  day: number;
  startedAt: number;
  profile: Profile;
  config: SimConfig;
  /** Guild jobs on: stations are collected each session and staffed at its end. */
  jobs: boolean;
  rates: WalkRates;
  /**
   * Visits still owed by activity ('expeditions', 'quests' or a loot source):
   * each day adds the profile's visits, each visit takes 1.
   */
  due: Record<string, number>;
  /** Patrols and travellers already met this run. */
  met: Set<string>;
  rng: Rng;
  rotation: Rotation;
  location: LatLng;
  tavern: TavernSpawn;
  /** Today's reach rolls. */
  reach: { meters: number; tavern: boolean; sanctums: SanctumSpawn[]; maps: Map<string, boolean> };
  /** Bonus gathers left today (the daily walking bonus). */
  bonusGathers: number;
  /** When the first session at or after a time happens. */
  collectionAt: (time: number) => number;
  oddsCache: Map<string, Odds>;
  launched: Map<string, Pick<ExpeditionRow, 'odds' | 'rarities' | 'day' | 'hour' | 'level' | 'consumables' | 'families'>>;
  /** Dungeons left for a later session this one, waiting for the heroes to heal. */
  waiting: Set<string>;
  /** Worn pieces already rerolled today. */
  rerolled: Set<string>;
  /** How this session's expedition search ended while expeditions were owed, and whether one launched. */
  expeditionStop: { reason: 'noParty' | 'hp' | 'odds' | null; launched: boolean };
  log: RunLog;
};

// —— Bookkeeping ——

/** Marks the milestone for each tier whose core gear (sword, bow, wand, mail) is fully known. */
export function markCoreGear(sim: Sim) {
  for (let tier = 1; tier <= 5; tier++) {
    const core = (['sword', 'bow', 'wand', 'mail'] as const).map((type) => recipeById[`${type}${tier}`]?.id);
    if (core.every((id) => id && sim.save.knownRecipes.includes(id))) mark(sim, `coreGear:${tier}`);
  }
}

/** Takes one visit owed for an activity, if a whole one is due. */
export function takeVisit(sim: Sim, key: string) {
  if ((sim.due[key] ?? 0) < 1) return false;
  sim.due[key] -= 1;
  return true;
}

/** Logs a planned visit that couldn't happen. */
export function skip(sim: Sim, key: string) {
  sim.log.skipped[key] = (sim.log.skipped[key] ?? 0) + 1;
}

export function mark(sim: Sim, key: string) {
  if (!(key in sim.log.milestones)) sim.log.milestones[key] = sim.day;
}

const add = (table: Record<string, Record<string, number>>, material: string, key: string, amount: number) => {
  table[material] ??= {};
  table[material][key] = (table[material][key] ?? 0) + amount;
};

/**
 * Runs a game action and records what it changed: gold in or out, and
 * materials gathered or used, under `source`. Returns the material changes.
 */
export function act(sim: Sim, source: string, action: (save: SaveData) => SaveData): Record<string, number> {
  const before = sim.save;
  sim.save = action(before);
  const gold = sim.save.gold - before.gold;
  if (gold > 0) sim.log.goldIn.push({ day: sim.day, source, amount: gold });
  if (gold < 0) sim.log.goldOut.push({ day: sim.day, sink: source, amount: -gold });
  const changes: Record<string, number> = {};
  for (const id of new Set([...Object.keys(before.materials), ...Object.keys(sim.save.materials)])) {
    const delta = (sim.save.materials[id] ?? 0) - (before.materials[id] ?? 0);
    if (delta === 0) continue;
    changes[id] = delta;
    add(delta > 0 ? sim.log.gathered : sim.log.used, id, source, Math.abs(delta));
    const flow = ((sim.log.materialFlow[sim.day] ??= {})[id] ??= [0, 0]);
    flow[delta > 0 ? 0 : 1] += Math.abs(delta);
    if (delta > 0 && source.startsWith('job:')) {
      const byJob = (sim.log.jobFlow[sim.day] ??= {});
      const flow = (byJob[source.slice('job:'.length)] ??= {});
      flow[id] = (flow[id] ?? 0) + delta;
    }
    if (delta > 0 && id.endsWith('Stone')) mark(sim, 'firstStone');
  }
  return changes;
}

// —— Helpers ——

export const highestTier = highestUnlockedTier;
export const homeHeroes = (save: SaveData) => save.heroes.filter((h) => !isOnExpedition(save, h.id));
const gearOf = (save: SaveData, uid: string | null) => save.gear.find((g) => g.uid === uid);

/** How much a Common piece with average dice adds to a hero: their damage stat for weapons and off-hands, armour, resistance and a share of HP for armour and helmets. */
export function gearScore(hero: HeroState, item: GearDef) {
  const stats = gearStats({ itemId: item.id, rarity: 'common', roll: 10.5 });
  if (item.slot === 'armor' || item.slot === 'helmet') return (stats.armour ?? 0) + (stats.resistance ?? 0) + (stats.hp ?? 0) / 8;
  const damage = heroClasses[hero.classId].damageStat === 'magic' ? (stats.magic ?? 0) : (stats.power ?? 0);
  const affinity = item.gearType ? affinityRules[affinityOf(hero.classId, item.gearType)] : 1;
  return (damage + (stats.armour ?? 0) + (stats.resistance ?? 0)) * affinity;
}

/** A hero's stats rolled into one number: their damage stat, armour, resistance and a share of HP. */
function statScore(save: SaveData, hero: HeroState, stats: Stats = heroStats(save, hero)) {
  return stats[heroDamageStat(save, hero)] + stats.armour + stats.resistance + stats.hp / 8;
}

/** How much a hero's worn piece is worth on their real stats, affinity and casting penalty included. */
function wornScore(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'helmet' | 'offhand') {
  if (!hero.equipment[slot]) return 0;
  const bare = unequip(save, hero.id, slot);
  return statScore(save, hero) - statScore(bare, bare.heroes.find((h) => h.id === hero.id)!);
}

/** How much equipping a piece would change a hero's real stats; 0 when it cannot go in. */
function equipGain(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'helmet' | 'offhand', uid: string) {
  const preview = equipPreview(save, hero.id, slot, uid);
  return preview ? statScore(save, hero, preview.after) - statScore(save, hero, preview.before) : 0;
}

/** The class's weapon of choice: its first favoured weapon type that rolls with the class's damage stat ('wielder' pieces roll with it). */
export const weaponTypeFor = (classId: HeroClassId): WeaponType | null => {
  const favoured = (Object.entries(classAffinities[classId]) as [WeaponType | ArmourType, Affinity][])
    .filter(([type, affinity]) => affinity === 'favoured' && gearProfiles[type]?.slot === 'weapon')
    .map(([type]) => type as WeaponType);
  return favoured.find((type) => pieceDamageStat(gearProfiles[type], classId) === heroClasses[classId].damageStat) ?? favoured[0] ?? null;
};

/** The class's armour of choice: the first favoured armour type. */
export const armourTypeFor = (classId: HeroClassId): ArmourType | null => {
  const favoured = (['plate', 'mail', 'leather', 'robes'] as ArmourType[]).find((type) => classAffinities[classId][type] === 'favoured');
  return favoured ?? null;
};

/** The class's helmet of choice: the first favoured helmet type. */
export const helmetTypeFor = (classId: HeroClassId): HelmetType | null =>
  (['greatHelm', 'sallet', 'hood', 'plagueMask', 'runeCirclet'] as HelmetType[]).find((type) => classAffinities[classId][type] === 'favoured') ?? null;

/** The off-hand that fits the hero's weapon: ammunition for a bow or crossbow, focus for a Magic weapon, shield for a one-handed Power weapon. */
export function offhandTypeFor(save: SaveData, hero: HeroState): OffhandType | null {
  const weapon = gearOf(save, hero.equipment.weapon);
  const item = weapon ? (itemById[weapon.itemId] as GearDef) : null;
  if (!item || item.twoHanded) return null;
  if (item.gearType === 'bow' || item.gearType === 'crossbow') return 'quiver';
  return pieceDamageStat(item, hero.classId) === 'magic' ? 'focus' : 'shield';
}

/** A hypothetical member of a class: its best weapon. */
const offerMember = (classId: HeroClassId): AnswersMember => {
  const gearType = weaponTypeFor(classId);
  return {
    heroId: `offer:${classId}`,
    classId,
    traitId: 'none',
    familyTags: gearType
      ? gearFamilyTags({ gearType }).map((tag) => ({ family: tag.family, count: tag.count, source: 'gear' as const }))
      : [],
  };
};

/** Whether the class's answers turn one of today's open tier threats from missed to met. */
function answersThreat(sim: Sim, classId: HeroClassId): boolean {
  const tier = highestTier(sim.save);
  const open = dungeons.filter((d) => d.tier === tier && !d.overnight && isDungeonAvailable(sim.save, d, sim.rotation));
  const home = homeHeroes(sim.save).map((hero) => answersMemberOf(prepareParty(sim.save, [hero.id])[0]));
  const offer = offerMember(classId);
  for (const dungeon of open) {
    const briefing = todaysBriefing(sim, dungeon);
    for (const threat of briefing.threats) {
      const now = scoreThreat(threat, home.map((m) => heroAnswers(m)));
      if (now.state === 'met') continue;
      const withOffer = scoreThreat(threat, [...home, offer].map((m) => heroAnswers(m)));
      if (withOffer.state === 'met') return true;
    }
  }
  return false;
}

function recordMissing(sim: Sim, recipe: RecipeDef) {
  const tier = highestTier(sim.save);
  sim.log.missing[tier] ??= {};
  for (const { materialId, amount } of recipe.inputs) {
    if ((sim.save.materials[materialId] ?? 0) < amount) {
      sim.log.missing[tier][materialId] = (sim.log.missing[tier][materialId] ?? 0) + 1;
    }
  }
}

// —— Forging ——

const forgeRecipes = recipes.filter((r) => forgedItem(r));

/** The best-tier piece a hero could get for a slot from the known recipes, the class's favoured type first. */
function bestRecipe(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'helmet' | 'offhand') {
  const want =
    slot === 'weapon' ? weaponTypeFor(hero.classId) : slot === 'armor' ? armourTypeFor(hero.classId) : slot === 'helmet' ? helmetTypeFor(hero.classId) : offhandTypeFor(save, hero);
  const rank = (item: GearDef) => [item.tier, item.gearType === want ? 1 : 0, gearScore(hero, item)] as const;
  let best: { recipe: RecipeDef; item: GearDef } | null = null;
  for (const recipe of forgeRecipes) {
    const item = forgedItem(recipe)!;
    if (item.slot !== slot || !save.knownRecipes.includes(recipe.id)) continue;
    const other = best ? rank(best.item) : null;
    const mine = rank(item);
    if (!other || mine[0] > other[0] || (mine[0] === other[0] && (mine[1] > other[1] || (mine[1] === other[1] && mine[2] > other[2])))) {
      best = { recipe, item };
    }
  }
  return best;
}

function recordCraft(sim: Sim, kind: CraftRow['kind'], before: SaveData, materials: Record<string, number>) {
  const gear = sim.save.gear.find((g) => !before.gear.some((b) => b.uid === g.uid));
  if (!gear) return null;
  const item = itemById[gear.itemId] as GearDef;
  sim.log.crafts.push({ day: sim.day, kind, itemId: item.id, tier: item.tier, rarity: gear.rarity, roll: gear.roll, materials });
  if (gear.rarity === 'rare' || gear.rarity === 'legendary') mark(sim, `rare:${item.tier}`);
  if (gear.rarity === 'legendary') mark(sim, `legendary:${item.tier}`);
  return gear;
}

/** A trinket's worth as one number: Crit and Evasion points, Speed and Luck count triple, an amulet half its Resistance. */
function trinketScore(gear: GearInstance) {
  const effect = trinketEffect(itemById[gear.itemId] as GearDef, gear);
  const { crit = 0, evasion = 0, speed = 0, luck = 0 } = effect.stats;
  return crit + evasion + 3 * (speed + luck) + (effect.elementResist?.amount ?? 0) / 2;
}

/** Gives each home hero, in turn, the best spare trinket that beats the one they wear. */
function distributeTrinkets(sim: Sim) {
  for (const hero of homeHeroes(sim.save)) {
    const worn = new Set(sim.save.heroes.map((h) => h.equipment.trinket));
    const current = gearOf(sim.save, hero.equipment.trinket);
    const spare = sim.save.gear
      .filter((g) => !worn.has(g.uid) && (itemById[g.itemId] as GearDef).slot === 'trinket')
      .sort((a, b) => trinketScore(b) - trinketScore(a))[0];
    if (spare && trinketScore(spare) > (current ? trinketScore(current) : 0)) {
      act(sim, 'equip', (save) => equip(save, hero.id, 'trinket', spare.uid));
    }
  }
}

/** Gives every spare piece to the home hero it helps most, then salvages what nobody wants. */
function distribute(sim: Sim) {
  distributeTrinkets(sim);
  const slots = ['weapon', 'armor', 'helmet', 'offhand', 'trinket'] as const;
  for (;;) {
    const worn = new Set(sim.save.heroes.flatMap((h) => slots.map((slot) => h.equipment[slot])));
    let best: { hero: HeroState; uid: string; slot: 'weapon' | 'armor' | 'helmet' | 'offhand'; gain: number } | null = null;
    for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid))) {
      const item = itemById[gear.itemId] as GearDef;
      if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'helmet' && item.slot !== 'offhand') continue;
      for (const hero of homeHeroes(sim.save)) {
        const gain = equipGain(sim.save, hero, item.slot, gear.uid);
        if (gain > 0 && (!best || gain > best.gain)) best = { hero, uid: gear.uid, slot: item.slot, gain };
      }
    }
    if (!best) break;
    const { hero, uid, slot } = best;
    act(sim, 'equip', (save) => equip(save, hero.id, slot, uid));
  }
  const worn = new Set(sim.save.heroes.flatMap((h) => slots.map((slot) => h.equipment[slot])));
  const kept = sparesToKeep(sim.save, highestTier(sim.save));
  for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid) && !kept.has(g.uid))) {
    const item = itemById[gear.itemId] as GearDef;
    if (item.workTool) continue; // work tools cannot be salvaged; a spare one just waits
    const materials = act(sim, 'salvage', (save) => salvage(save, gear.uid));
    sim.log.crafts.push({ day: sim.day, kind: 'salvage', itemId: item.id, tier: item.tier, rarity: gear.rarity, roll: gear.roll, materials });
  }
}

const smeltRecipes = recipes.filter((r) => 'materialId' in r.output);

/** Smelts what a forge is short of (steel from iron and coal), when the smelting recipe is known and affordable. */
function smeltFor(sim: Sim, inputs: RecipeDef['inputs']) {
  for (const { materialId, amount } of inputs) {
    const smelt = smeltRecipes.find((r) => 'materialId' in r.output && r.output.materialId === materialId);
    while (smelt && (sim.save.materials[materialId] ?? 0) < amount && canCraft(sim.save, smelt)) {
      act(sim, 'smelt', (save) => craft(save, smelt));
    }
  }
  return hasMaterials(sim.save.materials, inputs);
}

function forgeGear(sim: Sim, recipe: RecipeDef, kind: CraftRow['kind']) {
  const before = sim.save;
  const materials = act(sim, 'forge', (save) => craft(save, recipe));
  recordCraft(sim, kind, before, materials);
  distribute(sim);
}

/** How many of the 216 3d6 rolls land on each total, index 0 = 3 … 15 = 18. */
const DICE_COUNTS = [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1];

/** The chance a re-forge's fresh 3d6 beats the piece's current dice total. */
function betterRollChance(roll: number): number {
  const above = Math.min(18, Math.max(3, Math.round(roll))) - 3;
  return DICE_COUNTS.slice(above + 1).reduce((sum, count) => sum + count, 0) / 216;
}

/** The recipe the forge rule would pick now: the next pickaxe, else the biggest upgrade. */
export function nextForgeRecipe(save: SaveData): RecipeDef | null {
  const owned = PICKAXES.filter((id) => save.tools.includes(id)).length;
  const pickaxe = recipeById[PICKAXES[owned]];
  if (pickaxe && save.knownRecipes.includes(pickaxe.id)) return pickaxe;
  const upgrades = homeHeroes(save)
    .flatMap((hero) => {
      const slots = (['weapon', 'armor', 'helmet', 'offhand'] as const).filter((slot) => slot !== 'offhand' || offhandTypeFor(save, hero));
      return slots.map((slot) => {
        const best = bestRecipe(save, hero, slot);
        const current = gearOf(save, hero.equipment[slot]);
        if (!best || (current && (itemById[current.itemId] as GearDef).tier >= best.item.tier)) return null;
        return { recipe: best.recipe, gain: gearScore(hero, best.item) - wornScore(save, hero, slot) };
      });
    })
    .filter((u): u is { recipe: RecipeDef; gain: number } => u !== null && u.gain > 0)
    .sort((a, b) => b.gain - a.gain);
  return upgrades[0]?.recipe ?? null;
}

/**
 * The family tags the roster can bring to a threat: its classes' tags, and
 * the gear of the top two tiers worn or spare (a two-handed weapon counts 2).
 */
function rosterTags(save: SaveData, family: FamilyId): number {
  const top = highestTier(save);
  const classes = save.heroes.filter((h) => heroClasses[h.classId].familyTag === family).length;
  const gear = save.gear.reduce((sum, g) => {
    const item = itemById[g.itemId] as GearDef;
    if (!item.gearType || item.workTool || item.tier < top - 1) return sum;
    return sum + gearFamilyTags(item).reduce((n, tag) => n + (tag.family === family ? tag.count : 0), 0);
  }, 0);
  return classes + gear;
}

/**
 * Forge for threats: for each threat family the day's open top-tier briefings
 * need more tags of than the roster can bring, one piece of a type carrying it
 * and not held spare yet (the best known recipe of the top two tiers), once
 * per family a session.
 */
function forgeForThreats(sim: Sim) {
  const top = highestTier(sim.save);
  const needed = new Map<FamilyId, number>();
  for (const dungeon of dungeons.filter((d) => d.tier === top && !d.overnight && isDungeonAvailable(sim.save, d, sim.rotation))) {
    for (const threat of todaysBriefing(sim, dungeon).threats) {
      const family = familyOfThreat(threat.id);
      needed.set(family, Math.max(needed.get(family) ?? 0, threat.level));
    }
  }
  // Only types without a spare of the top two tiers: the new piece is then the one kept.
  const spareTypes = new Set(
    sparePieces(sim.save)
      .map((g) => itemById[g.itemId] as GearDef)
      .filter((item) => item.tier >= top - 1)
      .map((item) => item.gearType),
  );
  for (const [family, tags] of needed) {
    if (rosterTags(sim.save, family) >= tags) continue;
    const recipe = forgeRecipes
      .filter((r) => {
        const item = forgedItem(r)!;
        return (
          sim.save.knownRecipes.includes(r.id) &&
          item.tier >= top - 1 &&
          !!item.gearType &&
          !item.workTool &&
          !spareTypes.has(item.gearType) &&
          gearFamilyTags(item).some((tag) => tag.family === family)
        );
      })
      .sort((a, b) => forgedItem(b)!.tier - forgedItem(a)!.tier)[0];
    if (!recipe) continue;
    if (smeltFor(sim, recipe.inputs) && canCraft(sim.save, recipe)) forgeGear(sim, recipe, 'family');
    else recordMissing(sim, recipe);
  }
}

export function forge(sim: Sim) {
  // Back to the gear that suits each hero's stats best, undoing the last run's family swaps.
  distribute(sim);
  const owned = PICKAXES.filter((id) => sim.save.tools.includes(id)).length;
  const pickaxe = recipeById[PICKAXES[owned]];
  if (pickaxe && sim.save.knownRecipes.includes(pickaxe.id) && smeltFor(sim, pickaxe.inputs) && canCraft(sim.save, pickaxe)) {
    act(sim, 'pickaxe', (save) => craft(save, pickaxe));
    sim.log.crafts.push({ day: sim.day, kind: 'pickaxe', itemId: pickaxe.id, tier: owned + 1, rarity: null, roll: null, materials: {} });
    mark(sim, `pickaxe:${pickaxe.id}`);
  } else if (pickaxe && sim.save.knownRecipes.includes(pickaxe.id)) {
    recordMissing(sim, pickaxe);
  }

  // Upgrades: a better tier for a slot, biggest gain first.
  for (let i = 0; i < 30; i++) {
    const upgrades = homeHeroes(sim.save)
      .flatMap((hero) => {
        const slots = (['weapon', 'armor', 'helmet', 'offhand'] as const).filter((slot) => slot !== 'offhand' || offhandTypeFor(sim.save, hero));
        return slots.map((slot) => {
          const best = bestRecipe(sim.save, hero, slot);
          const current = gearOf(sim.save, hero.equipment[slot]);
          if (!best || (current && (itemById[current.itemId] as GearDef).tier >= best.item.tier)) return null;
          return { recipe: best.recipe, gain: gearScore(hero, best.item) - wornScore(sim.save, hero, slot) };
        });
      })
      .filter((u) => u !== null && u.gain > 0)
      .sort((a, b) => b!.gain - a!.gain);
    const next = upgrades.find((u) => smeltFor(sim, u!.recipe.inputs) && canCraft(sim.save, u!.recipe));
    if (!next) {
      if (upgrades[0]) recordMissing(sim, upgrades[0].recipe);
      break;
    }
    forgeGear(sim, next.recipe, 'upgrade');
  }

  forgeForThreats(sim);

  // Re-forges: worn pieces of the best known tier, worst dice first, keeping one more forge's materials.
  for (let i = 0; i < sim.config.reforgesPerSession; i++) {
    const candidates = homeHeroes(sim.save)
      .flatMap((hero) =>
        (['weapon', 'armor', 'helmet', 'offhand'] as const).map((slot) => {
          const gear = gearOf(sim.save, hero.equipment[slot]);
          const best = bestRecipe(sim.save, hero, slot);
          if (!gear || !best || gear.itemId !== best.item.id) return null;
          const twice = best.recipe.inputs.map((s) => ({ ...s, amount: s.amount * 2 }));
          if (betterRollChance(gear.roll) < sim.config.reforgeChance || !hasMaterials(sim.save.materials, twice) || !canCraft(sim.save, best.recipe)) return null;
          return { recipe: best.recipe, roll: gear.roll };
        }),
      )
      .filter((c) => c !== null)
      .sort((a, b) => a.roll - b.roll);
    if (!candidates[0]) break;
    forgeGear(sim, candidates[0].recipe, 'reforge');
  }

}

// —— Provisions ——

/** Crafts up to `count` of a Provisions recipe at once (its part recipe when the parts are held), logged under its tab (kitchen or alchemy). */
function cook(sim: Sim, itemId: string, count: number) {
  const recipe = partRecipeFor(sim.save, itemId) ?? recipeById[itemId];
  const n = Math.min(count, craftableCount(sim.save, recipe));
  if (n <= 0) return 0;
  act(sim, recipe.tab ?? 'alchemy', (save) => craftMany(save, recipe, n));
  for (let i = 0; i < n; i++) sim.log.crafts.push({ day: sim.day, kind: 'provision', itemId, tier: 0, rarity: null, roll: null, materials: {} });
  return n;
}

/**
 * Supply first, cooked in batches (jerky while meat lasts, then trail mix);
 * then potions and meals up to their stock. The bot never opts into an opportunity.
 */
export function stockProvisions(sim: Sim) {
  const { provisions } = sim.config;
  const bySupply = [...supplyItems].sort((a, b) => b.supply! - a.supply!);
  while (supplyHeld(sim.save.consumables) < provisions.supplyBuffer) {
    if (!bySupply.some((item) => cook(sim, item.id, provisions.batch) > 0)) break;
  }
  // The healing potion stock is the strongest one the bot can brew.
  const targets: [string, number][] = [
    ...Object.entries(sim.config.stock).map(([id, target]): [string, number] => [id === 'healingPotion' ? brewablePotion(sim.save) : id, target]),
    ...mealItems.map((i): [string, number] => [i.id, provisions.meals]),
  ];
  for (const [id, target] of targets) {
    const missing = target - (sim.save.consumables[id] ?? 0);
    if (missing > 0 && isKnownRecipe(sim.save, id)) cook(sim, id, missing);
  }
}

const isKnownRecipe = (save: SaveData, id: string) => !!recipeById[id] && isKnown(save, recipeById[id]);

/** The strongest healing potion the bot can brew; the minor one until the better recipes are known. */
const brewablePotion = (save: SaveData) => [...shopRules.potions.ladder].reverse().find((id) => isKnownRecipe(save, id)) ?? 'healingPotion';

/** The meal for a run's goal (see BOT_RULES). */
function mealFor(sim: Sim, dungeon: DungeonDef, heroIds: string[], o: Odds): string | null {
  const briefing = todaysBriefing(sim, dungeon);
  const plan = launchPlan(sim.save, dungeon, heroIds, {}, briefing);
  const back = (minutes: number) => sim.collectionAt(sim.now + minutes * 60_000);
  const level = heroIds.reduce((s, id) => s + sim.save.heroes.find((h) => h.id === id)!.level, 0) / heroIds.length;
  const goal = dungeon.isBoss
    ? 'huntersStew'
    : o.success < 0.5
      ? 'comfortBroth'
      : back(plan.minutes * 0.9) < back(plan.minutes)
        ? 'quickBites'
        : level < expectedLevels[highestTier(sim.save) - 1]
          ? 'scholarsPorridge'
          : 'merchantsPie';
  return (sim.save.consumables[goal] ?? 0) > 0 ? goal : null;
}

/** Buys the missing supply at a tavern reachable today, if the stock falls short. */
function topUpSupply(sim: Sim, dungeon: DungeonDef, heroIds: string[], loadout: Loadout, briefing: Briefing) {
  const plan = launchPlan(sim.save, dungeon, heroIds, loadout, briefing);
  if (plan.hunger === 'fed' || !sim.reach.tavern || !isRevealed(sim.save, 'taverns')) return;
  const jerky = supplyItems.find((i) => i.id === 'jerky')!;
  const count = Math.ceil((plan.need - plan.held) / jerky.supply!);
  const at = sim.tavern.position;
  if (count <= 0 || buySupplyProblem(sim.save, count, at, at) !== null) return;
  act(sim, 'emergencySupply', (save) => buySupply(save, count, at, at));
  sim.log.emergencySupply += count;
}

// —— Infusion ——

// —— Recruiting and the Guild Hall ——

function nextRecruitPrice(save: SaveData) {
  return Math.round(recruitPrice('common', offerLevel(save), save.heroes.length, false, highestTier(save)) * (1 - guildBonus(save, 'tavernDiscount')));
}

export function recruitHeroes(sim: Sim) {
  if (!sim.reach.tavern || !isTavernUnlocked(sim.save) || !isRevealed(sim.save, 'taverns')) return;
  for (;;) {
    if (rosterFull(sim.save)) return;
    const owned = new Set(sim.save.heroes.map((h) => h.classId));
    const seen = tavernOffers(sim.save, sim.tavern.id, sim.now).filter((o) => !(o.id in sim.save.takenOffers));
    for (const o of seen) sim.log.offered[o.id] = o.classId;
    const offers = seen
      .filter((o) => sim.save.gold >= o.price + sim.config.recruitReserve)
      .map((offer) => {
        const counters = answersThreat(sim, offer.classId);
        return { offer, score: (counters ? 2 : 0) + (owned.has(offer.classId) ? 0 : 1), positive: traitById[offer.trait]?.positive ? 1 : 0 };
      })
      .sort((a, b) => b.score - a.score || b.positive - a.positive || a.offer.price - b.offer.price);
    const pick = offers[0]?.offer;
    if (!pick) return;
    act(sim, 'recruit', (save) => recruit(save, pick, sim.tavern.position, sim.tavern.position));
    sim.log.places.push({ day: sim.day, kind: 'tavern', tier: highestTier(sim.save), odds: null, won: null });
    sim.log.recruits.push({ day: sim.day, classId: pick.classId, price: pick.price, trait: pick.trait });
    mark(sim, `recruit:${sim.save.heroes.length}`);
  }
}

export function buyGuildRanks(sim: Sim) {
  if (!isGuildUnlocked(sim.save) || !isRevealed(sim.save, 'guildHall')) return;
  for (let bought = true; bought; ) {
    bought = false;
    const reserve = rosterFull(sim.save) ? 0 : nextRecruitPrice(sim.save) + sim.config.recruitReserve;
    for (const id of sim.config.guildPriority) {
      if (rankProblem(sim.save, id)) continue;
      const rank = (sim.save.guild[id] ?? 0) + 1;
      const price = rankPrice(guildTrackById[id], rank).gold;
      if (sim.save.gold - price < reserve) continue;
      act(sim, 'guild', (save) => buyRank(save, id));
      sim.log.guildBuys.push({ day: sim.day, track: id, rank, gold: price });
      if (guildTrackById[id].ranks === 1) mark(sim, `guild:${id}`);
      const building = guildTrackById[id].building;
      if (guildTracks.filter((t) => t.building === building).every((t) => (sim.save.guild[t.id] ?? 0) >= t.ranks)) {
        mark(sim, `building:${building}`);
      }
      bought = true;
      break;
    }
  }
}

// —— Jobs ——

/** The source a station's collections are logged under, separate from walking and map sources. */
export const jobSource = (jobId: string) => `job:${jobId}`;

/** Collects every station's output at the start of a session. */
export function collectJobs(sim: Sim) {
  if (!sim.jobs) return;
  for (const job of jobList) {
    // The gatherer's nodes and wounds are what this collect clears.
    if (job.id === 'gatherer') {
      const detail = jobOutputDetail(sim.save, 'gatherer', sim.now);
      const day = (sim.log.gatherer[sim.day] ??= { nodes: 0, wounds: 0 });
      day.nodes += detail.nodes ?? 0;
      day.wounds += (detail.wounds ?? []).length;
    }
    act(sim, jobSource(job.id), (save) => collectJob(save, job.id, sim.now));
  }
}

/** Puts the least useful free hero on the gatherer when nobody works it (the tutorial excepted). */
export function keepGatherer(sim: Sim) {
  if (!sim.jobs || sim.save.tutorial.step !== 'done' || !isJobOpen(sim.save, 'gatherer') || jobWorker(sim.save, 'gatherer')) return;
  const free = sim.save.heroes.filter((h) => !isBusy(sim.save, h.id));
  if (!free.length) return;
  const pick = [...free].sort((a, b) => statScore(sim.save, a) - statScore(sim.save, b))[0];
  act(sim, 'job', (save) => assignJob(addAnchor(save, sim.location, sim.now), pick.id, 'gatherer', sim.now));
}

const MINUTE = 60_000;

/** Keeps the gatherer's anchor with the player: home while still, and around each walk's loop while walking. */
export function moveGathererAnchor(sim: Sim, walking: boolean) {
  sim.save = addAnchor(sim.save, sim.location, sim.now);
  if (!walking) return;
  const every = gathererRules.anchorEveryMinutes;
  const bearing = (createRng(`gatherer|anchor|${sim.day}`).int(0, 359) * Math.PI) / 180;
  const points = Math.floor(sim.profile.walkMinutes / every);
  for (let k = 1; k <= points; k++) {
    const meters = k * every * playerMetersPerMinute;
    sim.save = addAnchor(sim.save, offsetPosition(sim.location, Math.sin(bearing) * meters, Math.cos(bearing) * meters), sim.now + k * every * MINUTE);
  }
  // Back home: one anchor interval after the last point at the earliest, or the anchor rules would drop it.
  sim.save = addAnchor(sim.save, sim.location, sim.now + Math.max(sim.profile.walkMinutes, (points + 1) * every) * MINUTE);
}

/** Recalls the given working heroes before a send; the output made so far and their settled energy are kept. */
export function recallWorking(sim: Sim, heroIds: string[]) {
  for (const id of heroIds) {
    if (sim.save.heroes.find((h) => h.id === id)?.job) sim.save = recallFromJob(sim.save, id, sim.now);
  }
}

/** Staffs every open station at the end of a session, the one shortest of its material first, with the least useful free heroes. */
export function assignJobs(sim: Sim) {
  if (!sim.jobs) return;
  // The gatherer comes first, or the stations would take every free hero.
  keepGatherer(sim);
  // A station's shortage score: the stock of the material it can produce least of.
  const shortage = (job: JobDef) => {
    const materials = job.id === 'miner' ? jobChoices(sim.save, 'miner') : jobMaterials(job);
    return Math.min(...materials.map((m) => sim.save.materials[m] ?? 0));
  };
  const open = [...openJobs(sim.save)].sort((a, b) => shortage(a) - shortage(b));
  for (const job of open) {
    if (jobWorker(sim.save, job.id)) continue;
    const free = sim.save.heroes.filter((h) => !isBusy(sim.save, h.id));
    if (!free.length) continue;
    const pick = [...free].sort((a, b) => statScore(sim.save, a) - statScore(sim.save, b))[0];
    act(sim, 'job', (save) => assignJob(save, pick.id, job.id, sim.now));
  }
  // The miner digs the unlocked ore the bot holds least of; assignJob above may have just picked another.
  const ores = [...jobChoices(sim.save, 'miner')].sort((a, b) => (sim.save.materials[a] ?? 0) - (sim.save.materials[b] ?? 0));
  if (ores.length > 0 && sim.save.jobChoice.miner !== ores[0]) {
    act(sim, 'job', (save) => setJobChoice(save, 'miner', ores[0], sim.now));
  }
}

// —— Parties and odds ——

const heroKey = (save: SaveData, hero: HeroState, now: number) => {
  const gear = (uid: string | null) => {
    const g = gearOf(save, uid);
    return g ? `${g.uid}${g.rarity}` : '-';
  };
  // HP in 5% steps, so healing heroes don't miss the cache every minute.
  const hp = Math.round((currentHp(save, hero, now) / maxHp(save, hero)) * 20);
  return `${hero.id}:${hero.level}:${gear(hero.equipment.weapon)}:${gear(hero.equipment.armor)}:${gear(hero.equipment.helmet)}:${gear(hero.equipment.offhand)}:${hero.equipment.consumable}:${hp}`;
};

/** Odds with fewer runs than the app, with current HP, remembered for the same heroes, gear, HP, supply and dungeon. */
export function odds(
  sim: Sim,
  save: SaveData,
  heroIds: string[],
  dungeon: DungeonDef,
  runs = sim.config.odds.runs,
  fullHp = false,
  briefing: Briefing | null = null,
): Odds {
  const heroes = save.heroes.filter((h) => heroIds.includes(h.id));
  const active = briefing ?? todaysBriefing(sim, dungeon);
  const { hunger } = launchPlan(save, dungeon, heroIds, {}, active);
  const key = `${runs}|${dungeon.id}|${hunger}|${active.threats.map((t) => `${t.id}${t.level}`).join(',')}|${fullHp}|${heroes.map((h) => heroKey(save, h, sim.now)).sort().join('|')}`;
  let result = sim.oddsCache.get(key);
  if (!result) {
    result = estimateOdds(save, heroIds, dungeon, runs, { now: sim.now, fullHp, briefing: active });
    sim.oddsCache.set(key, result);
  }
  return result;
}

/**
 * When current HP costs the party more than `potionGain` against full HP,
 * drinks potions from the stock at home, most hurt first. Returns whether
 * the party is now rested enough to go.
 */
function restUp(sim: Sim, dungeon: DungeonDef, heroIds: string[]) {
  const gap = () => odds(sim, sim.save, heroIds, dungeon, undefined, true).success - odds(sim, sim.save, heroIds, dungeon).success;
  while (gap() > sim.config.provisions.potionGain) {
    const hurt = heroIds
      .map((id) => sim.save.heroes.find((h) => h.id === id)!)
      .filter((h) => drinkProblem(sim.save, h.id, sim.now) === null)
      .sort((a, b) => currentHp(sim.save, a, sim.now) / maxHp(sim.save, a) - currentHp(sim.save, b, sim.now) / maxHp(sim.save, b))[0];
    if (!hurt || (sim.save.consumables.healingPotion ?? 0) < 1) return false;
    sim.save = drinkPotion(sim.save, hurt.id, sim.now);
    sim.log.potionsAtHome++;
  }
  return true;
}

/**
 * The party's loadout (see rules/loadout.ts): the boss's weakness item, then
 * a healing potion each. An Alchemist fills their second slot with a potion too.
 */
export function withLoadout(save: SaveData, heroIds: string[], dungeon: DungeonDef, briefing: Briefing): SaveData {
  let next = fillPotions(pickWeakness(emptySlots(save, heroIds), heroIds, dungeon), heroIds);
  for (const id of heroIds) {
    const hero = next.heroes.find((h) => h.id === id)!;
    const potion = heldPotion(next);
    if (hasPotionSlot(hero) && !hero.equipment.potion && potion) {
      next = equip(next, id, 'potion', potion);
    }
  }
  return next;
}

/**
 * The heroes and gear for a run, from suggestParty (threats/suggest.ts): the
 * heroes who leave the fewest threat tags missing once dressed from the spare
 * pieces, ties broken by a quick estimate of the prepared party's odds, until
 * the party is full, or covers everything and is safe enough; then dressed in
 * full. The party gets the full estimate, and `swaps` is the gear it puts on
 * at launch. `dress` false keeps everyone's gear as worn.
 */
export function bestParty(sim: Sim, dungeon: DungeonDef, candidates: string[], briefingOf: Briefing | null = null, dress = true) {
  const briefing = briefingOf ?? todaysBriefing(sim, dungeon);
  const empty = emptySlots(sim.save, candidates);
  const quick = (dressed: SaveData, ids: string[]) => {
    const o = odds(sim, withLoadout(dressed, ids, dungeon, briefing), ids, dungeon, sim.config.odds.searchRuns, false, briefing);
    // Progress only breaks ties between equal success odds.
    return o.success + o.progress * 1e-6;
  };
  const suggested = suggestParty(empty, briefing, rosterRules.partySize, { candidates, odds: quick, enough: sim.config.odds.enough, dress });
  const party = suggested.heroIds;
  const save = withLoadout(suggested.save, party, dungeon, briefing);
  return {
    heroIds: party,
    swaps: suggested.swaps,
    odds: party.length ? odds(sim, save, party, dungeon, sim.config.odds.runs, false, briefing) : { success: 0, flawless: 0, progress: 0 },
  };
}

// —— Sanctums and treasure ——

export function challengeSanctums(sim: Sim) {
  if (!isRevealed(sim.save, 'sanctums')) return;
  for (;;) {
    const home = homeHeroes(sim.save).map((h) => h.id);
    const spawns = sim.reach.sanctums.filter((s) => !(s.id in sim.save.usedSanctums));
    if (!sim.save.sigils.length || !home.length || !spawns.length) return;
    let pick: { spawn: SanctumSpawn; tier: number; heroIds: string[]; odds: number } | null = null;
    for (const tier of [...new Set(sim.save.sigils)].sort((a, b) => b - a)) {
      for (const spawn of spawns) {
        const party = bestParty(sim, sanctumDungeon(sanctumById[spawn.sanctumId], tier), home, EMPTY_BRIEFING, false);
        if (party.odds.success >= sim.config.odds.sanctum && (!pick || party.odds.success > pick.odds)) {
          pick = { spawn, tier, heroIds: party.heroIds, odds: party.odds.success };
        }
      }
      if (pick) break;
    }
    if (!pick) return;
    const { spawn, tier, heroIds } = pick;
    recallWorking(sim, heroIds);
    let win = false;
    act(sim, 'sanctum', (save) => {
      const result = challengeSanctum(save, spawn, tier, heroIds, spawn.position, sim.now);
      win = result.result.win;
      return result.save;
    });
    sim.log.sanctums.push({ day: sim.day, tier, odds: pick.odds, win });
    if (win) mark(sim, 'firstSanctumWin');
  }
}

/** A place this far away is reachable today with chance min(1, scale × metres walked ÷ (2 × distance)). */
export const reachChance = (sim: Sim, distance: number) => Math.min(1, (sim.config.reach.scale * sim.reach.meters) / (2 * Math.max(1, distance)));

export function digTreasure(sim: Sim) {
  if (!isRevealed(sim.save, 'treasure')) return;
  for (const map of liveTreasureMaps(sim.save, sim.now)) {
    if (!map.location) act(sim, 'treasure', (save) => readTreasureMap(save, map.id, sim.location, sim.now));
    const spot = sim.save.treasureMaps.find((m) => m.id === map.id)!.location!;
    if (!sim.reach.maps.has(map.id)) sim.reach.maps.set(map.id, sim.rng.chance(reachChance(sim, distanceMeters(sim.location, spot))));
    if (sim.reach.maps.get(map.id)) {
      const dug = collectTreasure(sim.save, map.id, spot, spot, sim.now);
      countLoot(sim, dug.contents, 'treasureSpot');
      act(sim, 'treasure', () => dug.save);
    }
  }
}

// —— Expeditions ——

/**
 * While the prepared party's odds are below `statPotionBelowOdds`, one hero
 * at a time takes the held stat potion or elemental oil that raises the cheap
 * odds estimate the most, in a slot that would otherwise get a healing potion
 * (an oil only when the hero's weapon is still plain); stops when no item
 * helps.
 */
function applyElixirs(sim: Sim, dungeon: DungeonDef, heroIds: string[], loadout: Loadout, briefing: Briefing) {
  const estimate = (save: SaveData) => estimateOdds(save, heroIds, dungeon, sim.config.odds.searchRuns, { now: sim.now, loadout, briefing });
  const ids = [...statPotionIds, ...oilIds];
  const withOne = (save: SaveData, heroId: string, itemId: string) =>
    oilIds.includes(itemId) ? withOil(save, heroId, itemId) : withStatPotion(save, heroId, itemId);
  for (;;) {
    if (!ids.some((id) => (sim.save.consumables[id] ?? 0) > 0)) return;
    const current = estimate(sim.save).success;
    if (current >= sim.config.statPotionBelowOdds) return;
    let best: { heroId: string; itemId: string; odds: number } | null = null;
    for (const heroId of heroIds) {
      for (const itemId of ids.filter((id) => (sim.save.consumables[id] ?? 0) > 0)) {
        const odds = estimate(withOne(sim.save, heroId, itemId)).success;
        if (!best || odds > best.odds) best = { heroId, itemId, odds };
      }
    }
    if (!best || best.odds <= current) return;
    sim.save = withOne(sim.save, best.heroId, best.itemId);
  }
}

export function launch(sim: Sim, dungeon: DungeonDef, party: { heroIds: string[]; swaps: GearSwap[] }, o: Odds) {
  const { heroIds } = party;
  recallWorking(sim, heroIds);
  const briefing = todaysBriefing(sim, dungeon);
  sim.save = withLoadout(applySwaps(emptySlots(sim.save, homeHeroes(sim.save).map((h) => h.id)), party.swaps), heroIds, dungeon, briefing);
  const loadout = { mealId: mealFor(sim, dungeon, heroIds, o) };
  topUpSupply(sim, dungeon, heroIds, loadout, briefing);
  // A revival draught on a tier boss run, a firebomb while a beasts threat is missed.
  if (dungeon.isBoss && !dungeon.overnight) sim.save = withElixir(sim.save, heroIds, 'revivalDraught');
  const beasts = briefingCoverage(sim.save, heroIds, briefing).threats.find((t) => t.threat.id === 'beasts');
  if (beasts && beasts.have < beasts.needed) sim.save = withElixir(sim.save, heroIds, 'firebomb');
  applyElixirs(sim, dungeon, heroIds, loadout, briefing);
  // A smoke bomb in place of a healing potion when the odds stay low.
  const lowOdds = estimateOdds(sim.save, heroIds, dungeon, sim.config.odds.searchRuns, { now: sim.now, loadout, briefing });
  if (lowOdds.success < sim.config.smokeBombBelowOdds) sim.save = withElixir(sim.save, heroIds, 'smokeBomb');
  // The prediction logged is for the party exactly as it leaves.
  let final = estimateOdds(sim.save, heroIds, dungeon, sim.config.odds.runs, { now: sim.now, loadout, briefing });
  const charm = final.success >= sim.config.odds.charm ? pickCharm(sim.save, runSource(dungeon)) : null;
  if (charm) {
    sim.save = withCharm(sim.save, heroIds, charm);
    final = estimateOdds(sim.save, heroIds, dungeon, sim.config.odds.runs, { now: sim.now, loadout, briefing });
  }
  const rarities = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const id of heroIds) {
    const hero = sim.save.heroes.find((h) => h.id === id)!;
    for (const uid of [hero.equipment.weapon, hero.equipment.armor]) {
      const gear = gearOf(sim.save, uid);
      if (gear) rarities[gear.rarity]++;
    }
  }
  const id = `x${sim.save.nextUid}`;
  if (dungeon.overnight) sim.due.overnightExpedition -= 1;
  else sim.due.expeditions -= 1;
  sim.save = startExpedition(sim.save, dungeon.id, heroIds, sim.now, 1, sim.rotation, loadout);
  const level = heroIds.reduce((s, h) => s + sim.save.heroes.find((x) => x.id === h)!.level, 0) / heroIds.length;
  const consumables = heroIds.flatMap((h) => {
    const { consumable, potion } = sim.save.heroes.find((x) => x.id === h)!.equipment;
    return [consumable, potion].filter((c): c is string => !!c);
  });
  const families = familyLevels(partyFamilies(sim.save, heroIds));
  sim.launched.set(id, { odds: final.success, rarities, day: sim.day, hour: (sim.now - sim.startedAt) / 3_600_000, level, consumables, families });
}

/** The loot row a run of this dungeon rolls, for charms. */
const runSource = (dungeon: DungeonDef): LootSourceId => (dungeon.overnight ? 'overnightExpedition' : dungeon.isBoss ? 'tierBoss' : 'dungeonRun');

/** Whether a win here could drop a weapon or armour blueprint of the dungeon's tier the roster favours and doesn't know yet. */
function dropsBlueprint(save: SaveData, dungeon: DungeonDef) {
  return recipes.some((recipe) => {
    const item = forgedItem(recipe);
    return (
      item?.tier === dungeon.tier &&
      !save.knownRecipes.includes(recipe.id) &&
      save.heroes.some((h) => affinityOf(h.classId, item.gearType) === 'favoured')
    );
  });
}

/**
 * Gold-equivalent of a run: gold for the share cleared, the day's first win
 * and a new tier's first clear (their rows' gold) and XP. The loot categories
 * beyond gold are not valued.
 */
function expectedValue(sim: Sim, dungeon: DungeonDef, o: Odds, heroIds: string[]) {
  const mid = ((dungeon.gold[0] + dungeon.gold[1]) / 2) * (1 + guildBonus(sim.save, 'gold'));
  const { firstWin, firstTierClear } = lootConfig.bonusRows;
  const newTier = !sim.save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const bonus =
    (firstWinAvailable(sim.save, dungeon, sim.now) ? dungeon.gold[1] * firstWin.gold : 0) + (newTier ? dungeon.gold[1] * firstTierClear.gold : 0);
  const tierShare = xpRules.lowerTierShare[Math.min(xpRules.lowerTierShare.length - 1, highestTier(sim.save) - dungeon.tier)];
  // Heroes above the tier band's top plus the margin earn the soft-cap share of that XP.
  const bandTop = lootConfig.manuals.topLevelByTier[highestTier(sim.save) - 1] + xpRules.aboveBandMargin;
  const xpShares = heroIds.reduce(
    (sum, id) => sum + ((sim.save.heroes.find((h) => h.id === id)?.level ?? 0) >= bandTop ? xpRules.aboveBandShare : 1),
    0,
  );
  return mid * o.progress + o.success * bonus + dungeon.xp * tierShare * o.progress * xpShares * sim.config.xpGoldValue;
}

export function sendExpeditions(sim: Sim) {
  sim.expeditionStop = { reason: null, launched: false };
  const dueExpeditions = () => (sim.due.expeditions ?? 0) >= 1;
  const top = highestTier(sim.save);
  const open = dungeons.filter((d) => !d.overnight && d.tier >= top - 1 && isDungeonAvailable(sim.save, d, sim.rotation));
  // The overnight expedition of the top two tiers joins the ranking when the next
  // session is at least a full patrol away (the day's last session, usually).
  // One patrol can be out at a time.
  const gapToNextSession = sim.collectionAt(sim.now + 1) - sim.now;
  const overnight = dungeons.filter(
    (d) =>
      d.overnight &&
      (sim.due.overnightExpedition ?? 0) >= 1 &&
      d.tier >= top - 1 &&
      !overnightUnderWay(sim.save) &&
      isDungeonAvailable(sim.save, d) &&
      gapToNextSession >= d.durationMinutes * 60_000 * (1 - guildBonus(sim.save, 'fasterExpeditions')),
  );
  const unbeatenBoss = open.find((d) => d.isBoss && d.tier === top && !sim.save.clearedDungeons.includes(d.id));
  const idle = () => homeHeroes(sim.save).map((h) => h.id);

  if (unbeatenBoss && idle().length && sim.due.expeditions >= 1) {
    const party = bestParty(sim, unbeatenBoss, idle());
    if (party.odds.success >= sim.config.odds.boss && restUp(sim, unbeatenBoss, party.heroIds)) {
      launch(sim, unbeatenBoss, party, odds(sim, sim.save, party.heroIds, unbeatenBoss));
      sim.expeditionStop.launched = true;
    }
  }
  sim.waiting = new Set();
  while (idle().length) {
    const options = [...open, ...overnight]
      .filter((d) => d !== unbeatenBoss && !sim.waiting.has(d.id) && (d.overnight ? !overnightUnderWay(sim.save) : sim.due.expeditions >= 1))
      .map((d) => {
        const party = bestParty(sim, d, idle());
        const hours = (sim.collectionAt(sim.now + d.durationMinutes * (1 - guildBonus(sim.save, 'fasterExpeditions')) * 60_000) - sim.now) / 3_600_000;
        return { d, party, score: expectedValue(sim, d, party.odds, party.heroIds) / Math.max(0.1, hours) };
      });
    // The top tier's next uncleared chain dungeon opens the one after it, so it is pushed like the boss.
    const nextInChain = open.find((d) => d.tier === top && !d.isBoss && d.chainIndex !== undefined && !sim.save.clearedDungeons.includes(d.id));
    const threshold = (d: DungeonDef) =>
      d === nextInChain
        ? Math.min(sim.config.odds.boss, sim.profile.oddsThreshold)
        : d.tier === top && dropsBlueprint(sim.save, d)
          ? sim.config.odds.blueprint
          : sim.profile.oddsThreshold;
    const good = options.filter((o) => o.party.odds.success >= threshold(o.d)).sort((a, b) => b.score - a.score);
    // The chain: the highest-difficulty dungeon of the top tier that passes first (uncleared ones first), else the best odds.
    const uncleared = (d: DungeonDef) => (sim.save.clearedDungeons.includes(d.id) ? 1 : 0);
    const hardest = good
      .filter((o) => o.d.tier === top && !o.d.overnight)
      .sort(
        (a, b) =>
          difficultyRules.order.indexOf(b.d.difficulty) - difficultyRules.order.indexOf(a.d.difficulty) || uncleared(a.d) - uncleared(b.d),
      );
    let pick = hardest[0] ?? good.sort((a, b) => b.party.odds.success - a.party.odds.success)[0];
    if (!pick && sim.save.expeditions.length === 0) {
      pick = options.filter((o) => o.party.odds.success >= sim.config.odds.fallback).sort((a, b) => b.party.odds.success - a.party.odds.success)[0];
    }
    if (!pick) {
      // Idle heroes that form no party at all are as good as none.
      const formed = options.some((o) => o.party.heroIds.length > 0);
      if (dueExpeditions()) sim.expeditionStop.reason = formed ? (sim.waiting.size > 0 ? 'hp' : 'odds') : 'noParty';
      return;
    }
    if (!restUp(sim, pick.d, pick.party.heroIds)) {
      sim.waiting.add(pick.d.id);
      continue;
    }
    launch(sim, pick.d, pick.party, odds(sim, sim.save, pick.party.heroIds, pick.d));
    sim.expeditionStop.launched = true;
  }
  if (dueExpeditions() && !idle().length) sim.expeditionStop.reason = 'noParty';
}

/** Counts every category a roll dropped, for the observed pacing, and every piece of gear and every relic it granted, with the row's source. */
export function countLoot(sim: Sim, loot: Loot, source: LootSourceId) {
  for (const category of loot.dropped) sim.log.loot[category] = (sim.log.loot[category] ?? 0) + 1;
  for (const piece of loot.gear) sim.log.gearLoot.push({ day: sim.day, source, itemId: piece.itemId, rarity: piece.rarity });
  for (const relicId of loot.relics) sim.log.gearLoot.push({ day: sim.day, source, itemId: `relic:${relicId}`, rarity: null });
  for (const drop of loot.trophies ?? []) sim.log.trophies.push({ day: sim.day, source, ...drop });
  for (const stack of loot.scavenged ?? []) {
    const byDay = (sim.log.scavenge[sim.day] ??= {});
    byDay[stack.materialId] = (byDay[stack.materialId] ?? 0) + stack.amount;
  }
}

/** Resolves one expedition through the game, and logs it with the abilities that fired in its run. */
export function collectExpedition(sim: Sim, expedition: ActiveExpedition) {
  const dungeon = dungeonById[expedition.dungeonId];
  const briefing = expedition.briefing ?? EMPTY_BRIEFING;
  const run = simulateRun(prepareParty(sim.save, expedition.heroIds), dungeon, `${expedition.seed}|run`, {
    guaranteed: expedition.guaranteed,
    ...runProvisions(expedition.hunger ?? 'fed', { mealId: expedition.mealId, optIn: expedition.optIn }, briefing),
  });
  const classes = expedition.heroIds.map((id) => sim.save.heroes.find((h) => h.id === id)!.classId);

  const before = sim.save;
  const { save, report } = resolveExpedition(before, expedition);
  countLoot(sim, report.loot, runSource(dungeon));
  const source = expedition.guaranteed ? 'tutorial' : 'dungeon';
  // Materials through `act` (with the gold held back), then the gold split by source.
  act(sim, source, () => ({ ...save, gold: before.gold }));
  sim.save = save;
  if (report.gold > 0) sim.log.goldIn.push({ day: sim.day, source, amount: report.gold });

  const effects: Record<string, number> = {};
  const classEffects: Record<string, number> = {};
  for (const effect of run.encounters.flatMap((e) => e.effects)) {
    const key = effect.tag ? `${effect.key}:${effect.tag}` : effect.key;
    effects[key] = (effects[key] ?? 0) + 1;
    const classId = effect.heroId ? sim.save.heroes.find((h) => h.id === effect.heroId)?.classId : 'local';
    const byClass = `${classId}|${effect.key}`;
    classEffects[byClass] = (classEffects[byClass] ?? 0) + 1;
  }
  // Signatures that work on the briefing or the loot rather than in an encounter.
  const classOf = (heroId: string) => sim.save.heroes.find((h) => h.id === heroId)?.classId;
  const tally = (heroId: string | null | undefined, key: string) => {
    if (!heroId) return;
    const byClass = `${classOf(heroId)}|${key}`;
    classEffects[byClass] = (classEffects[byClass] ?? 0) + 1;
  };
  tally(run.signed.lowered?.heroId, 'lowerThreat');
  tally(run.signed.cancelledBy, 'cancelRestriction');
  const launched = sim.launched.get(expedition.id);
  sim.log.expeditions.push({
    day: launched?.day ?? sim.day,
    hour: launched?.hour ?? 0,
    id: expedition.id,
    dungeonId: dungeon.id,
    tier: dungeon.tier,
    boss: !!dungeon.isBoss,
    overnight: !!dungeon.overnight,
    threats: run.threats.map((t) => `${t.threat.id} L${t.threat.level} ${t.state}`).join(', '),
    classes,
    odds: launched?.odds ?? 1,
    success: report.success,
    outcome: report.outcome,
    gold: report.gold,
    xp: report.xp,
    rarities: launched?.rarities ?? { common: 0, uncommon: 0, rare: 0, legendary: 0 },
    effects,
    classEffects,
    hours: (expedition.endsAt - expedition.startedAt) / 3_600_000,
    level: launched?.level ?? 1,
    firstWin: !!report.firstWin,
    blueprint: report.loot.recipeIds.length > 0,
    startHp: report.heroHp.reduce((s, h) => s + (h.before ?? h.maxHp) / Math.max(1, h.maxHp), 0) / report.heroHp.length,
    hunger: report.hunger ?? 'fed',
    supplyUsed: report.supplyUsed ?? 0,
    meal: report.mealId ?? null,
    potions: report.consumablesUsed.filter((id) => id === 'healingPotion').length,
    consumables: launched?.consumables ?? [],
    families: launched?.families ?? {},
    cycleHours: (sim.now - sim.startedAt) / 3_600_000 - (launched?.hour ?? 0),
  });
  if (report.success && dungeon.isBoss) mark(sim, `boss:${dungeon.tier}`);
}

/** How far the bot puts a quest's target: the middle of its band, or the strange mark's distance. */
const questDistance = (quest: Quest) =>
  quest.band === 'secret' ? (questRules.secret.markMeters[0] + questRules.secret.markMeters[1]) / 2 : (questRules.bandMeters[quest.band][0] + questRules.bandMeters[quest.band][1]) / 2;

/** Herbs, berries and mushrooms a walk brought in count for "gather on the way" quests. */
export function noteQuestGathers(sim: Sim, changes: Record<string, number>) {
  for (const [materialId, amount] of Object.entries(changes)) {
    if (amount > 0) sim.save = questEvent(sim.save, { kind: 'gathered', materialId, amount }, sim.now);
  }
}

/** A quest claim's loot row, by band. */
const QUEST_SOURCE: Record<Quest['band'], LootSourceId> = { short: 'questShort', medium: 'questMedium', long: 'questLong', secret: 'secretQuest' };

/**
 * Daily quests, each session: the day's arrive and the list is opened (every
 * new quest accepted, a place target at the middle of its band); on walks,
 * the oldest targets are reached and done, as many as the profile's quests
 * owed (four at once on a walk with a secret quest owed, so it pops; its
 * strange mark is always reached); finished quests are claimed. Walks,
 * patrols, gathering and sales count through the game's own events.
 */
export function doQuests(sim: Sim, walking: boolean) {
  sim.save = questUpkeep(sim.save, sim.now);
  if (!isRevealed(sim.save, 'quests')) return;
  const accept = (quest: Quest): Quest => {
    if (quest.acceptedAt !== null) return quest;
    const bearing = sim.rng.next() * 2 * Math.PI;
    const distance = questDistance(quest);
    const position = offsetPosition(sim.location, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
    return {
      ...quest,
      acceptedAt: sim.now,
      target: needsPlace(quest) ? { placeId: `sim:${quest.id}`, kind: quest.objective === 'mark' ? 'mark' : 'chapel', position, from: sim.location, expiresAt: quest.expiresAt } : null,
    };
  };
  sim.save = { ...sim.save, quests: { ...sim.save.quests, list: sim.save.quests.list.map(accept) } };

  // A secret quest owed: four targets done on this walk, so the secret quest pops (four within 5 hours).
  const open = sim.save.quests.list.filter((q) => q.doneAt === null && q.target && q.band !== 'secret');
  let outing = walking && open.length >= questRules.secret.completions && takeVisit(sim, 'secretQuest') ? questRules.secret.completions : 0;
  for (const quest of sim.save.quests.list) {
    if (!walking || quest.doneAt !== null || !quest.target) continue;
    // The strange mark is close by: always reached on the walk it shows.
    if (quest.band !== 'secret') {
      if (outing > 0) outing -= 1;
      else if (sim.due.quests >= 1) sim.due.quests -= 1;
      else continue;
    }
    if (quest.objective === 'mark') {
      const reached = reachMark(sim.save, quest.id, sim.now, () => false);
      sim.save = reached.save;
      if (reached.tip?.kind === 'tip') sim.log.quests.tips++;
    } else {
      sim.save = complete(sim.save, { ...quest, progress: quest.amount }, sim.now);
    }
  }

  for (const quest of sim.save.quests.list.filter((q) => q.doneAt !== null)) {
    const claimed = claimQuest(sim.save, quest.id, sim.now);
    countLoot(sim, claimed.loot, QUEST_SOURCE[quest.band]);
    act(sim, 'quest', () => claimed.save);
    sim.log.quests.claimed[quest.band]++;
  }
}
