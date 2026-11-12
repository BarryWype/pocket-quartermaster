import { heroClasses, newHero } from '@/content/heroes';
import { provisionRules } from '@/content/provisions';
import { families, type FamilyId } from '@/content/families';
import { heroNames, recruitRules } from '@/content/roster';
import { tavernName, tavernNames, tavernRules } from '@/content/taverns';
import { traits } from '@/content/traits';

import { nextRotationAt, rotationDay } from '../dungeons/rotation';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { emergencyPrice } from '../expeditions/provisions';
import { guildBonus, tavernOfferCount } from '../guild/guild';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { placeGroupOf, placesAround, type PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { rosterFull } from '../team/team';
import { rolledSpecial } from '../team/specials';
import type { ClassRarity, HeroClassId, HeroRoll, SpecialId } from '../types';
import { gradePriceMultiplier, recruitGrade, rollRecruit, type Grade } from './roll';

type TavernRules = typeof tavernRules;
type RecruitRules = typeof recruitRules;

/** A tavern place with its name; it sells like any place (see places/shops.ts). */
export type TavernSpawn = PlaceSpawn & { name: string };

export type RecruitOffer = {
  id: string;
  classId: HeroClassId;
  name: string;
  level: number;
  trait: string;
  /** The recruit's special, rolled from the offer id (see game/team/specials.ts). */
  special: SpecialId;
  /** The recruit's 3d6 roll (see roll.ts). */
  roll: HeroRoll;
  /** The roll's grade, which scales the price. */
  grade: Grade;
  price: number;
  /** When the tavern's offers refresh. */
  expiresAt: number;
  /** The week's wanted family, on the tavern's first offer only (see wantedFamily). */
  wanted?: FamilyId;
};

export type RecruitProblem = 'locked' | 'tooFar' | 'taken' | 'rosterFull' | 'gold';

/** A tavern spawn with its name: drawn from the spawn id, so a tavern keeps its name for everyone. */
export const withTavernName = (spawn: PlaceSpawn): TavernSpawn => {
  const rng = createRng(`tavern-name|${spawn.id}`);
  return {
    ...spawn,
    name: tavernName(rng.int(0, tavernNames.adjectives.length - 1), rng.int(0, tavernNames.nouns.length - 1)),
  };
};

/**
 * Taverns are map places now: the same for everyone while their 72 h window
 * lasts, then they move. Only their recruits change every rotation day.
 */
export function generateTavernsAround(position: LatLng, timeMs: number): TavernSpawn[] {
  return placesAround(position, timeMs, [placeGroupOf('tavern')])
    .filter((spawn) => spawn.kind === 'tavern')
    .map(withTavernName);
}

export const isTavernUnlocked = (save: SaveData, rules: TavernRules = tavernRules) =>
  save.stats.questsDone >= rules.unlockedAfterQuests;

/** Recruits join one level under the roster's median level, never below the bottom of the player's tier band. */
export function offerLevel(save: SaveData, rules: RecruitRules = recruitRules) {
  const levels = save.heroes.map((h) => h.level).sort((a, b) => a - b);
  const median = levels.length ? levels[Math.floor((levels.length - 1) / 2)] : 1;
  return Math.max(rules.levelByTier[highestUnlockedTier(save) - 1], median - 1);
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
 * The classes a tier's taverns can offer, with their pick weights: the
 * class's rarity weight, more for the tier's newcomers, less for a class the
 * roster already has (`owned`).
 */
export function recruitPool(
  tier: number,
  rules: RecruitRules = recruitRules,
  owned: ReadonlySet<HeroClassId> = new Set(),
): { classId: HeroClassId; weight: number }[] {
  return (Object.keys(heroClasses) as HeroClassId[]).flatMap((classId) => {
    const { rarity, poolTier } = heroClasses[classId];
    if (rarity === 'rare' || poolTier === null || poolTier > tier) return [];
    const weight = rules.rarityWeights[rarity] * (poolTier === tier ? rules.newClassWeight : 1) * (owned.has(classId) ? rules.ownedClassWeight : 1);
    return [{ classId, weight }];
  });
}

/** Draws a tavern class from the tier's pool, by weight; `family` keeps only that family's classes. */
export function pickRecruitClass(
  rng: Rng,
  tier: number,
  rules: RecruitRules = recruitRules,
  owned: ReadonlySet<HeroClassId> = new Set(),
  family: FamilyId | null = null,
): HeroClassId {
  const pool = recruitPool(tier, rules, owned).filter(({ classId }) => !family || heroClasses[classId].familyTag === family);
  return rng.weighted(pool, ({ weight }) => weight).classId;
}

/** The rotation week of a time: `wantedDays` rotation days each. */
export const rotationWeek = (now: number, rules: RecruitRules = recruitRules) => Math.floor(rotationDay(now) / rules.wantedDays);

/**
 * The family "in town" this week at a tier: the families with a class in the
 * tier's pool take turns, one a week, in an order shuffled afresh each cycle
 * from the cycle's number, so it is the same for every player of that tier.
 */
export function wantedFamily(week: number, tier: number, rules: RecruitRules = recruitRules): FamilyId {
  const inPool = new Set(recruitPool(tier, rules).map(({ classId }) => heroClasses[classId].familyTag));
  const eligible = families.map((f) => f.id).filter((id) => inPool.has(id));
  const cycle = Math.floor(week / eligible.length);
  const rng = createRng(`wanted|${tier}|${cycle}`);
  const order = [...eligible];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[week - cycle * eligible.length];
}

/**
 * Today's recruits at a tavern. Class, name and trait are the same for every
 * player on a rotation day; level and price follow the player's roster.
 * `seed` lets debug reroll them.
 */
export function tavernOffers(save: SaveData, tavernId: string, now: number, seed = '', rules: RecruitRules = recruitRules): RecruitOffer[] {
  const day = rotationDay(now);
  const rng = createRng(`offers|${tavernId}|${day}|${seed}`);
  const tier = highestUnlockedTier(save);
  const level = offerLevel(save, rules);
  // Offers are drawn one after another from the seed, so a 4th one leaves the first 3 unchanged.
  const discount = 1 - guildBonus(save, 'tavernDiscount');
  const owned = new Set(save.heroes.map((h) => h.classId));
  const wanted = wantedFamily(rotationWeek(now, rules), tier, rules);
  return Array.from({ length: tavernOfferCount(save) }, (_, i) => {
    // The first offer is of the week's wanted family.
    const classId = pickRecruitClass(rng, tier, rules, owned, i === 0 ? wanted : null);
    const rarity = heroClasses[classId].rarity;
    const names = heroNames[classId];
    const positive = rng.chance(rules.positiveTraitChance);
    const pool = traits.filter((t) => t.positive === positive);
    // The id comes first: the roll and the offer are both keyed on it.
    const id = `${tavernId}:${day}${seed}:${i}`;
    const roll = rollRecruit(id, rules, classId);
    const grade = recruitGrade(roll, rules);
    return {
      id,
      classId,
      name: names[rng.int(0, names.length - 1)],
      level,
      trait: pool[rng.int(0, pool.length - 1)].id,
      special: rolledSpecial(id, classId),
      roll,
      grade,
      price: Math.round(
        recruitPrice(rarity, level, save.heroes.length, positive, tier, grade, rules) * discount,
      ),
      expiresAt: nextRotationAt(now),
      ...(i === 0 ? { wanted } : {}),
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
  const hero = { ...newHero(`h${save.nextUid}`, offer.name, offer.classId, offer.trait, offer.level, offer.special), roll: offer.roll };
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
