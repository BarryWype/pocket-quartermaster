import { placeRules, type PlaceKind } from '@/content/places';
import { objectives, questRules, type QuestBand } from '@/content/quests';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { availableObjectives, deliverItems, mineKinds, objectiveAmount, objectiveNeedsPlace } from './unlocks';
import type { Quest, QuestTarget } from './types';

type QuestObjectiveOrMark = Quest['objective'];

/** Whether the quest points somewhere on the map. */
export function needsPlace(quest: Quest): boolean {
  return objectiveNeedsPlace(quest.objective);
}

/** The place kinds this quest's target can be. */
export function targetKinds(save: SaveData, quest: Quest): PlaceKind[] {
  if (quest.objective === 'mark') return [];
  if (quest.objective === 'deliver') {
    const place = deliverItems(save).find((item) => item.itemId === quest.itemId)?.place;
    return place ? [place] : [];
  }
  if (quest.objective === 'mine') return mineKinds(save);
  return objectives[quest.objective].places ?? [];
}

const bandOf = (quest: Quest): QuestBand => quest.band as QuestBand;

const inBandRange = (distance: number, [min, max]: [number, number]) =>
  distance <= max && (min === 0 ? distance >= 0 : distance > min);

/** The nearest live, unused place of the kinds within the band's distance from `from`. */
export function nearestInBand(
  candidates: PlaceSpawn[],
  kinds: PlaceKind[],
  from: LatLng,
  band: QuestBand,
  now: number,
  usedPlaces: Record<string, number>,
): PlaceSpawn | null {
  const range = questRules.bandMeters[band];
  const inBand = candidates.filter(
    (spawn) =>
      spawn.startsAt <= now &&
      now < spawn.expiresAt &&
      kinds.includes(spawn.kind) &&
      !(spawn.id in usedPlaces) &&
      inBandRange(distanceMeters(from, spawn.position), range),
  );
  return inBand.reduce<PlaceSpawn | null>(
    (nearest, spawn) =>
      nearest === null || distanceMeters(from, spawn.position) < distanceMeters(from, nearest.position)
        ? spawn
        : nearest,
    null,
  );
}

/** One objective's target from the player's position, with the item a deliver needs. */
function findTarget(
  save: SaveData,
  quest: Quest,
  objective: QuestObjectiveOrMark,
  candidates: PlaceSpawn[],
  from: LatLng,
  now: number,
  rng: Rng,
): { target: QuestTarget | null; itemId?: string } {
  if (!objectiveNeedsPlace(objective)) return { target: null };
  let itemId = objective === quest.objective ? quest.itemId : undefined;
  if (objective === 'deliver' && itemId === undefined) {
    const options = deliverItems(save).filter((item) => save.seenPlaceKinds.includes(item.place));
    const pick = options[rng.int(0, options.length - 1)];
    if (!pick) return { target: null };
    itemId = pick.itemId;
  }
  const kinds = targetKinds(save, { ...quest, objective, ...(itemId ? { itemId } : {}) });
  const spawn = nearestInBand(candidates, kinds, from, bandOf(quest), now, save.usedPlaces);
  if (!spawn) return { target: null, ...(itemId ? { itemId } : {}) };
  return {
    target: {
      placeId: spawn.id,
      kind: spawn.kind,
      position: spawn.position,
      from,
      expiresAt: spawn.expiresAt,
    },
    ...(itemId ? { itemId } : {}),
  };
}

/** The other objectives to try when a quest's own pick has no target, seeded by its id. */
function swapOrder(save: SaveData, quest: Quest): QuestObjectiveOrMark[] {
  const rng = createRng(`quest-swap|${quest.id}`);
  let remaining = availableObjectives(save, bandOf(quest)).filter((o) => o !== quest.objective);
  const order: QuestObjectiveOrMark[] = [];
  while (remaining.length > 0) {
    const pick = rng.weighted(remaining, (o) => objectives[o].weight);
    order.push(pick);
    remaining = remaining.filter((o) => o !== pick);
  }
  return order;
}

/** A secret quest's strange mark: a seeded distance and bearing from the player. */
function markTarget(quest: Quest, player: LatLng): QuestTarget {
  const rng = createRng(`mark|${quest.id}`);
  const distance = rng.int(...questRules.secret.markMeters);
  const bearing = rng.next() * 2 * Math.PI;
  return {
    placeId: `mark:${quest.id}`,
    kind: 'mark',
    position: offsetPosition(player, Math.cos(bearing) * distance, Math.sin(bearing) * distance),
    from: player,
    expiresAt: quest.expiresAt,
  };
}

/**
 * Shows the unaccepted quests: each gets its first target in band, or swaps to
 * another objective when nothing is in range. A secret quest's target is its
 * strange mark, close by.
 */
export function acceptQuests(save: SaveData, candidates: PlaceSpawn[], player: LatLng, now: number): SaveData {
  const list = save.quests.list.map((quest) => {
    if (quest.acceptedAt !== null) return quest;
    const base: Quest = {
      ...quest,
      acceptedAt: now,
      ...(quest.objective === 'walk' ? { stepsAtAccept: save.stepsTotal } : {}),
    };
    if (quest.objective === 'mark') return { ...base, target: markTarget(quest, player) };
    const own = findTarget(save, quest, quest.objective, candidates, player, now, createRng(`quest|${quest.id}`));
    if (own.target || !objectiveNeedsPlace(quest.objective)) {
      return { ...base, target: own.target, itemId: own.itemId ?? quest.itemId };
    }
    for (const objective of swapOrder(save, quest)) {
      const attempt = findTarget(save, quest, objective, candidates, player, now, createRng(`quest-swap|${quest.id}`));
      if (attempt.target || !objectiveNeedsPlace(objective)) {
        return {
          ...base,
          objective,
          amount: objectiveAmount(objective, bandOf(quest)),
          progress: 0,
          target: attempt.target,
          itemId: attempt.itemId,
        };
      }
    }
    return base;
  });
  return { ...save, quests: { ...save.quests, list } };
}

/**
 * Re-points accepted quests whose target moved on or was used up: the nearest
 * replacement of the same kind, measured from where the target was fixed. None
 * in band: the quest waits (`target` null) until the next call.
 */
export function retargetQuests(save: SaveData, candidates: PlaceSpawn[], now: number): SaveData {
  const list = save.quests.list.map((quest) => {
    const { target } = quest;
    if (quest.acceptedAt === null || quest.doneAt !== null || !target || target.kind === 'mark') return quest;
    if (target.expiresAt > now && !(target.placeId in save.usedPlaces)) return quest;
    const spawn = nearestInBand(candidates, [target.kind], target.from, bandOf(quest), now, save.usedPlaces);
    return {
      ...quest,
      target: spawn
        ? { ...target, placeId: spawn.id, position: spawn.position, expiresAt: spawn.expiresAt }
        : null,
    };
  });
  return { ...save, quests: { ...save.quests, list } };
}

/** Straight-line metres to the quest's target, or null while it waits for one. */
export function targetDistance(quest: Quest, player: LatLng): number | null {
  return quest.target ? distanceMeters(player, quest.target.position) : null;
}

/** The compass arrow from one position to another. */
export function compassDirection(from: LatLng, to: LatLng): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const north = to.latitude - from.latitude;
  const east = (to.longitude - from.longitude) * Math.cos(toRad(from.latitude));
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  const index = Math.round(((bearing + 360) % 360) / 45) % 8;
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[index];
}

/** Whether the player stands close enough to a place to act there. */
export const withinInteraction = (player: LatLng, place: PlaceSpawn) =>
  distanceMeters(player, place.position) <= placeRules.interactionMeters;
