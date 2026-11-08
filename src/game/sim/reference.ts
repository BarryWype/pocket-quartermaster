import { dungeons } from '@/content/dungeons';
import { classAffinities, gearId, gearProfiles } from '@/content/equipment';
import { classSpecials } from '@/content/classSpecials';
import { newHero, startingHeroes } from '@/content/heroes';
import { items } from '@/content/items';
import type { Rarity } from '@/content/gear';
import type { GearDef, GearType, HeroClassId, HeroState } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { affixById } from '@/content/affixes';

import { makeGearPiece } from '../gear/make';
import { equip } from '../team/team';
import { expectedLevels } from './config';
import { fillPotions } from './rules/loadout';

/** The middle of the 3d6 stat dice: a reference piece's stats are the average roll. */
const AVERAGE_ROLL = 10.5;

/**
 * A reference piece: average stats for its rarity, and its rarity's affixes
 * (picked from its uid) at the middle of their ranges, so fitted strengths
 * count affixes at their average value.
 */
export function averagePiece(uid: string, itemId: string, rarity: Rarity) {
  const piece = makeGearPiece(uid, itemId, rarity, undefined, { roll: AVERAGE_ROLL });
  return {
    ...piece,
    affixes: piece.affixes.map(({ id }) => {
      const range = affixById[id].range;
      return { id, value: range ? Math.round((range.min + range.max) / 2) : 0 };
    }),
  };
}

/** The class's best weapon of a tier: a favoured type, first one found. */
export function weaponFor(classId: HeroClassId, tier: number) {
  return items.find(
    (i): i is GearDef =>
      i.slot === 'weapon' && i.tier === tier && !!i.gearType && classAffinities[classId][i.gearType as keyof (typeof classAffinities)[HeroClassId]] === 'favoured',
  );
}

/**
 * The reference team for odds targets: these classes at a level, in a tier's
 * best weapons and armour at one rarity, each with a healing potion, no traits.
 */
export function referenceTeam(classes: HeroClassId[], tier: number, rarity: Rarity, level: number, weaponOf: (classId: HeroClassId, tier: number) => GearDef | undefined = weaponFor): SaveData {
  // Each class rolls its first common special, like the reference teams it simulates.
  const heroes: HeroState[] = classes.map((classId, i) => newHero(`h${i}`, classId, classId, '', level, classSpecials[classId].common[0]));
  const armour = items.find((i) => i.slot === 'armor' && i.tier === tier)!;
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    heroes,
    consumables: { ...createInitialSave().consumables, healingPotion: classes.length },
    gear: classes.flatMap((classId, i) => [
      averagePiece(`w${i}`, weaponOf(classId, tier)!.id, rarity),
      averagePiece(`a${i}`, armour.id, rarity),
    ]),
  };
  heroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}

/**
 * `copies` spare pieces of every weapon, armour and off-hand type of a tier
 * at a rarity (weapons only when `weaponsOnly`), for the reference teams to
 * dress from (see families/dress.ts).
 */
export function withSpares(save: SaveData, tier: number, rarity: Rarity, weaponsOnly = false, copies = 1): SaveData {
  const types = (Object.keys(gearProfiles) as GearType[]).filter((type) => !weaponsOnly || gearProfiles[type].slot === 'weapon');
  const spares = types.flatMap((type) => Array.from({ length: copies }, (_, i) => averagePiece(`spare:${type}${i ? `:${i}` : ''}`, gearId(type, tier), rarity)));
  return { ...save, gear: [...save.gear, ...spares] };
}

/** The tier's chain weapons: a sword, a bow and a wand, one per hero like the sim's quick team. */
const WEAPONS = ['sword', 'bow', 'wand'] as const;

/**
 * The reference save a difficulty's odds are measured against (see
 * difficultyOdds.ts): the starting heroes at the tier's start or end level,
 * in the gear a player is expected to have then, with a spare piece of every
 * type of that gear's tier and rarity to dress from (weapons only at the
 * start of tier 1), every lower tier cleared so this tier is unlocked, three
 * healing potions equipped.
 *
 * Start of a tier: the level at the tier's start, Common gear of the previous
 * tier (a weapon only at tier 1, for a new player with about 1.5 items per
 * hero). End of a tier: the level at its end, Uncommon gear of the tier,
 * weapon and armour.
 */
export function referenceSave(tier: number, when: 'start' | 'end', party: number): SaveData {
  const initial = createInitialSave();
  const level = when === 'end' ? expectedLevels[tier - 1] : tier === 1 ? 1 : expectedLevels[tier - 2];
  const gearTier = when === 'end' ? tier : Math.max(1, tier - 1);
  const rarity: Rarity = when === 'end' ? 'uncommon' : 'common';
  const withArmour = !(tier === 1 && when === 'start');
  const heroes = startingHeroes.slice(0, party).map((h) => ({ ...h, level }));
  let save: SaveData = {
    ...initial,
    tutorial: { ...initial.tutorial, step: 'done' },
    heroes,
    clearedDungeons: dungeons.filter((d) => d.tier < tier).map((d) => d.id),
    gear: heroes.flatMap((_, i) => [
      averagePiece(`w${i}`, `${WEAPONS[i]}${gearTier}`, rarity),
      ...(withArmour ? [averagePiece(`a${i}`, `mail${gearTier}`, rarity)] : []),
    ]),
    consumables: { ...initial.consumables, healingPotion: 3 },
  };
  heroes.forEach((hero, i) => {
    save = equip(save, hero.id, 'weapon', `w${i}`);
    if (withArmour) save = equip(save, hero.id, 'armor', `a${i}`);
  });
  return fillPotions(withSpares(save, gearTier, rarity, !withArmour), save.heroes.map((h) => h.id));
}
