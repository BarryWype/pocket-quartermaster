import { dungeons } from '@/content/dungeons';
import { itemById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';
import { provisionRules } from '@/content/provisions';

import { createInitialSave, type SaveData } from './save';
import { canWield } from './team/team';
import type { ActiveExpedition, ExpeditionReport, GearInstance, HeroClassId, HeroState } from './types';
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
  for (let i = 0; i < keys && sigils.length < mainRewardRules.sigilCap; i++) sigils.push(1);
  return { ...save, gear, materials, sigils, mastery: createInitialSave().mastery };
}

/** Version 6 → 7: pool dungeons already cleared count as having paid their first-clear bonus. */
export function migrateV6Save(old: Partial<SaveData>): SaveData {
  const save: SaveData = { ...createInitialSave(), ...old };
  return { ...save, firstClears: [...save.clearedDungeons] };
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
    const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
    const allowed = !weapon || canWield({ ...hero, classId }, itemById[weapon.itemId]);
    return {
      ...hero,
      classId,
      trait: hero.trait ?? STARTING_TRAITS[hero.id] ?? 'tough',
      equipment: { ...hero.equipment, weapon: allowed ? hero.equipment.weapon : null },
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
  return { ...createInitialSave(), ...old, bossBonusDays: {} };
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
    blueprintBonusDays: {},
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
