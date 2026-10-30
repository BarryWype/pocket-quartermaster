import { dungeons } from '@/content/dungeons';
import { MASTERY_TYPES } from '@/content/forging';
import { itemById, recipeById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { provisionRules } from '@/content/provisions';
import { xpRules, xpToNextLevel } from '@/content/heroes';

import { forgedItem } from './crafting/crafting';
import { legacyRecipeId, tierRecipes } from './crafting/recipeUnlocks';
import { masteryTypeOf, startingMastery } from './forging/mastery';
import { shardId, type Element } from './elements';
import { emptyLoot, type Loot } from './loot/types';
import { createInitialSave, type SaveData } from './save';
import type { ActiveExpedition, ExpeditionReport, GearInstance, HeroClassId, HeroState, MasteryState, MasteryType, MaterialStack } from './types';
import type { PatrolFight } from './patrols/fight';

const KEY = 'mysteriousKey';

/**
 * Version 5 → 6: gear loses its durability and becomes Normal, mastery starts
 * at level 1, and each Mysterious key becomes a tier 1 Sigil (up to the cap).
 */
export function migrateV5Save(old: Partial<SaveData> & Record<string, unknown>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const gear = (old.gear ?? []).map(({ uid, itemId, element }): GearInstance => ({
    uid,
    itemId,
    quality: 'normal',
    ...(element ? { element } : {}),
  }));
  const { [KEY]: keys = 0, ...materials } = save.materials;
  const sigils = [...save.sigils];
  for (let i = 0; i < keys && sigils.length < lootConfig.sigils.cap; i++) sigils.push(1);
  return { ...save, gear, materials, sigils, mastery: createInitialSave().mastery };
}

/** Version 6 → 7: pool dungeons already cleared count as having paid their first-clear bonus. */
export function migrateV6Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old };
}

/** The starting heroes' traits, for saves from before traits. */
const STARTING_TRAITS: Record<string, string> = { bram: 'tough', lyra: 'lucky', mira: 'quickLearner' };

/**
 * Version 7 → 8: archers are rangers now, every hero gets a trait, and weapons
 * a class can no longer use are taken off.
 */
export function migrateV7Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const heroes = save.heroes.map((hero): HeroState => {
    const classId = ((hero.classId as string) === 'archer' ? 'ranger' : hero.classId) as HeroClassId;
    return {
      ...hero,
      classId,
      trait: hero.trait ?? STARTING_TRAITS[hero.id] ?? 'tough',
    };
  });
  return { ...save, heroes };
}

/** Version 8 → 9: the Guild Hall starts empty, with one charter per tier boss already beaten. */
export function migrateV8Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const bosses = dungeons.filter((d) => d.isBoss && save.clearedDungeons.includes(d.id)).length;
  return { ...save, guild: {}, charters: bosses, trainedAt: null };
}

/** Version 9 → 10: daily boss bonuses start unclaimed; gold, materials and levels stay as they are. */
export function migrateV9Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old };
}

const RATION = 'ration';

/**
 * Version 10 → 11: heroes start at full HP; rations (in stock or carried)
 * become jerky; the old Tough trait (+15% HP) is now Resilient; every save
 * gets the starting supply.
 */
export function migrateV10Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const carried = save.heroes.filter((h) => h.equipment.consumable === RATION).length;
  const { [RATION]: stocked = 0, ...consumables } = save.consumables;
  // A ration was worth about one jerky (3 supply points).
  const jerky = stocked + carried;
  for (const [id, amount] of Object.entries(provisionRules.startingStock)) consumables[id] = (consumables[id] ?? 0) + amount;
  if (jerky > 0) consumables.jerky = (consumables.jerky ?? 0) + jerky;
  const heroes = save.heroes.map(({ hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...hero }): HeroState => ({
    ...hero,
    trait: hero.trait === 'tough' ? 'resilient' : hero.trait,
    equipment: { ...hero.equipment, consumable: hero.equipment.consumable === RATION ? null : hero.equipment.consumable },
  }));
  return { ...save, consumables, heroes, cookingHintSeen: false };
}

/**
 * Version 11 → 12: gear gains a stat roll (existing pieces get the neutral 1),
 * and the save starts tracking claimed daily blueprints and bonus gathers.
 */
export function migrateV11Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  return {
    ...save,
    gear: save.gear.map((g) => ({ ...g, roll: g.roll ?? 1 })),
    freshGathers: { day: '', used: 0 },
  };
}

/** v12 → v13: auto-gather's bookkeeping and walk history start empty. */
export function migrateV12Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old, autoGather: createInitialSave().autoGather };
}

/** v13 → v14: patrols, travellers and the escort; everything starts empty. */
export function migrateV13Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old };
}

/** Old consumable and provision ids → the kit or salve that replaced them. */
const CONSUMABLE_REPLACEMENTS: Record<string, string> = {
  lockpicks: 'roguesRoll',
  ropeAndPitons: 'explorersKit',
  torches: 'lantern',
  bait: 'huntersPack',
  gifts: 'giftBasket',
  holyWater: 'holyRelics',
  fireResistanceElixir: 'emberWardSalve',
  wardBone: 'roguesRoll',
};

/**
 * Version 14 → 15: kits and ward salves replace the old provisions,
 * consumables and recipes. Stock counts add up under the new ids, an
 * equipped consumable becomes its replacement, the old recipes are
 * forgotten, a running expedition's kit is refunded as its new one and the
 * expedition left without a briefing (so it resolves with no threats), and
 * old reports lose their kit fields with their consumables remapped.
 */
export function migrateV14Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const remap = (id: string) => CONSUMABLE_REPLACEMENTS[id] ?? id;

  const consumables: Record<string, number> = {};
  for (const [id, count] of Object.entries(save.consumables)) {
    const mapped = remap(id);
    consumables[mapped] = (consumables[mapped] ?? 0) + count;
  }

  const heroes = save.heroes.map((hero) => ({
    ...hero,
    equipment: { ...hero.equipment, consumable: hero.equipment.consumable ? remap(hero.equipment.consumable) : null },
  }));
  const knownRecipes = save.knownRecipes.filter((id) => !(id in CONSUMABLE_REPLACEMENTS));

  const expeditions = save.expeditions.map((expedition) => {
    const { kitId, modifierId: _modifierId, briefing: _briefing, ...rest } = expedition as ActiveExpedition & {
      kitId?: string;
      modifierId?: string;
    };
    if (kitId !== undefined) consumables[remap(kitId)] = (consumables[remap(kitId)] ?? 0) + 1;
    return rest;
  });
  const reports = save.reports.map((report) => {
    const { kitId: _kitId, kitUsed: _kitUsed, ...rest } = report as ExpeditionReport & { kitId?: string; kitUsed?: boolean };
    return { ...rest, consumablesUsed: rest.consumablesUsed.map(remap) };
  });
  // Fights started before the update settle without salvage: the run they
  // were played out with is gone.
  const patrolFights = save.patrolFights.map((fight) => {
    const { consumed: _consumed, ...rest } = fight as PatrolFight & { consumed?: string[] };
    return { ...rest, salvaged: [] as ExpeditionReport['salvaged'] };
  });

  return { ...save, consumables, heroes, knownRecipes, expeditions, reports, patrolFights };
}

/**
 * Version 15 → 16: the level cap and new XP curve. Heroes above 15 come down
 * to 15 with no XP; others keep their level with XP clamped below the new
 * next-level need. The new hero fields (roll, approach picks) are optional, so
 * heroes without them read as an average roll with pending picks derived.
 */
export function migrateV15Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  const heroes = save.heroes.map((hero): HeroState => {
    if (hero.level >= xpRules.maxLevel) return { ...hero, level: xpRules.maxLevel, xp: 0 };
    return { ...hero, xp: Math.min(hero.xp, xpToNextLevel(hero.level) - 1) };
  });
  return { ...save, heroes };
}

/** Old mastery keys → their new gear types. */
const MASTERY_RENAMES: Record<string, MasteryType> = { instrument: 'lute', armour: 'mail' };

/** The tier 1 kit every save knew when v16 was current. */
const LEGACY_STARTING_RECIPES = ['sword1', 'bow1', 'quiver1', 'wand1', 'mail1', 'shield1'];

/**
 * Version 16 → 17: the equipment rework. Every owned or equipped piece keeps
 * its quality, roll and infusion under the new type-and-tier ids
 * (`*Armour` → mail, `*Lute` → lute); known recipes map one to one, each
 * owned pickaxe opens the next tier's recipes, and the tier 1 starting set is
 * added. Mastery keys carry over, and heroes get empty off-hand and trinket
 * slots. Running expeditions need nothing: the party is recomputed at resolve.
 */
export function migrateV16Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };

  const gear = save.gear.flatMap((gear): GearInstance[] => {
    const itemId = legacyRecipeId(gear.itemId);
    return itemId && itemById[itemId] ? [{ ...gear, itemId }] : [];
  });
  const kept = new Set(gear.map((g) => g.uid));
  const heroes = save.heroes.map((hero): HeroState => ({
    ...hero,
    equipment: {
      weapon: hero.equipment.weapon && kept.has(hero.equipment.weapon) ? hero.equipment.weapon : null,
      armor: hero.equipment.armor && kept.has(hero.equipment.armor) ? hero.equipment.armor : null,
      offhand: null,
      trinket: null,
      consumable: hero.equipment.consumable ?? null,
    },
  }));

  const knownRecipes = [
    ...new Set([
      ...save.knownRecipes.flatMap((id) => {
        if (recipeById[id]) return [id];
        const mapped = legacyRecipeId(id);
        return mapped && recipeById[mapped] ? [mapped] : [];
      }),
      // Each owned pickaxe opens the tier its recipe teaches; the iron one also smelts steel.
      ...save.tools.flatMap((toolId) => {
        const tool = itemById[toolId];
        if (tool?.slot !== 'tool') return [];
        return tool.tier === 4 ? ['smeltSteel', ...tierRecipes(5)] : tierRecipes(tool.tier + 1);
      }),
      ...LEGACY_STARTING_RECIPES,
    ]),
  ];

  const mastery: Partial<Record<MasteryType, MasteryState>> = {};
  for (const [key, state] of Object.entries((old.mastery ?? {}) as Record<string, MasteryState>)) {
    const type = (MASTERY_RENAMES[key] ?? key) as MasteryType;
    if (MASTERY_TYPES.includes(type)) mastery[type] = state;
  }
  // A type first met through a recipe (pickaxe-taught or starting) starts at that tier's start.
  for (const item of knownRecipes
    .flatMap((id) => {
      const item = forgedItem(recipeById[id]);
      return item ? [item] : [];
    })
    .sort((a, b) => a.tier - b.tier)) {
    const type = masteryTypeOf(item);
    if (!mastery[type]) mastery[type] = startingMastery(item.tier);
  }

  return { ...save, gear, heroes, knownRecipes, mastery };
}

/**
 * Version 17 → 18: kit and ward salve recipes open with the tiers alone, so
 * their ids leave `knownRecipes`. Kits and salves already owned stay.
 */
export function migrateV17Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  return { ...save, knownRecipes: save.knownRecipes.filter((id) => recipeById[id]?.availableFromTier === undefined) };
}

/** Version 18 → 19: walking consumables in use, none yet. */
export function migrateV18Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old, walkEffects: old.walkEffects ?? [] };
}

/** Version 19 → 20: map places; nothing used, bought or blessed yet. */
export function migrateV19Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old };
}

/** Version 20 → 21: fight events, heists and ruins; nothing under way or dug yet. */
export function migrateV20Save(old: Partial<SaveData>): SaveData {
  return { ...createInitialSave(), ...old };
}

/**
 * Version 21 → 22: 26 classes. Heroes keep their class, level, picks and
 * roll; approach scores come from the class data. The roster's classes count
 * as met.
 */
export function migrateV21Save(old: Partial<SaveData>): SaveData {
  const heroes = old.heroes ?? createInitialSave().heroes;
  return { ...createInitialSave(), ...old, seenClasses: [...new Set(heroes.map((h) => h.classId))] };
}

/** Old charms: the loot charms that replace them are made from monster parts. Each one owned is paid back. */
const OLD_CHARMS = ['rabbitsFoot', 'luckyTooth'];
const OLD_CHARM_GOLD = 10;

type OldReport = Omit<ExpeditionReport, 'loot'> & { loot?: Loot; materials?: MaterialStack[]; recipeId?: string | null };
type OldReward = Partial<Loot> & { recipeId?: string; shards?: { element: Element; amount: number } };

/** A reward rolled before the loot matrix, as loot: its gold, XP, materials (shards folded in), items, gear, recipe and key fragments. */
function oldRewardLoot(old: OldReward): Loot {
  const { recipeId, shards, ...rest } = old;
  return {
    ...emptyLoot(),
    ...rest,
    materials: [...(old.materials ?? []), ...(shards ? [{ materialId: shardId(shards.element), amount: shards.amount }] : [])],
    recipeIds: [...(old.recipeIds ?? []), ...(recipeId ? [recipeId] : [])],
  };
}

/**
 * Version 22 → 23: the loot matrix. Treasure maps become common. Rewards
 * waiting on fights, heists and reports become loot. Old charms, in stock or
 * in a slot, become gold. Per-dungeon first clears and daily bonuses go; step
 * chests start the day unopened. The new inventories start empty.
 */
export function migrateV22Save(old: Partial<SaveData> & Record<string, unknown>): SaveData {
  const { firstClears: _fc, bossBonusDays: _bb, blueprintBonusDays: _bp, ...rest } = old;
  const save: SaveData = { ...createInitialSave(), ...rest };
  const consumables = { ...save.consumables };
  let charms = 0;
  for (const id of OLD_CHARMS) {
    charms += consumables[id] ?? 0;
    delete consumables[id];
  }
  const heroes = save.heroes.map((hero): HeroState => {
    if (!hero.equipment.consumable || !OLD_CHARMS.includes(hero.equipment.consumable)) return hero;
    charms += 1;
    return { ...hero, equipment: { ...hero.equipment, consumable: null } };
  });
  const reports = (save.reports as OldReport[]).map(
    ({ materials, recipeId, loot, mainRewards: _m, firstClear: _f, dailyBlueprint: _d, ...report }: OldReport & Record<string, unknown>) => ({
      ...report,
      loot: loot ?? oldRewardLoot({ gold: report.gold, xp: report.xp, materials: materials ?? [], ...(recipeId ? { recipeId } : {}) }),
    }),
  ) as ExpeditionReport[];
  return {
    ...save,
    gold: save.gold + charms * OLD_CHARM_GOLD,
    consumables,
    heroes,
    reports,
    treasureMaps: save.treasureMaps.map((map) => ({ ...map, rarity: map.rarity ?? 'common' })),
    placeFights: save.placeFights.map((fight) => ({ ...fight, reward: oldRewardLoot(fight.reward as OldReward) })),
    heists: save.heists.map((heist) => ({ ...heist, reward: oldRewardLoot(heist.reward as OldReward) })),
    patrolFights: save.patrolFights.map((fight) => ({ ...fight, rewards: oldRewardLoot(fight.rewards as OldReward) })),
    chests: { day: '', opened: [] },
  };
}
