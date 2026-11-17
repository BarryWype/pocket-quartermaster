import type { PlaceKind } from '@/content/places';
import { deliverPlaces, objectives, questRules, type QuestBand, type QuestObjective } from '@/content/quests';
import { itemById, recipeById } from '@/content/lookup';
import { supplyRules, type OrderKind } from '@/content/supplyLines';

import { highestUnlockedTier } from '../dungeons/unlock';
import type { LatLng } from '../generation/types';
import { openBuildingKinds } from '../supply/buildings';
import { isPlaceRevealed, isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';

export type DeliverItem = { itemId: string; place: PlaceKind };

/** The items the player could hand over: every known recipe's output that a place wants. */
export function deliverItems(save: SaveData): DeliverItem[] {
  const seen = new Set<string>();
  const items: DeliverItem[] = [];
  for (const recipeId of save.knownRecipes) {
    const recipe = recipeById[recipeId];
    if (!recipe || !('itemId' in recipe.output)) continue;
    const item = itemById[recipe.output.itemId];
    if (!item) continue;
    let group: 'potion' | 'meal' | null = null;
    if (item.slot === 'consumable') {
      group = 'potion';
    } else if (item.slot === 'provision' && item.meal) {
      group = 'meal';
    }
    if (!group || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push({ itemId: item.id, place: deliverPlaces[group] });
  }
  return items;
}

/** The goods a Supply quest can ask for, with the kind of place they go to: what the open buildings make for orders. */
export function supplyOptions(save: SaveData): { good: string; placeKind: OrderKind }[] {
  return openBuildingKinds(save).flatMap((kind) => {
    const rule = supplyRules.buildings.kinds[kind];
    const goods = Object.keys(rule.makes);
    // A building serving no place kind supplies markets, which take every good.
    return goods.map((good) => ({ good, placeKind: (rule.for ?? 'market') as OrderKind }));
  });
}

/** The cart's route stops a Ride-the-route quest walks past: buildings and places, with where they stand. */
export function routeQuestStops(save: SaveData): { id: string; position: LatLng }[] {
  const route = save.supply.cart.nextRoute ?? save.supply.cart.route;
  return route.flatMap((point) => {
    if ('building' in point) {
      const building = save.supply.buildings.find((b) => b.id === point.building);
      return building ? [{ id: building.id, position: building.position }] : [];
    }
    if ('place' in point) return [{ id: point.place, position: point.position }];
    return [];
  });
}

/**
 * The objectives this player can roll in this band (objectives.csv, "Unlocked
 * from"); the network's need `network`, its switch on and opened (see
 * game/supply/unlock.ts), which the caller reads.
 */
export function availableObjectives(save: SaveData, band: QuestBand, network: boolean): QuestObjective[] {
  const all: QuestObjective[] = [
    'chapel',
    'library',
    'ruins',
    'dock',
    'lair',
    'fightEvent',
    'patrols',
    'deliver',
    'sellGoods',
    'gatherOnWay',
    'walk',
    'discover',
    'build',
    'orderStep',
    'supply',
    'rideRoute',
  ];
  return all.filter((objective) => {
    const def = objectives[objective];
    if (def.bands && !def.bands.includes(band)) return false;
    const seenKind = (kind: PlaceKind) => save.seenPlaceKinds.includes(kind) && isPlaceRevealed(save, kind);
    switch (objective) {
      case 'chapel':
      case 'library':
      case 'ruins':
      case 'dock':
      case 'lair':
        return seenKind(def.places![0]);
      case 'fightEvent':
        return isRevealed(save, 'fightEvents');
      case 'patrols':
        return isRevealed(save, 'patrols');
      case 'deliver':
        return deliverItems(save).some((item) => seenKind(item.place));
      case 'sellGoods':
        return seenKind('market');
      case 'discover':
      case 'orderStep':
        return network;
      case 'build':
        return network && save.supply.hall !== null;
      case 'supply':
        return network && supplyOptions(save).length > 0;
      case 'rideRoute':
        return network && save.supply.hall !== null && routeQuestStops(save).length >= questRules.rideRouteMinStops;
      default:
        return true;
    }
  });
}

/** Objectives that need a place on the map to point at. */
export function objectiveNeedsPlace(objective: QuestObjective | 'mark'): boolean {
  if (objective === 'mark') return true;
  if (objective === 'deliver') return true;
  return objectives[objective].places !== undefined;
}

/** How much gold a sellGoods quest asks for: the tier the player has reached. */
export function sellGoodsAmount(save: SaveData): number {
  const tier = highestUnlockedTier(save);
  return questRules.sellGoodsGold[Math.min(Math.max(tier, 1), questRules.sellGoodsGold.length) - 1];
}

/** How much of an objective a band asks for (metres for walk, 1 without an amount). */
export function objectiveAmount(objective: QuestObjective | 'mark', band: QuestBand): number {
  if (objective === 'mark') return 1;
  return questRules.amounts[objective]?.[band] ?? 1;
}
