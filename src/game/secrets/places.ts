import { heroClasses, newHero } from '@/content/heroes';
import { placeRules } from '@/content/places';
import { heroNames, recruitRules } from '@/content/roster';
import { secretRules } from '@/content/secrets';
import { shopRules } from '@/content/shops';
import { trinketId, trinketKinds, trinketRules } from '@/content/trinkets';
import { traits } from '@/content/traits';

import { highestUnlockedTier } from '../dungeons/unlock';
import { ELEMENTS } from '../elements';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { makeGearPiece } from '../gear/make';
import type { PlaceSpawn } from '../places/generate';
import { rosterFull } from '../team/team';
import { rolledSpecial } from '../team/specials';
import { offerLevel, recruitPrice, type RecruitOffer } from '../taverns/taverns';
import { recruitGrade, rollRecruit } from '../taverns/roll';
import type { GearInstance, HeroClassId } from '../types';
import type { SaveData } from '../save';
import { hasKey, spendKey } from './keys';
import { secretPlaceId, tipForPlace } from './tips';

export type SecretProblem = 'gone' | 'tooFar' | 'noKey' | 'notEntered' | 'taken' | 'rosterFull' | 'gold' | 'soldOut';

/** Whether the key was spent on entering this den or black market. */
export function isEntered(save: SaveData, place: PlaceSpawn): boolean {
  return tipForPlace(save, place.id)?.entered === true;
}

export function enterProblem(save: SaveData, place: PlaceSpawn, player: LatLng, now: number): SecretProblem | null {
  const tip = tipForPlace(save, place.id);
  if (!tip || tip.expiresAt <= now || place.id in save.usedPlaces || tip.entered) return 'gone';
  if (distanceMeters(player, place.position) > placeRules.interactionMeters) return 'tooFar';
  if (!hasKey(save)) return 'noKey';
  return null;
}

/** Opens a tipped den or black market: spends a key and marks the tip entered. */
export function enterSecret(save: SaveData, place: PlaceSpawn, player: LatLng, now: number): SaveData {
  if (place.kind !== 'hiddenDen' && place.kind !== 'blackMarket') throw new Error(`${place.id} holds no secret to enter`);
  const problem = enterProblem(save, place, player, now);
  if (problem) throw new Error(`Cannot enter: ${problem}`);
  const spent = spendKey(save);
  return {
    ...spent,
    secretTips: spent.secretTips.map((tip) => (secretPlaceId(tip) === place.id ? { ...tip, entered: true } : tip)),
  };
}

/** The rare hero waiting at a den or black market, deterministic from the place. */
export function secretRecruit(save: SaveData, place: PlaceSpawn): RecruitOffer {
  const rng = createRng(`secret-recruit|${place.id}`);
  const pool = (Object.keys(heroClasses) as HeroClassId[]).filter((classId) => heroClasses[classId].rarity === 'rare');
  const classId = pool[rng.int(0, pool.length - 1)];
  const names = heroNames[classId];
  const name = names[rng.int(0, names.length - 1)];
  const positive = rng.chance(recruitRules.positiveTraitChance);
  const traitPool = traits.filter((t) => t.positive === positive);
  const trait = traitPool[rng.int(0, traitPool.length - 1)].id;
  const id = `${place.id}:recruit`;
  const roll = rollRecruit(id, undefined, classId);
  const grade = recruitGrade(roll);
  const level = offerLevel(save);
  return {
    id,
    classId,
    name,
    level,
    trait,
    special: rolledSpecial(id, classId),
    roll,
    grade,
    price: recruitPrice('rare', level, save.heroes.length, positive, highestUnlockedTier(save), grade),
    expiresAt: place.expiresAt,
  };
}

export function secretRecruitProblem(save: SaveData, place: PlaceSpawn, player: LatLng, now: number): SecretProblem | null {
  const tip = tipForPlace(save, place.id);
  if (!tip || tip.expiresAt <= now || place.id in save.usedPlaces) return 'gone';
  if (!tip.entered) return 'notEntered';
  if (distanceMeters(player, place.position) > placeRules.interactionMeters) return 'tooFar';
  const offer = secretRecruit(save, place);
  if (offer.id in save.takenOffers) return 'taken';
  if (rosterFull(save)) return 'rosterFull';
  if (save.gold < offer.price) return 'gold';
  return null;
}

/** Hires the waiting hero: pays, adds them to the roster; a den is used up, a market stays open. */
export function recruitAtSecret(save: SaveData, place: PlaceSpawn, player: LatLng, now: number): SaveData {
  const problem = secretRecruitProblem(save, place, player, now);
  if (problem) throw new Error(`Cannot recruit: ${problem}`);
  const offer = secretRecruit(save, place);
  const hero = { ...newHero(`h${save.nextUid}`, offer.name, offer.classId, offer.trait, offer.level, offer.special), roll: offer.roll };
  let next: SaveData = {
    ...save,
    gold: save.gold - offer.price,
    heroes: [...save.heroes, hero],
    takenOffers: { ...save.takenOffers, [offer.id]: place.expiresAt },
    nextUid: save.nextUid + 1,
  };
  if (place.kind === 'hiddenDen') next = { ...next, usedPlaces: { ...next.usedPlaces, [place.id]: place.expiresAt } };
  return next;
}

export type MarketLine = {
  key: string;
  id: string;
  price: number;
  /** The piece on sale; the real uid is assigned on purchase. */
  gear: GearInstance;
};

/** The black market's goods, Rare trinkets, deterministic from the place and the player's state. */
export function blackMarketGoods(save: SaveData, place: PlaceSpawn): MarketLine[] {
  const rng = createRng(`black-market|${place.id}`);
  const markup = secretRules.blackMarket.markup;
  const tier = highestUnlockedTier(save);
  const count = rng.int(...secretRules.blackMarket.lines);
  // The five amulets are one weighted entry, like a looted trinket; the ring and the loot trinkets never sell here.
  const amulet = trinketKinds.find((kind) => kind.group === 'amulet')!;
  const trinketPool = trinketKinds.filter((kind) => kind.group !== 'fortune' && kind.group !== 'loot' && (kind.group !== 'amulet' || kind === amulet));
  return Array.from({ length: count }, (_, i) => {
    const pick = rng.weighted(trinketPool, (kind) => trinketRules.weights[kind.group]);
    const kind = pick.group === 'amulet' ? `${ELEMENTS[rng.int(0, ELEMENTS.length - 1)]}Amulet` : pick.kind;
    const id = trinketId(kind, tier);
    return {
      key: `gear:${i}`,
      id,
      price: Math.round(shopRules.gearPrice[tier - 1] * shopRules.rarityPrice.rare * markup),
      gear: makeGearPiece(`market:${place.id}:${i}`, id, 'rare'),
    };
  });
}

export function marketBuyProblem(save: SaveData, place: PlaceSpawn, key: string, player: LatLng, now: number): SecretProblem | null {
  const tip = tipForPlace(save, place.id);
  if (!tip || tip.expiresAt <= now || place.id in save.usedPlaces) return 'gone';
  if (!tip.entered) return 'notEntered';
  if (distanceMeters(player, place.position) > placeRules.interactionMeters) return 'tooFar';
  const line = blackMarketGoods(save, place).find((l) => l.key === key);
  if (!line) return 'gone';
  if ((save.placePurchases[place.id]?.bought[key] ?? 0) >= 1) return 'soldOut';
  if (save.gold < line.price) return 'gold';
  return null;
}

/** Buys one of the black market's goods; the market stays open for the rest. */
export function buyAtBlackMarket(save: SaveData, place: PlaceSpawn, key: string, player: LatLng, now: number): SaveData {
  const problem = marketBuyProblem(save, place, key, player, now);
  if (problem) throw new Error(`Cannot buy ${key}: ${problem}`);
  const line = blackMarketGoods(save, place).find((l) => l.key === key)!;

  const uid = `g${save.nextUid}`;
  const next: SaveData = { ...save, gold: save.gold - line.price, gear: [...save.gear, { ...line.gear, uid }], nextUid: save.nextUid + 1 };

  const bought = next.placePurchases[place.id]?.bought ?? {};
  return {
    ...next,
    placePurchases: {
      ...next.placePurchases,
      [place.id]: { expiresAt: place.expiresAt, bought: { ...bought, [key]: 1 } },
    },
  };
}
