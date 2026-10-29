import { heroClasses, newHero } from '@/content/heroes';
import { dungeons } from '@/content/dungeons';
import { mainRewardRules } from '@/content/mainRewards';
import { patrolRules, travellerRules, type PatrolRules } from '@/content/patrols';
import { heroNames, recruitRules } from '@/content/roster';
import { traits } from '@/content/traits';
import { ELEMENTS, shardId, type Element } from '../elements';
import { mealItems, pickSupply, supplyHeld } from '../expeditions/provisions';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { rosterCap } from '../guild/guild';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { hasMaterials, removeMaterials, addMaterials } from '../inventory';
import { pickaxeTier } from '../gathering/gathering';
import { treasureLocation } from '../rewards/treasure';
import { recruitGrade, rollRecruit, type Grade } from '../taverns/roll';
import type { SaveData } from '../save';
import { isAway } from '../team/team';
import type { HeroClassId, HeroRoll, MaterialStack, TreasureMap } from '../types';
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

export type TravellerReward =
  | { kind: 'gold'; gold: number }
  | { kind: 'shards'; element: Element; amount: number }
  | { kind: 'treasureSpot'; mapId: string; tier: number }
  | { kind: 'blessing' }
  | { kind: 'keyFragment' }
  | { kind: 'recruit'; offer: TravellerRecruit };

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

/** A recruit offer from a traveller: any class, a positive trait, near the roster's middle. */
function travellerRecruit(save: SaveData, spawn: PatrolSpawn): TravellerRecruit {
  const rng = createRng(`traveller-recruit|${spawn.id}`);
  const rarity = rng.weighted(
    Object.keys(recruitRules.rarityWeights) as (keyof typeof recruitRules.rarityWeights)[],
    (r) => recruitRules.rarityWeights[r],
  );
  const classId = rng.weighted(
    (Object.keys(heroClasses) as HeroClassId[]).filter((id) => heroClasses[id].rarity === rarity),
    () => 1,
  );
  const names = heroNames[classId];
  const positive = traits.filter((t) => t.positive);
  const levels = [...save.heroes.map((h) => h.level)].sort((a, b) => a - b);
  const median = levels.length % 2 ? levels[(levels.length - 1) / 2] : (levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2;
  const id = `traveller:${spawn.id}`;
  const roll = rollRecruit(id);
  return {
    id,
    classId,
    name: names[rng.int(0, names.length - 1)],
    trait: positive[rng.int(0, positive.length - 1)].id,
    level: Math.max(1, Math.round(median)),
    roll,
    grade: recruitGrade(roll),
  };
}

/** The reward a traveller gives, rolled from its spawn alone so it never changes. */
function rollReward(save: SaveData, spawn: PatrolSpawn, kind: TravellerKind): TravellerReward {
  const rng = createRng(`traveller-reward|${spawn.id}`);
  const tier = highestUnlockedTier(save);
  const table = kind === 'wounded' ? travellerRules.woundedRewards : travellerRules.pilgrimRewards;
  const reward = rng.weighted<{ kind: string; weight: number }>([...table], (entry) => entry.weight).kind;
  if (reward === 'blessing' || reward === 'keyFragment') return { kind: reward };
  if (reward === 'shards') return { kind: reward, element: ELEMENTS[rng.int(0, ELEMENTS.length - 1)], amount: tier };
  if (reward === 'treasureSpot') return { kind: reward, mapId: `map${save.nextUid}`, tier };
  const short = dungeons.find((d) => d.tier === tier && d.slot === 'short')!;
  return { kind: 'gold', gold: Math.round(((short.gold[0] + short.gold[1]) / 2) * travellerRules.goldShareOfShort) };
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
): { save: SaveData; reward: TravellerReward; rosterFull: boolean } {
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
  next = grantReward(next, reward, player, now);
  return { save: next, reward, rosterFull };
}

/** Writes a reward into the save: gold, shards, a treasure map, a blessing or a key fragment. */
function grantReward(save: SaveData, reward: TravellerReward, player: LatLng, now: number): SaveData {
  switch (reward.kind) {
    case 'gold':
      return { ...save, gold: save.gold + reward.gold };
    case 'shards': {
      return { ...save, materials: addMaterials(save.materials, [{ materialId: shardId(reward.element), amount: reward.amount }]) };
    }
    case 'treasureSpot': {
      const map: TreasureMap = {
        id: reward.mapId,
        tier: reward.tier,
        expiresAt: now + mainRewardRules.treasureMapLifetimeHours * 3_600_000,
        // Read right away: pinned to where the player stands, like any read map.
        location: treasureLocation(reward.mapId, player),
      };
      return { ...save, treasureMaps: [...save.treasureMaps, map], nextUid: save.nextUid + 1 };
    }
    case 'blessing':
      // Every home hero healed to full, exhaustion over; heroes away keep what they have.
      return {
        ...save,
        heroes: save.heroes.map((hero) =>
          isAway(save, hero.id)
            ? hero
            : (({ hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...rest }) => rest)(hero),
        ),
      };
    case 'keyFragment':
      return { ...save, keyFragments: save.keyFragments + 1 };
    default:
      return save;
  }
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
