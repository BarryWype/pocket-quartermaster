import { placeRules, type PlaceKind } from '@/content/places';
import { deliverPlaces, objectives, questRules, type QuestBand, type QuestObjective } from '@/content/quests';
import { itemById, recipeById } from '@/content/lookup';

import { pickaxeTier } from '../gathering/gathering';
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
    let group: 'potion' | 'meal' | 'kit' | null = null;
    if (item.slot === 'consumable') {
      group = item.kit || item.protectsAgainst ? 'kit' : item.charm ? null : 'potion';
    } else if (item.slot === 'provision' && item.meal) {
      group = 'meal';
    }
    if (!group || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push({ itemId: item.id, place: deliverPlaces[group] });
  }
  return items;
}

/** The mine places at the player's pickaxe tier: wood and hide, plus the ore they can mine. */
export function mineKinds(save: SaveData): PlaceKind[] {
  const tier = Math.min(pickaxeTier(save), 4);
  const tiers = placeRules.mineTiers as Partial<Record<PlaceKind, number>>;
  const ore = (Object.keys(tiers) as PlaceKind[]).find((kind) => tiers[kind] === tier);
  return ore ? ['sawmill', 'huntingLodge', ore] : ['sawmill', 'huntingLodge'];
}

/** The objectives this player can roll in this band (objectives.csv, "Unlocked from"). */
export function availableObjectives(save: SaveData, band: QuestBand): QuestObjective[] {
  const all: QuestObjective[] = [
    'chapel',
    'library',
    'ruins',
    'dock',
    'lair',
    'fightEvent',
    'patrols',
    'deliver',
    'mine',
    'collector',
    'gatherOnWay',
    'walk',
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
      case 'mine':
        return mineKinds(save).some(seenKind);
      case 'collector':
        return seenKind('market') && Object.values(save.valuables).some((count) => count > 0);
      default:
        return true;
    }
  });
}

/** Objectives that need a place on the map to point at. */
export function objectiveNeedsPlace(objective: QuestObjective | 'mark'): boolean {
  if (objective === 'mark') return true;
  if (objective === 'deliver' || objective === 'mine') return true;
  return objectives[objective].places !== undefined;
}

/** How much of an objective a band asks for (metres for walk, 1 without an amount). */
export function objectiveAmount(objective: QuestObjective | 'mark', band: QuestBand): number {
  if (objective === 'mark') return 1;
  return questRules.amounts[objective]?.[band] ?? 1;
}
