import { newHero } from '@/content/heroes';
import { patrolRules, travellerRules, type PatrolRules } from '@/content/patrols';
import { heroNames, recruitRules } from '@/content/roster';
import { traits } from '@/content/traits';
import { mealItems, pickSupply, supplyHeld } from '../expeditions/provisions';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { guildBonus, rosterCap } from '../guild/guild';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { hasMaterials, removeMaterials, addMaterials } from '../inventory';
import { pickaxeTier } from '../gathering/gathering';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import type { Loot } from '../loot/types';
import { valuableSellPrice } from '../loot/valuables';
import { grantTip, rollTip, type TipOutcome } from '../secrets/tips';
import { recruitGrade, rollRecruit, type Grade } from '../taverns/roll';
import { pickRecruitClass } from '../taverns/taverns';
import type { SaveData } from '../save';
import { isAway } from '../team/team';
import type { HeroClassId, HeroRoll, MaterialStack } from '../types';
import { isTravellerKind, pruneByWindow, type PatrolSpawn, type TravellerKind } from './generate';
import { distanceTo, isGone } from './visibility';

const POTION = 'healingPotion';
/** A trader's deal: this many of one material for that many of another. */
export type TradeOffer = {
  /** Index in the config's trade list, the key its uses are counted by. */
  index: number;
  give: MaterialStack;
  get: MaterialStack;
  usesLeft: number;
};

/** What a traveller asks for. */
export type TravellerAsk =
  | { kind: 'potion'; itemId: string; amount: number }
  | { kind: 'mealOrSupply'; supplyPoints: number; mealItemIds: string[] }
  | { kind: 'trades'; trades: TradeOffer[] };

/** A helped traveller's loot (a pilgrim may also bless the heroes at home), or a recruit offer instead. */
export type TravellerReward = { kind: 'loot'; loot: Loot; blessing: boolean } | { kind: 'recruit'; offer: TravellerRecruit };

export type TravellerRecruit = {
  id: string;
  classId: HeroClassId;
  name: string;
  trait: string;
  level: number;
  roll: HeroRoll;
  grade: Grade;
};

export type HelpProblem = 'tooFar' | 'gone' | 'noStock' | 'trader' | null;
export type TradeProblem = 'tooFar' | 'gone' | 'usedUp' | 'noMaterials' | null;

/** What the traveller standing there wants, before anything is paid. */
export function travellerOffer(spawn: PatrolSpawn, save: SaveData, rules: PatrolRules = patrolRules): TravellerAsk {
  if (!isTravellerKind(spawn.kind)) throw new Error(`Nothing to ask of a ${spawn.kind}`);
  if (spawn.kind === 'wounded') return { kind: 'potion', itemId: POTION, amount: 1 };
  if (spawn.kind === 'pilgrim') {
    return { kind: 'mealOrSupply', supplyPoints: travellerRules.pilgrimSupplyPoints, mealItemIds: mealItems.map((i) => i.id) };
  }
  return { kind: 'trades', trades: traderOffers(spawn, save, rules) };
}

/** Whether the pilgrim's supply can be paid from the stock at all. */
const canPaySupply = (save: SaveData, points: number) => supplyHeld(save.consumables) >= points;

/** Why this traveller cannot be helped from here now, or null. Traders trade instead. */
export function helpProblem(
  save: SaveData,
  spawn: PatrolSpawn,
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): HelpProblem {
  if (!isTravellerKind(spawn.kind) || isGone(spawn, { ...save.beatenPatrols, ...save.helpedTravellers }, now)) return 'gone';
  if (spawn.kind === 'trader') return 'trader';
  if (distanceTo(spawn, player, now) > rules.engageMeters) return 'tooFar';
  if (spawn.kind === 'wounded' && (save.consumables[POTION] ?? 0) < 1) return 'noStock';
  if (spawn.kind === 'pilgrim' && !mealItems.some((i) => (save.consumables[i.id] ?? 0) > 0) && !canPaySupply(save, travellerRules.pilgrimSupplyPoints)) {
    return 'noStock';
  }
  return null;
}

/** A recruit offer from a traveller: a pool class for the player's tier, at the band's bottom level. */
function travellerRecruit(save: SaveData, spawn: PatrolSpawn): TravellerRecruit {
  const rng = createRng(`traveller-recruit|${spawn.id}`);
  const classId = pickRecruitClass(rng, highestUnlockedTier(save));
  const names = heroNames[classId];
  const positive = traits.filter((t) => t.positive);
  const id = `traveller:${spawn.id}`;
  const roll = rollRecruit(id, undefined, classId);
  return {
    id,
    classId,
    name: names[rng.int(0, names.length - 1)],
    trait: positive[rng.int(0, positive.length - 1)].id,
    level: recruitRules.levelByTier[highestUnlockedTier(save) - 1],
    roll,
    grade: recruitGrade(roll),
  };
}

/** The reward a traveller gives: the Traveller row of the loot matrix, seeded on the spawn so it never changes. */
function rollReward(save: SaveData, spawn: PatrolSpawn, kind: TravellerKind): TravellerReward {
  const rng = createRng(`traveller-reward|${spawn.id}`);
  const loot = rollForSave(save, 'traveller', rng);
  return { kind: 'loot', loot, blessing: kind === 'pilgrim' && rng.chance(travellerRules.pilgrimBlessingChance) };
}

/**
 * Helps a traveller: pays what they ask, rolls their reward (seeded on the
 * spawn, so it is the same every time), and marks them helped for the window.
 * A traveller who wants to join either becomes a recruit offer, or, with a full
 * roster, pays their normal reward and says so.
 */
export function helpTraveller(
  save: SaveData,
  spawn: PatrolSpawn,
  player: LatLng,
  now: number,
  choice: 'meal' | 'supply' | undefined = undefined,
  rules: PatrolRules = patrolRules,
): { save: SaveData; reward: TravellerReward; rosterFull: boolean; tip?: TipOutcome } {
  const problem = helpProblem(save, spawn, player, now, rules);
  const kind = spawn.kind;
  if (problem || !isTravellerKind(kind)) throw new Error(`Cannot help this traveller: ${problem}`);

  // Pay: a potion, or a meal — the supply points when there is no meal to give.
  let consumables = { ...save.consumables };
  if (spawn.kind === 'wounded') consumables[POTION] = (consumables[POTION] ?? 0) - 1;
  if (spawn.kind === 'pilgrim') {
    const points = travellerRules.pilgrimSupplyPoints;
    const hasMeal = mealItems.some((i) => (consumables[i.id] ?? 0) > 0);
    const useMeal = choice === 'meal' || (choice !== 'supply' && hasMeal);
    if (useMeal) {
      if (!hasMeal) throw new Error('No meal to give');
      const meal = mealItems.find((i) => (consumables[i.id] ?? 0) > 0)!;
      consumables[meal.id] = consumables[meal.id] - 1;
    } else {
      if (!canPaySupply(save, points)) throw new Error('Not enough supply');
      const supply = pickSupply(consumables, points);
      for (const [itemId, count] of Object.entries(supply.items)) consumables[itemId] = (consumables[itemId] ?? 0) - count;
    }
  }

  const rng = createRng(`traveller-join|${spawn.id}`);
  const recruit = save.heroes.length >= rules.recruitMinRoster && rng.chance(rules.recruitChance);
  const room = save.heroes.length < rosterCap(save);
  let reward = rollReward(save, spawn, kind);
  let rosterFull = false;
  if (recruit && room) {
    reward = { kind: 'recruit', offer: travellerRecruit(save, spawn) };
  } else if (recruit) {
    rosterFull = true;
  }

  let next: SaveData = {
    ...save,
    consumables,
    helpedTravellers: { ...pruneByWindow(save.helpedTravellers, now, rules), [spawn.id]: spawn.endsAt },
  };
  next = grantReward(next, reward, now);
  const tipped = rollTip('traveller', spawn.id) ? grantTip(next, { source: 'traveller', sourceId: spawn.id, anchor: player }, now) : null;
  return { save: tipped ? tipped.save : next, reward, rosterFull, ...(tipped ? { tip: tipped.outcome } : {}) };
}

/** Writes a reward into the save: the loot, and a blessing that rests every home hero (heroes away keep what they have). */
function grantReward(save: SaveData, reward: TravellerReward, now: number): SaveData {
  if (reward.kind !== 'loot') return save;
  const granted = grantLoot(save, [], reward.loot, now);
  if (!reward.blessing) return granted;
  return {
    ...granted,
    heroes: granted.heroes.map((hero) =>
      isAway(granted, hero.id) ? hero : (({ hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...rest }) => rest)(hero),
    ),
  };
}

/** The trader's deals for this spawn: 2–3 of the fixed trades, drawn from the seed and cut to the pickaxe's tier. */
export function traderOffers(spawn: PatrolSpawn, save: SaveData, rules: PatrolRules = patrolRules): TradeOffer[] {
  if (spawn.kind !== 'trader') throw new Error('Not a trader');
  const rng = createRng(`trader|${spawn.id}`);
  const pool = travellerRules.trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => trade.pickaxeTier <= pickaxeTier(save));
  const count = Math.min(pool.length, rng.int(travellerRules.tradesPer[0], travellerRules.tradesPer[1]));
  const offers: TradeOffer[] = [];
  const left = [...pool];
  for (let i = 0; i < count; i++) {
    const pick = left.splice(rng.int(0, left.length - 1), 1)[0];
    const used = save.traderUses[tradeKey(spawn, pick.index)] ?? 0;
    offers.push({ index: pick.index, give: pick.trade.give, get: pick.trade.get, usesLeft: travellerRules.usesPerTrade - used });
  }
  return offers;
}

const tradeKey = (spawn: PatrolSpawn, index: number) => `${spawn.id}:${index}`;

/** Why this valuable cannot be sold to the trader now, or null. */
export function traderValuableProblem(
  save: SaveData,
  spawn: PatrolSpawn,
  key: string,
  count: number,
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): 'gone' | 'tooFar' | 'notEnough' | null {
  if (spawn.kind !== 'trader' || spawn.endsAt <= now) return 'gone';
  if (distanceTo(spawn, player, now) > rules.engageMeters) return 'tooFar';
  if ((save.valuables[key] ?? 0) < count) return 'notEnough';
  return null;
}

/** Sells a valuable stack to the trader at the elsewhere share; the trader stays unhelped. */
export function sellValuableToTrader(
  save: SaveData,
  spawn: PatrolSpawn,
  key: string,
  count: number,
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): SaveData {
  const problem = traderValuableProblem(save, spawn, key, count, player, now, rules);
  if (problem) throw new Error(`Cannot sell ${key}: ${problem}`);
  const separator = key.lastIndexOf(':');
  const price =
    valuableSellPrice(key.slice(0, separator), Number(key.slice(separator + 1)), 'trader', null, guildBonus(save, 'collector')) * count;
  const valuables = { ...save.valuables };
  const left = (valuables[key] ?? 0) - count;
  if (left > 0) valuables[key] = left;
  else delete valuables[key];
  return { ...save, gold: save.gold + price, valuables };
}

/** Why this trade cannot be made now, or null. */
export function tradeProblem(
  save: SaveData,
  spawn: PatrolSpawn,
  tradeIndex: number,
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): TradeProblem {
  if (spawn.kind !== 'trader' || spawn.endsAt <= now) return 'gone';
  const trade = travellerRules.trades[tradeIndex];
  if (!trade || trade.pickaxeTier > pickaxeTier(save)) return 'gone';
  if (distanceTo(spawn, player, now) > rules.engageMeters) return 'tooFar';
  if ((save.traderUses[tradeKey(spawn, tradeIndex)] ?? 0) >= travellerRules.usesPerTrade) return 'usedUp';
  if (!hasMaterials(save.materials, [trade.give])) return 'noMaterials';
  return null;
}

/**
 * Makes one of the trader's trades: materials change hands and the use is
 * counted. The first trade marks the trader helped — off the map — but its
 * other trades stay open until the window ends.
 */
export function trade(
  save: SaveData,
  spawn: PatrolSpawn,
  tradeIndex: number,
  player: LatLng,
  now: number,
  rules: PatrolRules = patrolRules,
): SaveData {
  const problem = tradeProblem(save, spawn, tradeIndex, player, now, rules);
  if (problem) throw new Error(`Cannot trade: ${problem}`);
  const tradeDef = travellerRules.trades[tradeIndex];
  const key = tradeKey(spawn, tradeIndex);
  return {
    ...save,
    materials: addMaterials(removeMaterials(save.materials, [tradeDef.give]), [tradeDef.get]),
    traderUses: { ...pruneByWindow(save.traderUses, now, rules), [key]: (save.traderUses[key] ?? 0) + 1 },
    helpedTravellers: { ...pruneByWindow(save.helpedTravellers, now, rules), [spawn.id]: spawn.endsAt },
  };
}

/** Takes a traveller up on joining the roster. */
export function acceptRecruit(save: SaveData, offer: TravellerRecruit): SaveData {
  if (save.heroes.length >= rosterCap(save)) throw new Error('Roster is full');
  const hero = { ...newHero(`h${save.nextUid}`, offer.name, offer.classId, offer.trait, offer.level), roll: offer.roll };
  return { ...save, heroes: [...save.heroes, hero], nextUid: save.nextUid + 1 };
}
