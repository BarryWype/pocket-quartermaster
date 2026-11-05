import { dungeons } from '@/content/dungeons';
import { classAffinities } from '@/content/equipment';
import { classSpecials } from '@/content/classSpecials';
import { newHero } from '@/content/heroes';
import { items } from '@/content/items';
import type { Rarity } from '@/content/gear';
import type { GearDef, HeroClassId, HeroState } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { makeGearPiece } from '../gear/make';
import { equip } from '../team/team';
import { expectedLevels } from './config';
import { fillPotions } from './rules/loadout';

/** The class's best weapon of a tier: a favoured type, first one found. */
function weaponFor(classId: HeroClassId, tier: number) {
  return items.find(
    (i): i is GearDef =>
      i.slot === 'weapon' && i.tier === tier && !!i.gearType && classAffinities[classId][i.gearType as keyof (typeof classAffinities)[HeroClassId]] === 'favoured',
  );
}

/**
 * The reference team for odds targets: these classes at a level, in a tier's
 * best weapons and armour at one rarity, each with a healing potion, no traits.
 */
export function referenceTeam(classes: HeroClassId[], tier: number, rarity: Rarity, level: number): SaveData {
  // Each class rolls its first common special, like the reference teams it simulates.
  const heroes: HeroState[] = classes.map((classId, i) => newHero(`h${i}`, classId, classId, '', level, classSpecials[classId].common[0]));
  const armour = items.find((i) => i.slot === 'armor' && i.tier === tier)!;
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    heroes,
    consumables: { ...createInitialSave().consumables, healingPotion: classes.length },
    gear: classes.flatMap((classId, i) => [
      makeGearPiece(`w${i}`, weaponFor(classId, tier)!.id, rarity),
      makeGearPiece(`a${i}`, armour.id, rarity),
    ]),
  };
  heroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}

/** The tier's chain weapons: a sword, a bow and a wand, one per hero like the sim's quick team. */
const WEAPONS = ['sword', 'bow', 'wand'] as const;

/**
 * The reference save a difficulty's odds are measured against (see
 * difficultyOdds.ts): the starting heroes at the tier's start or end level,
 * in the gear a player is expected to have then, every lower tier cleared so
 * this tier is unlocked, three healing potions equipped.
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
  const heroes = initial.heroes.slice(0, party).map((h) => ({ ...h, level }));
  let save: SaveData = {
    ...initial,
    tutorial: { ...initial.tutorial, step: 'done' },
    heroes,
    clearedDungeons: dungeons.filter((d) => d.tier < tier).map((d) => d.id),
    gear: heroes.flatMap((_, i) => [
      makeGearPiece(`w${i}`, `${WEAPONS[i]}${gearTier}`, rarity),
      ...(withArmour ? [makeGearPiece(`a${i}`, `mail${gearTier}`, rarity)] : []),
    ]),
    consumables: { ...initial.consumables, healingPotion: 3 },
  };
  heroes.forEach((hero, i) => {
    save = equip(save, hero.id, 'weapon', `w${i}`);
    if (withArmour) save = equip(save, hero.id, 'armor', `a${i}`);
  });
  return fillPotions(save, save.heroes.map((h) => h.id));
}
