import type { PlaceKind } from '@/content/places';
import type { QuestBand, QuestObjective } from '@/content/quests';

import type { LatLng } from '../generation/types';

export type QuestTarget = {
  placeId: string;
  /** The strange mark of a secret quest goes by its own kind. */
  kind: PlaceKind | 'mark';
  position: LatLng;
  /** Where the player was when the target was first fixed; retargets measure from here. */
  from: LatLng;
  /** When the place moves on; the quest retargets after that. */
  expiresAt: number;
};

export type Quest = {
  id: string;
  objective: QuestObjective | 'mark';
  band: QuestBand | 'secret';
  arrivedAt: number;
  expiresAt: number;
  /** First shown in the list; only what happens from then on counts. null until then. */
  acceptedAt: number | null;
  amount: number;
  progress: number;
  /** Deliver: the item to hand over. */
  itemId?: string;
  /** Walk: lifetime step count when accepted. */
  stepsAtAccept?: number;
  target: QuestTarget | null;
  doneAt: number | null;
  /** A strange mark reached while the app was closed: it resolves when the app opens. */
  reachedAt?: number;
  /** Shown in the list since it arrived or finished (badge). */
  seen: boolean;
};

export type QuestsState = {
  list: Quest[];
  /** Last rotation day whose arrivals were handed out; null before the first. */
  lastArrivalDay: number | null;
  /** Rotation day of the last reroll. */
  rerollDay: number | null;
  /** Rotation day of the last secret quest. */
  secretDay: number | null;
  /** When regular quests were completed, newest last (pruned to the secret window). */
  completions: number[];
};
