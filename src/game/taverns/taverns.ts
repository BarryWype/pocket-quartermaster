import { heroClasses, newHero } from '@/content/heroes';
import { provisionRules } from '@/content/provisions';
import { heroNames, recruitRules } from '@/content/roster';
import { tavernName, tavernNames, tavernRules } from '@/content/taverns';
import { traits } from '@/content/traits';

import { nextRotationAt, rotationDay } from '../dungeons/rotation';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { emergencyPrice } from '../expeditions/provisions';
import { guildBonus, tavernOfferCount } from '../guild/guild';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { randomPointInTile, tilesAround } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import type { SaveData } from '../save';
import { rosterFull } from '../team/team';
import type { ClassRarity, HeroClassId, HeroRoll } from '../types';
import { gradePriceMultiplier, recruitGrade, rollRecruit, type Grade } from './roll';

type TavernRules = typeof tavernRules;
type RecruitRules = typeof recruitRules;

export type TavernSpawn = { id: string; name: string; position: LatLng };

export type RecruitOffer = {
  id: string;
  classId: HeroClassId;
  name: string;
  level: number;
  trait: string;
  /** The recruit's 3d6 roll (see roll.ts). */
  roll: HeroRoll;
  /** The roll's grade, which scales the price. */
  grade: Grade;
  price: number;
  /** When the tavern's offers refresh. */
  expiresAt: number;
};

export type RecruitProblem = 'locked' | 'tooFar' | 'taken' | 'rosterFull' | 'gold';

/** Taverns stay put: the same places for every player, every day. Only their recruits change. */
export function generateTavernsAround(position: LatLng, rules: TavernRules = tavernRules): TavernSpawn[] {
  return tilesAround(position, rules.precision).flatMap((tile) => {
    const rng = createRng(`tavern|${tile}`);
    return Array.from({ length: rng.int(rules.perTile[0], rules.perTile[1]) }, (_, i) => ({
      id: `tavern:${tile}:${i}`,
      name: tavernName(rng.int(0, tavernNames.adjectives.length - 1), rng.int(0, tavernNames.nouns.length - 1)),
      position: randomPointInTile(tile, rng),
    }));
  });
}

export const isTavernUnlocked = (save: SaveData, rules: TavernRules = tavernRules) =>
  save.clearedDungeons.includes(rules.unlockedBy);

/** Recruits come in a level below the roster's average. */
export function offerLevel(save: SaveData, rules: RecruitRules = recruitRules) {
  const average = save.heroes.reduce((sum, h) => sum + h.level, 0) / Math.max(1, save.heroes.length);
  return Math.max(1, Math.round(average - rules.levelsBelowAverage));
}

/** base by rarity × level factor × roster factor × trait factor × tier factor × grade factor. */
export function recruitPrice(
  rarity: ClassRarity,
  level: number,
  rosterSize: number,
  positiveTrait: boolean,
  tier = 1,
  grade: Grade = 'B',
  rules: RecruitRules = recruitRules,
) {
  const { base, perLevel, freeHeroes, perExtraHero, trait, perTier } = rules.price;
  const levelFactor = 1 + perLevel * (level - 1);
  const rosterFactor = 1 + perExtraHero * Math.max(0, rosterSize - freeHeroes);
  const tierFactor = perTier ** (tier - 1);
  return Math.round(
    base[rarity] * levelFactor * rosterFactor * tierFactor * (positiveTrait ? trait.positive : trait.negative) * gradePriceMultiplier(grade, rules),
  );
}

/**
 * Today's recruits at a tavern. Class, name and trait are the same for every
 * player on a rotation day; level and price follow the player's roster.
 * `seed` lets debug reroll them.
 */
export function tavernOffers(save: SaveData, tavernId: string, now: number, seed = '', rules: RecruitRules = recruitRules): RecruitOffer[] {
  const day = rotationDay(now);
  const rng = createRng(`offers|${tavernId}|${day}|${seed}`);
  const classIds = Object.keys(heroClasses) as HeroClassId[];
  const level = offerLevel(save, rules);
  // Offers are drawn one after another from the seed, so a 4th one leaves the first 3 unchanged.
  const discount = 1 - guildBonus(save, 'tavernDiscount');
  return Array.from({ length: tavernOfferCount(save) }, (_, i) => {
    const rarity = rng.weighted(Object.keys(rules.rarityWeights) as ClassRarity[], (r) => rules.rarityWeights[r]);
    const classId = rng.weighted(
      classIds.filter((id) => heroClasses[id].rarity === rarity),
      () => 1,
    );
    const names = heroNames[classId];
    const positive = rng.chance(rules.positiveTraitChance);
    const pool = traits.filter((t) => t.positive === positive);
    // The id comes first: the roll and the offer are both keyed on it.
    const id = `${tavernId}:${day}${seed}:${i}`;
    const roll = rollRecruit(id, rules);
    const grade = recruitGrade(roll, rules);
    return {
      id,
      classId,
      name: names[rng.int(0, names.length - 1)],
      level,
      trait: pool[rng.int(0, pool.length - 1)].id,
      roll,
      grade,
      price: Math.round(
        recruitPrice(rarity, level, save.heroes.length, positive, highestUnlockedTier(save), grade, rules) * discount,
      ),
      expiresAt: nextRotationAt(now),
    };
  });
}

export function recruitProblem(
  save: SaveData,
  offer: RecruitOffer,
  tavern: LatLng,
  player: LatLng,
  rules: TavernRules = tavernRules,
): RecruitProblem | null {
  if (!isTavernUnlocked(save, rules)) return 'locked';
  if (distanceMeters(player, tavern) > rules.interactionMeters) return 'tooFar';
  if (offer.id in save.takenOffers) return 'taken';
  if (rosterFull(save)) return 'rosterFull';
  if (save.gold < offer.price) return 'gold';
  return null;
}

/** Pays for a recruit, adds them to the roster with their roll, and marks the offer taken. */
export function recruit(save: SaveData, offer: RecruitOffer, tavern: LatLng, player: LatLng): SaveData {
  const problem = recruitProblem(save, offer, tavern, player);
  if (problem) throw new Error(`Cannot recruit ${offer.name}: ${problem}`);
  const hero = { ...newHero(`h${save.nextUid}`, offer.name, offer.classId, offer.trait, offer.level), roll: offer.roll };
  return {
    ...save,
    gold: save.gold - offer.price,
    heroes: [...save.heroes, hero],
    takenOffers: { ...save.takenOffers, [offer.id]: offer.expiresAt },
    nextUid: save.nextUid + 1,
  };
}


export type SupplyProblem = 'locked' | 'tooFar' | 'gold';

/** Price of one emergency jerky at taverns now. */
export const supplyPrice = (save: SaveData) => emergencyPrice(highestUnlockedTier(save));

export function buySupplyProblem(save: SaveData, count: number, tavern: LatLng, player: LatLng, rules: TavernRules = tavernRules): SupplyProblem | null {
  if (!isTavernUnlocked(save, rules)) return 'locked';
  if (distanceMeters(player, tavern) > rules.interactionMeters) return 'tooFar';
  if (save.gold < supplyPrice(save) * count) return 'gold';
  return null;
}

/** Buys emergency supply at a tavern: jerky, at a steep price. */
export function buySupply(save: SaveData, count: number, tavern: LatLng, player: LatLng): SaveData {
  const problem = buySupplyProblem(save, count, tavern, player);
  if (problem) throw new Error(`Cannot buy supply: ${problem}`);
  const itemId = provisionRules.emergency.itemId;
  return {
    ...save,
    gold: save.gold - supplyPrice(save) * count,
    consumables: { ...save.consumables, [itemId]: (save.consumables[itemId] ?? 0) + count },
  };
}
