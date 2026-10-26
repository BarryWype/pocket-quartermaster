import { dungeons } from '@/content/dungeons';
import { itemById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';

import { createInitialSave, type SaveData } from './save';
import { canWield } from './team/team';
import type { GearInstance, HeroClassId, HeroState } from './types';

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
