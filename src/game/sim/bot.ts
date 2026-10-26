import { dungeons } from '@/content/dungeons';
import { mobById } from '@/content/enemies';
import { guildTrackById, guildTracks } from '@/content/guild';
import { heroClasses, xpRules } from '@/content/heroes';
import { dungeonById, itemById, recipeById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';
import { modifierById } from '@/content/modifiers';
import { recipes } from '@/content/recipes';
import { firstClearRules } from '@/content/rotation';
import { traitById } from '@/content/traits';

import { canCraft, craft, forgedItem } from '../crafting/crafting';
import { canInfuse, infuse } from '../crafting/infusion';
import { countersFor } from '../dungeons/counters';
import { modifierFor, withModifier, type Rotation } from '../dungeons/rotation';
import { dungeonTagWeights } from '../dungeons/tags';
import { ELEMENTS, stoneId, weaponMultiplier, type Element } from '../elements';
import { bossBonusAvailable, highestUnlockedTier, isDungeonAvailable, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { estimateOdds, type Odds } from '../expeditions/odds';
import { prepareParty, simulateRun } from '../expeditions/simulate';
import { masteryCap, masteryOf, masteryTypeOf } from '../forging/mastery';
import { gearStats, qualityOdds } from '../forging/quality';
import { salvage } from '../forging/salvage';
import { distanceMeters } from '../generation/geo';
import type { Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { buyRank, guildBonus, isGuildUnlocked, partySize, rankPrice, rankProblem } from '../guild/guild';
import { hasMaterials } from '../inventory';
import { collectTreasure, liveTreasureMaps, readTreasureMap } from '../rewards/treasure';
import { challengeSanctum, sanctumById, sanctumDungeon, type SanctumSpawn } from '../sanctums/sanctums';
import type { SaveData } from '../save';
import { isTavernUnlocked, offerLevel, recruit, recruitPrice, tavernOffers, type TavernSpawn } from '../taverns/taverns';
import { canWield, equip, isOnExpedition, rosterFull } from '../team/team';
import type { ActiveExpedition, DungeonDef, GearDef, HeroState, Quality, RecipeDef } from '../types';
import type { Profile, SimConfig } from './config';
import { PICKAXES, type WalkRates } from './walking';

export const QUALITY_ORDER: Quality[] = ['crappy', 'normal', 'rare', 'legendary'];

export type ExpeditionRow = {
  day: number;
  /** Hours since the run started. */
  hour: number;
  id: string;
  dungeonId: string;
  tier: number;
  boss: boolean;
  modifier: string;
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
};

export type CraftRow = {
  day: number;
  kind: 'pickaxe' | 'upgrade' | 'reforge' | 'consumable' | 'salvage' | 'tutorial';
  itemId: string;
  tier: number;
  quality: Quality | null;
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
  rng: Rng;
  rotation: Rotation;
  location: LatLng;
  tavern: TavernSpawn;
  /** Today's reach rolls. */
  reach: { meters: number; tavern: boolean; sanctums: SanctumSpawn[]; maps: Map<string, boolean> };
  /** When the first session at or after a time happens. */
  collectionAt: (time: number) => number;
  oddsCache: Map<string, Odds>;
  launched: Map<string, Pick<ExpeditionRow, 'odds' | 'qualities' | 'day' | 'hour' | 'level'>>;
  log: RunLog;
};

// —— Bookkeeping ——

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

/** How much a piece adds to a hero: weapon damage after affinity, or armour defense plus a share of HP. */
export function gearScore(hero: HeroState, item: GearDef, quality: Quality) {
  const stats = gearStats(item, { quality });
  if (item.slot === 'armor') return (stats.defense ?? 0) + (stats.hp ?? 0) / 8;
  const affinity = item.weaponType ? (heroClasses[hero.classId].affinities[item.weaponType] ?? 0) : 1;
  return ((stats.attack ?? 0) + (stats.magic ?? 0)) * affinity;
}

function wornScore(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor') {
  const gear = gearOf(save, hero.equipment[slot]);
  return gear ? gearScore(hero, itemById[gear.itemId] as GearDef, gear.quality) : 0;
}

const dealsFire = (dungeon: DungeonDef) => dungeon.enemyElement === 'fire' || (dungeonTagWeights(dungeon).fire ?? 0) > 0;

/** The dungeon as it runs today: with the rotation's modifier. */
const asToday = (sim: Sim, dungeon: DungeonDef) => withModifier(dungeon, modifierFor(sim.rotation, dungeon.id));

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

/** The best-tier piece a hero could get for a slot from the known recipes. */
function bestRecipe(save: SaveData, hero: HeroState, slot: 'weapon' | 'armor') {
  let best: { recipe: RecipeDef; item: GearDef } | null = null;
  for (const recipe of forgeRecipes) {
    const item = forgedItem(recipe)!;
    if (item.slot !== slot || !save.knownRecipes.includes(recipe.id) || !canWield(hero, item)) continue;
    if (!best || item.tier > best.item.tier || (item.tier === best.item.tier && gearScore(hero, item, 'normal') > gearScore(hero, best.item, 'normal'))) {
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
  sim.log.crafts.push({ day: sim.day, kind, itemId: item.id, tier: item.tier, quality: gear.quality, mastery, maxed, materials });
  if (gear.quality === 'rare' || gear.quality === 'legendary') mark(sim, `rare:${item.tier}`);
  if (gear.quality === 'legendary') mark(sim, `legendary:${item.tier}`);
  for (let tier = 1; tier <= 5; tier++) if (mastery >= masteryCap(tier)) mark(sim, `masteryCap:${tier}`);
  return gear;
}

/** Gives every spare piece to the home hero it helps most, then salvages what nobody wants. */
function distribute(sim: Sim) {
  for (;;) {
    const worn = new Set(sim.save.heroes.flatMap((h) => [h.equipment.weapon, h.equipment.armor]));
    let best: { hero: HeroState; uid: string; slot: 'weapon' | 'armor'; gain: number } | null = null;
    for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid))) {
      const item = itemById[gear.itemId] as GearDef;
      for (const hero of homeHeroes(sim.save)) {
        if (!canWield(hero, item)) continue;
        const gain = gearScore(hero, item, gear.quality) - wornScore(sim.save, hero, item.slot);
        if (gain > 0 && (!best || gain > best.gain)) best = { hero, uid: gear.uid, slot: item.slot, gain };
      }
    }
    if (!best) break;
    const { hero, uid, slot } = best;
    act(sim, 'equip', (save) => equip(save, hero.id, slot, uid));
  }
  const worn = new Set(sim.save.heroes.flatMap((h) => [h.equipment.weapon, h.equipment.armor]));
  for (const gear of sim.save.gear.filter((g) => !worn.has(g.uid))) {
    const item = itemById[gear.itemId] as GearDef;
    const materials = act(sim, 'salvage', (save) => salvage(save, gear.uid));
    sim.log.crafts.push({ day: sim.day, kind: 'salvage', itemId: item.id, tier: item.tier, quality: gear.quality, mastery: null, materials });
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
    sim.log.crafts.push({ day: sim.day, kind: 'pickaxe', itemId: pickaxe.id, tier: owned + 1, quality: null, mastery: null, materials: {} });
    mark(sim, `pickaxe:${pickaxe.id}`);
  } else if (pickaxe && sim.save.knownRecipes.includes(pickaxe.id)) {
    recordMissing(sim, pickaxe);
  }

  // Upgrades: a better tier for a slot, biggest gain first.
  for (let i = 0; i < 30; i++) {
    const upgrades = homeHeroes(sim.save)
      .flatMap((hero) =>
        (['weapon', 'armor'] as const).map((slot) => {
          const best = bestRecipe(sim.save, hero, slot);
          const current = gearOf(sim.save, hero.equipment[slot]);
          if (!best || (current && (itemById[current.itemId] as GearDef).tier >= best.item.tier)) return null;
          return { recipe: best.recipe, gain: gearScore(hero, best.item, 'normal') - wornScore(sim.save, hero, slot) };
        }),
      )
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
        (['weapon', 'armor'] as const).map((slot) => {
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

  // Consumables.
  const fireToday = dungeons.some((d) => isDungeonAvailable(sim.save, d, sim.rotation) && dealsFire(asToday(sim, d)));
  for (const [id, target] of Object.entries(sim.config.stock)) {
    if (id === 'fireResistanceElixir' && !fireToday) continue;
    const recipe = recipeById[id];
    while ((sim.save.consumables[id] ?? 0) < target && canCraft(sim.save, recipe)) {
      act(sim, 'brew', (save) => craft(save, recipe));
      sim.log.crafts.push({ day: sim.day, kind: 'consumable', itemId: id, tier: 0, quality: null, mastery: null, materials: {} });
    }
  }
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
  const tier = highestTier(sim.save);
  const tierDungeons = dungeons.filter((d) => d.tier === tier);
  for (;;) {
    if (rosterFull(sim.save)) return;
    const owned = new Set(sim.save.heroes.map((h) => h.classId));
    const offers = tavernOffers(sim.save, sim.tavern.id, sim.now)
      .filter((o) => !(o.id in sim.save.takenOffers) && sim.save.gold >= o.price + sim.config.recruitReserve)
      .map((offer) => {
        const counters = tierDungeons.some((d) => countersFor(heroClasses[offer.classId].abilities, d).length > 0);
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

const heroKey = (save: SaveData, hero: HeroState) => {
  const gear = (uid: string | null) => {
    const g = gearOf(save, uid);
    return g ? `${g.uid}${g.quality}${g.element ?? ''}` : '-';
  };
  return `${hero.id}:${hero.level}:${gear(hero.equipment.weapon)}:${gear(hero.equipment.armor)}:${hero.equipment.consumable}`;
};

/** Odds with fewer runs than the app, remembered for the same heroes, gear and dungeon. */
export function odds(sim: Sim, save: SaveData, heroIds: string[], dungeon: DungeonDef, runs = sim.config.odds.runs): Odds {
  const heroes = save.heroes.filter((h) => heroIds.includes(h.id));
  const key = `${runs}|${dungeon.id}|${dungeon.modifierId ?? ''}|${heroes.map((h) => heroKey(save, h)).sort().join('|')}`;
  let result = sim.oddsCache.get(key);
  if (!result) {
    result = estimateOdds(save, heroIds, dungeon, runs);
    sim.oddsCache.set(key, result);
  }
  return result;
}

/** Each hero takes a potion; a fire elixir for fire dungeons if they don't resist fire; a ration when potions run out. */
function withLoadout(save: SaveData, heroIds: string[], dungeon: DungeonDef): SaveData {
  let next = save;
  for (const id of heroIds) {
    const hero = next.heroes.find((h) => h.id === id)!;
    const stock = (item: string) => (next.consumables[item] ?? 0) + (hero.equipment.consumable === item ? 1 : 0);
    const fire = dealsFire(dungeon) && !heroClasses[hero.classId].resists?.includes('fire');
    const want = [fire ? 'fireResistanceElixir' : null, 'healingPotion', 'ration'].find((item) => item && stock(item) > 0);
    if (want && hero.equipment.consumable !== want) next = equip(next, id, 'consumable', want);
  }
  return next;
}

/**
 * Adds the hero who raises the odds most, until the party is full or safe
 * enough. Candidates are compared with a quick estimate on the same seeds;
 * the party found gets the full one.
 */
export function bestParty(sim: Sim, dungeon: DungeonDef, candidates: string[]) {
  const save = withLoadout(sim.save, candidates, dungeon);
  const party: string[] = [];
  let best: Odds = { success: 0, flawless: 0, progress: 0 };
  while (party.length < partySize(save) && party.length < candidates.length) {
    let pick: { id: string; odds: Odds } | null = null;
    for (const id of candidates.filter((c) => !party.includes(c))) {
      const o = odds(sim, save, [...party, id], dungeon, sim.config.odds.searchRuns);
      if (!pick || o.success > pick.odds.success || (o.success === pick.odds.success && o.progress > pick.odds.progress)) pick = { id, odds: o };
    }
    party.push(pick!.id);
    best = pick!.odds;
    if (best.success >= sim.config.odds.enough) break;
  }
  return { heroIds: party, odds: party.length ? odds(sim, save, party, dungeon) : best };
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
        const party = bestParty(sim, sanctumDungeon(sanctumById[spawn.sanctumId], tier), home);
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
  sim.save = withLoadout(sim.save, heroIds, dungeon);
  const qualities = Object.fromEntries(QUALITY_ORDER.map((q) => [q, 0])) as Record<Quality, number>;
  for (const id of heroIds) {
    const hero = sim.save.heroes.find((h) => h.id === id)!;
    for (const uid of [hero.equipment.weapon, hero.equipment.armor]) {
      const gear = gearOf(sim.save, uid);
      if (gear) qualities[gear.quality]++;
    }
  }
  const id = `x${sim.save.nextUid}`;
  sim.save = startExpedition(sim.save, dungeon.id, heroIds, sim.now, 1, sim.rotation);
  const level = heroIds.reduce((s, h) => s + sim.save.heroes.find((x) => x.id === h)!.level, 0) / heroIds.length;
  sim.launched.set(id, { odds: o.success, qualities, day: sim.day, hour: (sim.now - sim.startedAt) / 3_600_000, level });
}

/** Whether a win here could teach a weapon or armour blueprint the roster can use and doesn't know yet. */
function dropsBlueprint(save: SaveData, dungeon: DungeonDef) {
  return dungeon.recipeDrops.some(({ recipeId }) => {
    const item = forgedItem(recipeById[recipeId]);
    return item && !save.knownRecipes.includes(recipeId) && masteryTypeOf(item) in save.mastery && save.heroes.some((h) => canWield(h, item));
  });
}

/** Gold-equivalent of a run: gold for the share cleared, first-clear bonus, pouches and XP. */
/**
 * Gold-equivalent of a run: gold for the share cleared, first-clear bonus,
 * main rewards (about a gold roll each) and XP. A boss whose daily bonus is
 * gone today only rolls the repeat chance.
 */
function expectedValue(sim: Sim, dungeon: DungeonDef, o: Odds, heroes: number) {
  const mid = ((dungeon.gold[0] + dungeon.gold[1]) / 2) * (dungeon.rewardMultipliers?.gold ?? 1) * (1 + guildBonus(sim.save, 'gold'));
  const firstClear = dungeon.slot && !sim.save.firstClears.includes(dungeon.id) ? dungeon.gold[1] * firstClearRules.goldShare : 0;
  const bonus = !dungeon.isBoss || bossBonusAvailable(sim.save, dungeon.id, sim.now);
  const rolls = bonus ? dungeon.mainRewardChance + (dungeon.mainRewardExtraRollChance ?? 0) : mainRewardRules.repeatMainRewardChance;
  const tierShare = xpRules.lowerTierShare[Math.min(xpRules.lowerTierShare.length - 1, highestTier(sim.save) - dungeon.tier)];
  return mid * o.progress + o.success * (firstClear + rolls * mid) + dungeon.xp * tierShare * o.progress * heroes * sim.config.xpGoldValue;
}

export function sendExpeditions(sim: Sim) {
  const top = highestTier(sim.save);
  const open = dungeons
    .filter((d) => d.tier >= top - 1 && isDungeonAvailable(sim.save, d, sim.rotation))
    .map((d) => asToday(sim, d));
  const unbeatenBoss = open.find((d) => d.isBoss && d.tier === top && !sim.save.clearedDungeons.includes(d.id));
  const idle = () => homeHeroes(sim.save).map((h) => h.id);

  if (unbeatenBoss && idle().length) {
    const party = bestParty(sim, unbeatenBoss, idle());
    if (party.odds.success >= sim.config.odds.boss) launch(sim, unbeatenBoss, party.heroIds, party.odds);
  }
  while (idle().length) {
    const options = open
      .filter((d) => d !== unbeatenBoss)
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
    launch(sim, pick.d, pick.party.heroIds, pick.party.odds);
  }
}

/** Resolves one expedition through the game, and logs it with the abilities that fired in its run. */
export function collectExpedition(sim: Sim, expedition: ActiveExpedition) {
  const modifier = expedition.modifierId ? modifierById[expedition.modifierId] : null;
  const dungeon = withModifier(dungeonById[expedition.dungeonId], modifier);
  const run = simulateRun(prepareParty(sim.save, expedition.heroIds), dungeon, `${expedition.seed}|run`, { guaranteed: expedition.guaranteed });
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
    modifier: expedition.modifierId ?? '',
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
  });
  if (report.success && dungeon.isBoss) mark(sim, `boss:${dungeon.tier}`);
}
