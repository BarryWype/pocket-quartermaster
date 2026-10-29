import { dungeons } from '@/content/dungeons';
import { affinityRules, classAffinities, gearProfiles, type Affinity } from '@/content/equipment';
import { mobById } from '@/content/enemies';
import { guildTrackById, guildTracks } from '@/content/guild';
import { heroClasses, xpRules } from '@/content/heroes';
import { dungeonById, itemById, recipeById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';
import { recipes } from '@/content/recipes';
import { restrictionRules, approachRules } from '@/content/threats';
import { firstClearRules } from '@/content/rotation';
import { traitById } from '@/content/traits';

import { canCraft, craft, craftableCount, craftMany, forgedItem, isKnown } from '../crafting/crafting';
import { canInfuse, infuse } from '../crafting/infusion';
import { briefingFor, type Rotation } from '../dungeons/rotation';
import { dungeonTagWeights } from '../dungeons/tags';
import { ELEMENTS, stoneId, weaponMultiplier, type Element } from '../elements';
import {
  blueprintBonusAvailable,
  bossBonusAvailable,
  guaranteedBlueprint,
  highestUnlockedTier,
  isDungeonAvailable,
  launchPlan,
  overnightUnderWay,
  resolveExpedition,
  runProvisions,
  startExpedition,
  type Loadout,
} from '../expeditions/expeditions';
import { estimateOdds, type Odds } from '../expeditions/odds';
import { charmItems, mealItems, supplyHeld, supplyItems } from '../expeditions/provisions';
import { answersMemberOf, EMPTY_BRIEFING, prepareParty, simulateRun } from '../expeditions/simulate';
import { masteryCap, masteryOf, masteryTypeOf } from '../forging/mastery';
import { gearStats, qualityOdds, type GearQualityRoll } from '../forging/quality';
import { rollToScale } from '../forging/roll';
import { salvage } from '../forging/salvage';
import { distanceMeters } from '../generation/geo';
import type { Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { buyRank, guildBonus, isGuildUnlocked, partySize, rankPrice, rankProblem } from '../guild/guild';
import { hasMaterials } from '../inventory';
import type { PatrolKind, PatrolSubject, TravellerKind } from '../patrols/generate';
import type { TravellerReward } from '../patrols/travellers';
import { collectTreasure, liveTreasureMaps, readTreasureMap } from '../rewards/treasure';
import { challengeSanctum, sanctumById, sanctumDungeon, type SanctumSpawn } from '../sanctums/sanctums';
import type { SaveData } from '../save';
import { buySupply, buySupplyProblem, isTavernUnlocked, offerLevel, recruit, recruitPrice, tavernOffers, type TavernSpawn } from '../taverns/taverns';
import { currentHp, drinkPotion, drinkProblem, maxHp } from '../team/health';
import { affinityOf, equip, equipPreview, heroDamageStat, heroStats, isOnExpedition, rosterFull, unequip } from '../team/team';
import { gearApproachBonus, approachScore, pendingApproachPicks, pickApproach } from '../team/stats';
import { heroAnswers, type AnswersMember } from '../threats/answers';
import { scoreThreat } from '../threats/score';
import type { ActiveExpedition, Approach, ArmourType, Briefing, DungeonDef, GearDef, HeroClassId, HeroState, OffhandType, Quality, RecipeDef, Stats, WeaponType } from '../types';
import { expectedLevels, type Profile, type SimConfig } from './config';
import type { PatrolRates } from './patrols';
import { PICKAXES, type WalkRates } from './walking';

export const QUALITY_ORDER: Quality[] = ['crappy', 'normal', 'rare', 'legendary'];

/** A hypothetical forged piece at Normal quality with a neutral roll, for ranking recipes. */
const NEUTRAL = { quality: 'normal' as const, roll: 1 };

export type ExpeditionRow = {
  day: number;
  /** Hours since the run started. */
  hour: number;
  id: string;
  dungeonId: string;
  tier: number;
  boss: boolean;
  /** An overnight quest: rewards follow time away, not taps. */
  overnight: boolean;
  /** The briefing's threats, e.g. "ambush L2 met". */
  threats: string;
  classes: string[];
  odds: number;
  success: boolean;
  outcome: string;
  gold: number;
  xp: number;
  /** Quality of the party's worn weapons and armour at launch. */
  qualities: Record<Quality, number>;
  /** Abilities that changed an encounter, e.g. "calm" or "tagBonus:beast". */
  effects: Record<string, number>;
  /** The same by the class that used them, as "class|effect" ("local" for a local's tip). */
  classEffects: Record<string, number>;
  /** Hours from launch to the end of the run. */
  hours: number;
  /** The party's average level at launch. */
  level: number;
  /** A boss win that claimed the daily bonus. */
  bossBonus: boolean;
  /** A blueprint taught by the day's first win in a pool dungeon. */
  blueprint: boolean;
  /** The party's average share of max HP at launch. */
  startHp: number;
  hunger: string;
  supplyUsed: number;
  meal: string | null;
  /** Healing potions drunk in the dungeon. */
  potions: number;
};

export type CraftRow = {
  day: number;
  kind: 'pickaxe' | 'upgrade' | 'reforge' | 'consumable' | 'provision' | 'salvage' | 'tutorial';
  itemId: string;
  tier: number;
  quality: Quality | null;
  /** The piece's stat roll (1–7 scale), for forged gear. */
  roll: number | null;
  /** Mastery level of the piece's type after the forge. */
  mastery: number | null;
  /** Forged with the type's mastery already at the item tier's cap. */
  maxed?: boolean;
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
  charters: number;
  guildRanks: number;
  mastery: Record<string, number>;
  stock: Record<string, number>;
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
  goldOut: { day: number; sink: string; amount: number }[];
  /** Material → source → amount gathered (or sink → amount used). */
  gathered: Record<string, Record<string, number>>;
  used: Record<string, Record<string, number>>;
  /** Tier → material → how often it was missing for a forge the bot wanted. */
  missing: Record<number, Record<string, number>>;
  sanctums: { day: number; tier: number; odds: number; win: boolean }[];
  recruits: { day: number; classId: string; price: number; trait: string }[];
  guildBuys: { day: number; track: string; rank: number; gold: number }[];
  /** Everything the walks met — patrols fought and travellers helped. */
  patrols: PatrolLog;
  /** Healing potions drunk at home. */
  potionsAtHome: number;
  /** Emergency jerky bought at taverns. */
  emergencySupply: number;
};

/** Everything met on a walk, at the tier it would have fought at. */
export type PatrolSeenRow = { kind: PatrolSubject; tier: number; elite: boolean };
/** A patrol fight the player's party took on; xp is the win's XP summed over the party. */
export type PatrolFightRow = { kind: PatrolKind; tier: number; elite: boolean; won: boolean; xp: number };
/** A fight the background escort hero took on by itself. */
export type EscortFightRow = { kind: PatrolKind; tier: number; won: boolean; knockout: boolean; xp: number };

export type PatrolLog = {
  seen: PatrolSeenRow[];
  fights: PatrolFightRow[];
  escortFights: EscortFightRow[];
  /** Spawns the escort skipped because its HP was under 50%. */
  escortPauses: number;
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
  rates: WalkRates;
  patrolRates: PatrolRates;
  /** Patrol spawns placed so far, for their unique ids. */
  patrolSpawns: number;
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
  launched: Map<string, Pick<ExpeditionRow, 'odds' | 'qualities' | 'day' | 'hour' | 'level'>>;
  /** Dungeons left for a later session this one, waiting for the heroes to heal. */
  waiting: Set<string>;
  log: RunLog;
};

// —— Bookkeeping ——

/** Marks the milestone for each tier whose core kit (sword, bow, wand, mail) is fully known. */
export function markCoreKit(sim: Sim) {
  for (let tier = 1; tier <= 5; tier++) {
    const kit = (['sword', 'bow', 'wand', 'mail'] as const).map((type) => recipeById[`${type}${tier}`]?.id);
    if (kit.every((id) => id && sim.save.knownRecipes.includes(id))) mark(sim, `coreKit:${tier}`);
  }
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
    if (delta > 0 && id.endsWith('Stone')) mark(sim, 'firstStone');
  }
  return changes;
}

// —— Helpers ——

export const highestTier = highestUnlockedTier;
export const homeHeroes = (save: SaveData) => save.heroes.filter((h) => !isOnExpedition(save, h.id));
const gearOf = (save: SaveData, uid: string | null) => save.gear.find((g) => g.uid === uid);

/** How much a piece adds to a hero: their damage stat for weapons and off-hands, armour, resistance and a share of HP otherwise. */
export function gearScore(hero: HeroState, item: GearDef, gear: GearQualityRoll) {
  const stats = gearStats(item, gear);
  if (item.slot === 'armor') return (stats.armour ?? 0) + (stats.resistance ?? 0) + (stats.hp ?? 0) / 8;
  const damage = heroClasses[hero.classId].damageStat === 'magic' ? (stats.magic ?? 0) : (stats.power ?? 0);
  const affinity = item.gearType ? affinityRules[affinityOf(hero.classId, item.gearType)] : 1;
  return (damage + (stats.armour ?? 0) + (stats.resistance ?? 0)) * affinity;
}

/** A hero's stats rolled into one number: their damage stat, armour, resistance and a share of HP. */
function statScore(save: SaveData, hero: HeroState, stats: Stats = heroStats(save, hero)) {
  return stats[heroDamageStat(save, hero)] + stats.armour + stats.resistance + stats.hp / 8;
}

/** How much a hero's worn piece is worth on their real stats, affinity and casting penalty included. */
function wornScore(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'offhand') {
  if (!hero.equipment[slot]) return 0;
  const bare = unequip(save, hero.id, slot);
  return statScore(save, hero) - statScore(bare, bare.heroes.find((h) => h.id === hero.id)!);
}

/** How much equipping a piece would change a hero's real stats; 0 when it cannot go in. */
function equipGain(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'offhand', uid: string) {
  const preview = equipPreview(save, hero.id, slot, uid);
  return preview ? statScore(save, hero, preview.after) - statScore(save, hero, preview.before) : 0;
}

/** Whether today's run against this dungeon deals fire damage: a fire element threat, or fire mobs. */
const dealsFire = (dungeon: DungeonDef, briefing: Briefing) =>
  briefing.threats.some((t) => t.id === 'element' && t.element === 'fire') || (dungeonTagWeights(dungeon).fire ?? 0) > 0;

/** The class's weapon of choice: its first favoured weapon type that rolls with the class's damage stat. */
const weaponTypeFor = (classId: HeroClassId): WeaponType | null => {
  const favoured = (Object.entries(classAffinities[classId]) as [WeaponType | ArmourType, Affinity][])
    .filter(([type, affinity]) => affinity === 'favoured' && gearProfiles[type]?.slot === 'weapon')
    .map(([type]) => type as WeaponType);
  return favoured.find((type) => gearProfiles[type].damageStat === heroClasses[classId].damageStat) ?? favoured[0] ?? null;
};

/** The class's armour of choice: the first favoured armour type. */
const armourTypeFor = (classId: HeroClassId): ArmourType | null => {
  const favoured = (['plate', 'mail', 'leather', 'robes'] as ArmourType[]).find((type) => classAffinities[classId][type] === 'favoured');
  return favoured ?? null;
};

/** The off-hand that fits the hero's weapon: quiver for a bow, focus for a Magic weapon, shield for a one-handed Power weapon. */
function offhandTypeFor(save: SaveData, hero: HeroState): OffhandType | null {
  const weapon = gearOf(save, hero.equipment.weapon);
  const item = weapon ? (itemById[weapon.itemId] as GearDef) : null;
  if (!item || item.twoHanded) return null;
  if (item.gearType === 'bow') return 'quiver';
  return item.damageStat === 'magic' ? 'focus' : 'shield';
}

/** A hypothetical member of a class: its best weapon, no kit or salve. */
const offerMember = (classId: HeroClassId): AnswersMember => {
  const gearType = weaponTypeFor(classId);
  const profile = gearType ? gearProfiles[gearType] : null;
  return {
    heroId: `offer:${classId}`,
    classId,
    traitId: 'none',
    gearKeywords: profile
      ? profile.keywords.map((keyword) => ({ keyword, magic: profile.damageStat === 'magic' }))
      : [],
    kit: null,
    salveElement: null,
    classResists: heroClasses[classId].resists ?? [],
  };
};

/** Whether the class's answers turn one of today's open tier threats from missed to met. */
function answersThreat(sim: Sim, classId: HeroClassId): boolean {
  const tier = highestTier(sim.save);
  const open = dungeons.filter((d) => d.tier === tier && !d.overnight && isDungeonAvailable(sim.save, d, sim.rotation));
  const home = homeHeroes(sim.save).map((hero) => answersMemberOf(prepareParty(sim.save, [hero.id])[0]));
  const offer = offerMember(classId);
  for (const dungeon of open) {
    const briefing = briefingFor(sim.rotation, dungeon);
    for (const threat of briefing.threats) {
      const now = scoreThreat(threat, home.map((m) => heroAnswers(m, briefing.restriction)));
      if (now.state === 'met') continue;
      const withOffer = scoreThreat(threat, [...home, offer].map((m) => heroAnswers(m, briefing.restriction)));
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

/** The order picks fall back through when the class's approach is at the cap. */
const APPROACH_ORDER: Approach[] = ['might', 'finesse', 'wits', 'faith', 'presence'];

/** The approach each class picks first, from the marked columns of classes.csv. */
const classApproach: Record<HeroClassId, Approach> = {
  warrior: 'might',
  barbarian: 'might',
  paladin: 'faith',
  ranger: 'wits',
  thief: 'finesse',
  fireMage: 'might',
  frostMage: 'wits',
  sorcerer: 'wits',
  cleric: 'faith',
  druid: 'might',
  troubadour: 'presence',
};

/** Spends every pending pick: the class's marked approach, then the next one below the cap. */
export function spendPicks(sim: Sim) {
  for (const { id } of sim.save.heroes) {
    for (;;) {
      const hero = sim.save.heroes.find((h) => h.id === id)!;
      if (pendingApproachPicks(hero) < 1) break;
      const want = classApproach[hero.classId];
      const order = [want, ...APPROACH_ORDER.filter((approach) => approach !== want)];
      const approach = order.find((a) => approachScore(hero, a, gearApproachBonus(sim.save, hero)) < approachRules.max);
      if (!approach) break;
      act(sim, 'approach', (save) => pickApproach(save, id, approach));
    }
  }
}

// —— Forging ——

const forgeRecipes = recipes.filter((r) => forgedItem(r));

/** The best-tier piece a hero could get for a slot from the known recipes, the class's favoured type first. */
function bestRecipe(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor' | 'offhand') {
  const want = slot === 'weapon' ? weaponTypeFor(hero.classId) : slot === 'armor' ? armourTypeFor(hero.classId) : offhandTypeFor(save, hero);
  const rank = (item: GearDef) => [item.tier, item.gearType === want ? 1 : 0, gearScore(hero, item, NEUTRAL)] as const;
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
  const type = masteryTypeOf(item);
  const mastery = masteryOf(sim.save, type).level;
  const maxed = masteryOf(before, type).level >= masteryCap(item.tier);
  sim.log.crafts.push({ day: sim.day, kind, itemId: item.id, tier: item.tier, quality: gear.quality, roll: rollToScale(gear.roll ?? 1), mastery, maxed, materials });
  if (gear.quality === 'rare' || gear.quality === 'legendary') mark(sim, `rare:${item.tier}`);
  if (gear.quality === 'legendary') mark(sim, `legendary:${item.tier}`);
  for (let tier = 1; tier <= 5; tier++) if (mastery >= masteryCap(tier)) mark(sim, `masteryCap:${tier}`);
  return gear;
}

/** Gives every spare piece to the home hero it helps most, then salvages what nobody wants. */
function distribute(sim: Sim) {
  const slots = ['weapon', 'armor', 'offhand'] as const;
  for (;;) {
    const worn = new Set(sim.save.heroes.flatMap((h) => slots.map((slot) => h.equipment[slot])));
    let best: { hero: HeroState; uid: string; slot: (typeof slots)[number]; gain: number } | null = null;
    for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid))) {
      const item = itemById[gear.itemId] as GearDef;
      if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'offhand') continue;
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
  for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid))) {
    const item = itemById[gear.itemId] as GearDef;
    const materials = act(sim, 'salvage', (save) => salvage(save, gear.uid));
    sim.log.crafts.push({ day: sim.day, kind: 'salvage', itemId: item.id, tier: item.tier, quality: gear.quality, roll: null, mastery: null, materials });
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

/** The chance a re-forge beats the piece's quality at the current mastery. */
function betterChance(save: SaveData, item: GearDef, quality: Quality) {
  const odds = qualityOdds(masteryOf(save, masteryTypeOf(item)).level, item.tier);
  return QUALITY_ORDER.slice(QUALITY_ORDER.indexOf(quality) + 1).reduce((sum, q) => sum + odds[q], 0) / 100;
}

export function forge(sim: Sim) {
  const owned = PICKAXES.filter((id) => sim.save.tools.includes(id)).length;
  const pickaxe = recipeById[PICKAXES[owned]];
  if (pickaxe && sim.save.knownRecipes.includes(pickaxe.id) && smeltFor(sim, pickaxe.inputs) && canCraft(sim.save, pickaxe)) {
    act(sim, 'pickaxe', (save) => craft(save, pickaxe));
    sim.log.crafts.push({ day: sim.day, kind: 'pickaxe', itemId: pickaxe.id, tier: owned + 1, quality: null, roll: null, mastery: null, materials: {} });
    mark(sim, `pickaxe:${pickaxe.id}`);
  } else if (pickaxe && sim.save.knownRecipes.includes(pickaxe.id)) {
    recordMissing(sim, pickaxe);
  }

  // Upgrades: a better tier for a slot, biggest gain first.
  for (let i = 0; i < 30; i++) {
    const upgrades = homeHeroes(sim.save)
      .flatMap((hero) => {
        const slots = (['weapon', 'armor', 'offhand'] as const).filter((slot) => slot !== 'offhand' || offhandTypeFor(sim.save, hero));
        return slots.map((slot) => {
          const best = bestRecipe(sim.save, hero, slot);
          const current = gearOf(sim.save, hero.equipment[slot]);
          if (!best || (current && (itemById[current.itemId] as GearDef).tier >= best.item.tier)) return null;
          return { recipe: best.recipe, gain: gearScore(hero, best.item, NEUTRAL) - wornScore(sim.save, hero, slot) };
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

  // Re-forges: worn pieces of the best known tier, worst quality first, keeping one more forge's materials.
  for (let i = 0; i < sim.config.reforgesPerSession; i++) {
    const candidates = homeHeroes(sim.save)
      .flatMap((hero) =>
        (['weapon', 'armor', 'offhand'] as const).map((slot) => {
          const gear = gearOf(sim.save, hero.equipment[slot]);
          const best = bestRecipe(sim.save, hero, slot);
          if (!gear || !best || gear.itemId !== best.item.id) return null;
          const twice = best.recipe.inputs.map((s) => ({ ...s, amount: s.amount * 2 }));
          if (betterChance(sim.save, best.item, gear.quality) < sim.config.reforgeChance || !hasMaterials(sim.save.materials, twice) || !canCraft(sim.save, best.recipe)) return null;
          return { recipe: best.recipe, quality: QUALITY_ORDER.indexOf(gear.quality) };
        }),
      )
      .filter((c) => c !== null)
      .sort((a, b) => a.quality - b.quality);
    if (!candidates[0]) break;
    forgeGear(sim, candidates[0].recipe, 'reforge');
  }

}

// —— Provisions ——

/** Crafts up to `count` of a Provisions recipe at once, logged under its tab (kitchen or alchemy). */
function cook(sim: Sim, itemId: string, count: number) {
  const recipe = recipeById[itemId];
  const n = Math.min(count, craftableCount(sim.save, recipe));
  if (n <= 0) return 0;
  act(sim, recipe.tab ?? 'alchemy', (save) => craftMany(save, recipe, n));
  for (let i = 0; i < n; i++) sim.log.crafts.push({ day: sim.day, kind: 'provision', itemId, tier: 0, quality: null, roll: null, mastery: null, materials: {} });
  return n;
}

/**
 * Supply first, cooked in batches (jerky while meat lasts, then trail mix);
 * then potions, meals and charms up to their stock. The bot equips no kits
 * and never opts into an opportunity.
 */
export function stockProvisions(sim: Sim) {
  const { provisions } = sim.config;
  const bySupply = [...supplyItems].sort((a, b) => b.supply! - a.supply!);
  while (supplyHeld(sim.save.consumables) < provisions.supplyBuffer) {
    if (!bySupply.some((item) => cook(sim, item.id, provisions.batch) > 0)) break;
  }
  const fireToday = dungeons.some(
    (d) => isDungeonAvailable(sim.save, d, sim.rotation) && dealsFire(d, briefingFor(sim.rotation, d)),
  );
  const targets: [string, number][] = [
    ...Object.entries(sim.config.stock).filter(([id]) => id !== 'emberWardSalve' || fireToday),
    ...mealItems.map((i): [string, number] => [i.id, provisions.meals]),
    ...charmItems.map((i): [string, number] => [i.id, provisions.charms]),
  ];
  for (const [id, target] of targets) {
    const missing = target - (sim.save.consumables[id] ?? 0);
    if (missing > 0 && isKnownRecipe(sim.save, id)) cook(sim, id, missing);
  }
}

const isKnownRecipe = (save: SaveData, id: string) => !!recipeById[id] && isKnown(save, recipeById[id]);

/** The meal for a run's goal (see BOT_RULES). */
function mealFor(sim: Sim, dungeon: DungeonDef, heroIds: string[], o: Odds): string | null {
  const briefing = briefingFor(sim.rotation, dungeon);
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

/** On safe short runs, potions give way to charms. */
function withCharms(sim: Sim, dungeon: DungeonDef, heroIds: string[], o: Odds) {
  if (dungeon.isBoss || dungeon.slot !== 'short' || o.success < sim.config.provisions.charmOdds) return;
  let tooth = false;
  for (const id of heroIds) {
    if (sim.save.heroes.find((h) => h.id === id)!.equipment.consumable !== 'healingPotion') continue;
    const held = (item: string) => (sim.save.consumables[item] ?? 0) > 0;
    const charm: string | null = !tooth && held('luckyTooth') ? 'luckyTooth' : held('rabbitsFoot') ? 'rabbitsFoot' : null;
    if (!charm) continue;
    tooth ||= charm === 'luckyTooth';
    sim.save = equip(sim.save, id, 'consumable', charm);
  }
}

/** Buys the missing supply at a tavern reachable today, if the stock falls short. */
function topUpSupply(sim: Sim, dungeon: DungeonDef, heroIds: string[], loadout: Loadout, briefing: Briefing) {
  const plan = launchPlan(sim.save, dungeon, heroIds, loadout, briefing);
  if (plan.hunger === 'fed' || !sim.reach.tavern) return;
  const jerky = supplyItems.find((i) => i.id === 'jerky')!;
  const count = Math.ceil((plan.need - plan.held) / jerky.supply!);
  const at = sim.tavern.position;
  if (count <= 0 || buySupplyProblem(sim.save, count, at, at) !== null) return;
  act(sim, 'emergencySupply', (save) => buySupply(save, count, at, at));
  sim.log.emergencySupply += count;
}

// —— Infusion ——

/** The most common enemy element in a tier's dungeons, weighting fights by mob count and the boss by 3. */
function commonElement(tier: number): Element | null {
  const counts: Partial<Record<Element, number>> = {};
  const count = (element: Element | undefined, weight: number) => {
    if (element) counts[element] = (counts[element] ?? 0) + weight;
  };
  for (const dungeon of dungeons.filter((d) => d.tier === tier)) {
    count(dungeon.boss.element, 3);
    for (const encounter of dungeon.encounters) {
      if (encounter.type === 'fight') encounter.mobs.forEach((g) => count(mobById[g.mobId].element, g.count * encounter.weight));
      if (encounter.type === 'trap') count(encounter.element, encounter.weight);
    }
  }
  const sorted = (Object.entries(counts) as [Element, number][]).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

export function infuseWeapons(sim: Sim) {
  const target = commonElement(highestTier(sim.save));
  if (!target) return;
  const weapons = homeHeroes(sim.save)
    .map((hero) => ({ hero, gear: gearOf(sim.save, hero.equipment.weapon) }))
    .filter((w) => w.gear && !w.gear.element)
    .sort((a, b) => wornScore(sim.save, b.hero, 'weapon') - wornScore(sim.save, a.hero, 'weapon'));
  for (const { gear } of weapons) {
    const element = ELEMENTS.filter((e) => (sim.save.materials[stoneId(e)] ?? 0) > 0 && weaponMultiplier(e, target) >= 1).sort(
      (a, b) => weaponMultiplier(b, target) - weaponMultiplier(a, target),
    )[0];
    if (!element || !canInfuse(sim.save, gear!.uid, element)) return;
    act(sim, 'infuse', (save) => infuse(save, gear!.uid, element));
  }
}

// —— Recruiting and the Guild Hall ——

function nextRecruitPrice(save: SaveData) {
  return Math.round(recruitPrice('common', offerLevel(save), save.heroes.length, false, highestTier(save)) * (1 - guildBonus(save, 'tavernDiscount')));
}

export function recruitHeroes(sim: Sim) {
  if (!sim.reach.tavern || !isTavernUnlocked(sim.save)) return;
  for (;;) {
    if (rosterFull(sim.save)) return;
    const owned = new Set(sim.save.heroes.map((h) => h.classId));
    const offers = tavernOffers(sim.save, sim.tavern.id, sim.now)
      .filter((o) => !(o.id in sim.save.takenOffers) && sim.save.gold >= o.price + sim.config.recruitReserve)
      .map((offer) => {
        const counters = answersThreat(sim, offer.classId);
        return { offer, score: (counters ? 2 : 0) + (owned.has(offer.classId) ? 0 : 1), positive: traitById[offer.trait]?.positive ? 1 : 0 };
      })
      .sort((a, b) => b.score - a.score || b.positive - a.positive || a.offer.price - b.offer.price);
    const pick = offers[0]?.offer;
    if (!pick) return;
    act(sim, 'recruit', (save) => recruit(save, pick, sim.tavern.position, sim.tavern.position));
    sim.log.recruits.push({ day: sim.day, classId: pick.classId, price: pick.price, trait: pick.trait });
    mark(sim, `recruit:${sim.save.heroes.length}`);
  }
}

export function buyGuildRanks(sim: Sim) {
  if (!isGuildUnlocked(sim.save)) return;
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
      if (guildTrackById[id].milestone) mark(sim, `guild:${id}`);
      const building = guildTrackById[id].building;
      if (guildTracks.filter((t) => t.building === building).every((t) => (sim.save.guild[t.id] ?? 0) >= t.ranks)) {
        mark(sim, `building:${building}`);
      }
      bought = true;
      break;
    }
  }
}

// —— Parties and odds ——

const heroKey = (save: SaveData, hero: HeroState, now: number) => {
  const gear = (uid: string | null) => {
    const g = gearOf(save, uid);
    return g ? `${g.uid}${g.quality}${g.element ?? ''}` : '-';
  };
  // HP in 5% steps, so healing heroes don't miss the cache every minute.
  const hp = Math.round((currentHp(save, hero, now) / maxHp(save, hero)) * 20);
  return `${hero.id}:${hero.level}:${gear(hero.equipment.weapon)}:${gear(hero.equipment.armor)}:${hero.equipment.consumable}:${hp}`;
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
  const active = briefing ?? briefingFor(sim.rotation, dungeon);
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

/** Each hero takes a potion; an ember ward salve for fire runs if they don't resist fire. */
function withLoadout(save: SaveData, heroIds: string[], dungeon: DungeonDef, briefing: Briefing): SaveData {
  let next = save;
  const fire = dealsFire(dungeon, briefing);
  for (const id of heroIds) {
    const hero = next.heroes.find((h) => h.id === id)!;
    const stock = (item: string) => (next.consumables[item] ?? 0) + (hero.equipment.consumable === item ? 1 : 0);
    const wantsFire = fire && !(heroClasses[hero.classId].resists ?? []).includes('fire');
    const want = [wantsFire ? 'emberWardSalve' : null, 'healingPotion'].find((item) => item && stock(item) > 0);
    if (want && hero.equipment.consumable !== want) next = equip(next, id, 'consumable', want);
  }
  return next;
}

/**
 * Adds the hero who raises the odds most, until the party is full or safe
 * enough. Candidates are compared with a quick estimate on the same seeds;
 * the party found gets the full one.
 */
export function bestParty(sim: Sim, dungeon: DungeonDef, candidates: string[], briefingOf: Briefing | null = null) {
  const briefing = briefingOf ?? briefingFor(sim.rotation, dungeon);
  const save = withLoadout(sim.save, candidates, dungeon, briefing);
  // Narrow passages cap the party at launch, so never build a bigger one.
  const cap = briefing.restriction === 'narrowPassages' ? restrictionRules.narrowPartySize : partySize(save);
  const party: string[] = [];
  let best: Odds = { success: 0, flawless: 0, progress: 0 };
  while (party.length < cap && party.length < candidates.length) {
    let pick: { id: string; odds: Odds } | null = null;
    for (const id of candidates.filter((c) => !party.includes(c))) {
      const o = odds(sim, save, [...party, id], dungeon, sim.config.odds.searchRuns, false, briefing);
      if (!pick || o.success > pick.odds.success || (o.success === pick.odds.success && o.progress > pick.odds.progress)) pick = { id, odds: o };
    }
    party.push(pick!.id);
    best = pick!.odds;
    if (best.success >= sim.config.odds.enough) break;
  }
  return { heroIds: party, odds: party.length ? odds(sim, save, party, dungeon, sim.config.odds.runs, false, briefing) : best };
}

// —— Sanctums and treasure ——

export function challengeSanctums(sim: Sim) {
  for (;;) {
    const home = homeHeroes(sim.save).map((h) => h.id);
    const spawns = sim.reach.sanctums.filter((s) => !(s.id in sim.save.usedSanctums));
    if (!sim.save.sigils.length || !home.length || !spawns.length) return;
    let pick: { spawn: SanctumSpawn; tier: number; heroIds: string[]; odds: number } | null = null;
    for (const tier of [...new Set(sim.save.sigils)].sort((a, b) => b - a)) {
      for (const spawn of spawns) {
        const party = bestParty(sim, sanctumDungeon(sanctumById[spawn.sanctumId], tier), home, EMPTY_BRIEFING);
        if (party.odds.success >= sim.config.odds.sanctum && (!pick || party.odds.success > pick.odds)) {
          pick = { spawn, tier, heroIds: party.heroIds, odds: party.odds.success };
        }
      }
      if (pick) break;
    }
    if (!pick) return;
    const { spawn, tier, heroIds } = pick;
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
  for (const map of liveTreasureMaps(sim.save, sim.now)) {
    if (!map.location) act(sim, 'treasure', (save) => readTreasureMap(save, map.id, sim.location, sim.now));
    const spot = sim.save.treasureMaps.find((m) => m.id === map.id)!.location!;
    if (!sim.reach.maps.has(map.id)) sim.reach.maps.set(map.id, sim.rng.chance(reachChance(sim, distanceMeters(sim.location, spot))));
    if (sim.reach.maps.get(map.id)) {
      act(sim, 'treasure', (save) => collectTreasure(save, map.id, spot, spot, sim.now).save);
    }
  }
}

// —— Expeditions ——

export function launch(sim: Sim, dungeon: DungeonDef, heroIds: string[], o: Odds) {
  const briefing = briefingFor(sim.rotation, dungeon);
  sim.save = withLoadout(sim.save, heroIds, dungeon, briefing);
  withCharms(sim, dungeon, heroIds, o);
  const loadout = { mealId: mealFor(sim, dungeon, heroIds, o) };
  topUpSupply(sim, dungeon, heroIds, loadout, briefing);
  // The prediction logged is for the party exactly as it leaves.
  const final = estimateOdds(sim.save, heroIds, dungeon, sim.config.odds.runs, { now: sim.now, loadout, briefing });
  const qualities = Object.fromEntries(QUALITY_ORDER.map((q) => [q, 0])) as Record<Quality, number>;
  for (const id of heroIds) {
    const hero = sim.save.heroes.find((h) => h.id === id)!;
    for (const uid of [hero.equipment.weapon, hero.equipment.armor]) {
      const gear = gearOf(sim.save, uid);
      if (gear) qualities[gear.quality]++;
    }
  }
  const id = `x${sim.save.nextUid}`;
  sim.save = startExpedition(sim.save, dungeon.id, heroIds, sim.now, 1, sim.rotation, loadout);
  const level = heroIds.reduce((s, h) => s + sim.save.heroes.find((x) => x.id === h)!.level, 0) / heroIds.length;
  sim.launched.set(id, { odds: final.success, qualities, day: sim.day, hour: (sim.now - sim.startedAt) / 3_600_000, level });
}

/** Whether a win here could teach a weapon or armour blueprint the roster can use and doesn't know yet. */
function dropsBlueprint(save: SaveData, dungeon: DungeonDef) {
  return dungeon.recipeDrops.some(({ recipeId }) => {
    const item = forgedItem(recipeById[recipeId]);
    return item && !save.knownRecipes.includes(recipeId) && save.heroes.some((h) => affinityOf(h.classId, item.gearType) === 'favoured');
  });
}

/**
 * Gold-equivalent of a run: gold for the share cleared, first-clear bonus,
 * main rewards (about a gold roll each) and XP. A boss whose daily bonus is
 * gone today only rolls the repeat chance. The day's first win also values
 * the guaranteed blueprint, at `blueprintValueRuns` of the dungeon's top gold.
 */
function expectedValue(sim: Sim, dungeon: DungeonDef, o: Odds, heroes: number) {
  const mid = ((dungeon.gold[0] + dungeon.gold[1]) / 2) * (1 + guildBonus(sim.save, 'gold'));
  const firstClear = dungeon.slot && !sim.save.firstClears.includes(dungeon.id) ? dungeon.gold[1] * firstClearRules.goldShare : 0;
  const bonus = !dungeon.isBoss || bossBonusAvailable(sim.save, dungeon.id, sim.now);
  const rolls = bonus ? dungeon.mainRewardChance + (dungeon.mainRewardExtraRollChance ?? 0) : mainRewardRules.repeatMainRewardChance;
  const blueprint =
    dungeon.slot && blueprintBonusAvailable(sim.save, dungeon.id, sim.now) && guaranteedBlueprint(sim.save, dungeon)
      ? dungeon.gold[1] * sim.config.odds.blueprintValueRuns
      : 0;
  const tierShare = xpRules.lowerTierShare[Math.min(xpRules.lowerTierShare.length - 1, highestTier(sim.save) - dungeon.tier)];
  return mid * o.progress + o.success * (firstClear + blueprint + rolls * mid) + dungeon.xp * tierShare * o.progress * heroes * sim.config.xpGoldValue;
}

export function sendExpeditions(sim: Sim) {
  const top = highestTier(sim.save);
  const open = dungeons.filter((d) => !d.overnight && d.tier >= top - 1 && isDungeonAvailable(sim.save, d, sim.rotation));
  // The overnight quest of the top two tiers joins the ranking when the next
  // session is at least a full patrol away (the day's last session, usually).
  // One patrol can be out at a time.
  const gapToNextSession = sim.collectionAt(sim.now + 1) - sim.now;
  const overnight = dungeons.filter(
    (d) =>
      d.overnight &&
      d.tier >= top - 1 &&
      !overnightUnderWay(sim.save) &&
      isDungeonAvailable(sim.save, d) &&
      gapToNextSession >= d.durationMinutes * 60_000 * (1 - guildBonus(sim.save, 'fasterExpeditions')),
  );
  const unbeatenBoss = open.find((d) => d.isBoss && d.tier === top && !sim.save.clearedDungeons.includes(d.id));
  const idle = () => homeHeroes(sim.save).map((h) => h.id);

  if (unbeatenBoss && idle().length) {
    const party = bestParty(sim, unbeatenBoss, idle());
    if (party.odds.success >= sim.config.odds.boss && restUp(sim, unbeatenBoss, party.heroIds)) {
      launch(sim, unbeatenBoss, party.heroIds, odds(sim, sim.save, party.heroIds, unbeatenBoss));
    }
  }
  sim.waiting = new Set();
  while (idle().length) {
    const options = [...open, ...overnight]
      .filter((d) => d !== unbeatenBoss && !sim.waiting.has(d.id) && !(d.overnight && overnightUnderWay(sim.save)))
      .map((d) => {
        const party = bestParty(sim, d, idle());
        const hours = (sim.collectionAt(sim.now + d.durationMinutes * (1 - guildBonus(sim.save, 'fasterExpeditions')) * 60_000) - sim.now) / 3_600_000;
        return { d, party, score: expectedValue(sim, d, party.odds, party.heroIds.length) / Math.max(0.1, hours) };
      });
    const threshold = (d: DungeonDef) => (d.tier === top && dropsBlueprint(sim.save, d) ? sim.config.odds.blueprint : sim.profile.oddsThreshold);
    const good = options.filter((o) => o.party.odds.success >= threshold(o.d)).sort((a, b) => b.score - a.score);
    let pick = good[0];
    if (!pick && sim.save.expeditions.length === 0) {
      pick = options.filter((o) => o.party.odds.success >= sim.config.odds.fallback).sort((a, b) => b.party.odds.success - a.party.odds.success)[0];
    }
    if (!pick) return;
    if (!restUp(sim, pick.d, pick.party.heroIds)) {
      sim.waiting.add(pick.d.id);
      continue;
    }
    launch(sim, pick.d, pick.party.heroIds, odds(sim, sim.save, pick.party.heroIds, pick.d));
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
  const bossBonus = !!dungeon.isBoss && bossBonusAvailable(before, dungeon.id, expedition.endsAt);
  const { save, report } = resolveExpedition(before, expedition);
  // Gold by source; everything else through `act` so materials are counted.
  const pouches = report.mainRewards.reduce((sum, r) => sum + (r.kind === 'goldPouch' ? r.gold : 0), 0);
  const mapGold = report.mainRewards.reduce((sum, r) => sum + (r.kind === 'mapGold' ? r.gold : 0), 0);
  const source = expedition.guaranteed ? 'tutorial' : 'dungeon';
  // Materials through `act` (with the gold held back), then the gold split by source.
  act(sim, source, () => ({ ...save, gold: before.gold }));
  sim.save = save;
  for (const [kind, amount] of [
    [source, report.gold],
    ['firstClear', report.firstClear?.gold ?? 0],
    ['pouch', pouches],
    ['mapGold', mapGold],
  ] as const) {
    if (amount > 0) sim.log.goldIn.push({ day: sim.day, source: kind, amount });
  }

  const effects: Record<string, number> = {};
  const classEffects: Record<string, number> = {};
  for (const effect of run.encounters.flatMap((e) => e.effects)) {
    const key = effect.tag ? `${effect.key}:${effect.tag}` : effect.key;
    effects[key] = (effects[key] ?? 0) + 1;
    const classId = effect.heroId ? sim.save.heroes.find((h) => h.id === effect.heroId)?.classId : 'local';
    const byClass = `${classId}|${effect.key}`;
    classEffects[byClass] = (classEffects[byClass] ?? 0) + 1;
  }
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
    gold: report.gold + (report.firstClear?.gold ?? 0) + pouches + mapGold,
    xp: report.xp,
    qualities: launched?.qualities ?? { crappy: 0, normal: 0, rare: 0, legendary: 0 },
    effects,
    classEffects,
    hours: (expedition.endsAt - expedition.startedAt) / 3_600_000,
    level: launched?.level ?? 1,
    bossBonus,
    blueprint: !!report.dailyBlueprint,
    startHp: report.heroHp.reduce((s, h) => s + (h.before ?? h.maxHp) / Math.max(1, h.maxHp), 0) / report.heroHp.length,
    hunger: report.hunger ?? 'fed',
    supplyUsed: report.supplyUsed ?? 0,
    meal: report.mealId ?? null,
    potions: report.consumablesUsed.filter((id) => id === 'healingPotion').length,
  });
  if (report.success && dungeon.isBoss) mark(sim, `boss:${dungeon.tier}`);
}
