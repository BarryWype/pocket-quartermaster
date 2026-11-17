import { materialById } from '@/content/lookup';
import { placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { Building, BuildingKind } from './types';
import type { PlaceSpawn } from '../places/generate';
import { siteQuality } from './sites';
import type { TextKey } from '@/i18n';

/** Each building kind's name, and its main good's emoji for the map. */
export const buildingNameKey: Record<BuildingKind, TextKey> = {
  farm: 'supply.building.farmName',
  quarry: 'supply.building.quarryName',
  herbGarden: 'supply.building.herbGardenName',
  lumberCamp: 'supply.building.lumberCampName',
  huntingCamp: 'supply.building.huntingCampName',
  copperMine: 'supply.building.copperMineName',
  ironMine: 'supply.building.ironMineName',
  charcoalKiln: 'supply.building.charcoalKilnName',
};
export const buildingEmoji: Record<BuildingKind, string> = {
  farm: '🌾',
  quarry: '🪨',
  herbGarden: '🌿',
  lumberCamp: '🪵',
  huntingCamp: '🏹',
  copperMine: materialById.copper.emoji,
  ironMine: materialById.iron.emoji,
  charcoalKiln: materialById.coal.emoji,
};

/** Whether a building kind is open: the network opens at tier 2, so a save unlocked earlier builds as at tier 2. */
const isKindOpen = (save: SaveData, kind: BuildingKind) =>
  supplyRules.buildings.kinds[kind].opensAtTier <= Math.max(2, highestUnlockedTier(save));

/** The building kinds open at the player's tier. */
export const openBuildingKinds = (save: SaveData): BuildingKind[] =>
  (Object.keys(supplyRules.buildings.kinds) as BuildingKind[]).filter((kind) => isKindOpen(save, kind));

const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;

export type BuildProblem = 'notOpen' | 'noHall' | 'notDiscovered' | 'taken' | 'tooFarFromHall' | 'full' | 'notHere' | 'cost' | null;

/** How many buildings the player may hold at once, and how far from the hall they may stand. */
export function buildingReach(save: SaveData): { count: number; meters: number } {
  return supplyRules.buildings.limits[highestUnlockedTier(save)];
}

/** The ring's steps: the share of life left moves only when this many steps change, so markers stay memoised between them. */
export const TIME_LEFT_STEPS = 48;

/** Whether the building's last day has come: within `lastDayHours` of its expiry. */
export function isLastDay(expiresAt: number, now: number): boolean {
  return expiresAt - now <= supplyRules.buildings.lastDayHours * HOUR;
}

/** The share of a life left, rounded to the ring's steps so a marker only re-renders when its ring moves. */
export function timeLeftShare(startsAt: number, expiresAt: number, now: number): number {
  const total = expiresAt - startsAt;
  const left = total <= 0 ? 0 : Math.min(1, Math.max(0, (expiresAt - now) / total));
  return Math.round(left * TIME_LEFT_STEPS) / TIME_LEFT_STEPS;
}

/** Why a building of this kind cannot be raised on the site now, or null. */
export function buildProblem(save: SaveData, site: PlaceSpawn, kind: BuildingKind, player: LatLng, now: number): BuildProblem {
  if (!isKindOpen(save, kind)) return 'notOpen';
  if (!save.supply.hall) return 'noHall';
  if (!(site.id in save.supply.discovered)) return 'notDiscovered';
  if (save.supply.buildings.some((b) => b.siteId === site.id)) return 'taken';
  const reach = buildingReach(save);
  if (distanceMeters(tileCenter(save.supply.hall.cell), site.position) > reach.meters) return 'tooFarFromHall';
  if (save.supply.buildings.length >= reach.count) return 'full';
  if (distanceMeters(player, site.position) > placeRules.interactionMeters) return 'notHere';
  const { cost } = supplyRules.buildings;
  if (save.gold < cost.gold || !hasMaterials(save.materials, cost.materials)) return 'cost';
  return null;
}

/**
 * Raises a building on a discovered site: pays the cost, takes the site's
 * quality and placed position, and resets the site's life to six days from now.
 * `free` (debug) skips only standing elsewhere and the cost.
 */
export function build(save: SaveData, site: PlaceSpawn, kind: BuildingKind, player: LatLng, now: number, { free = false } = {}): SaveData {
  const problem = buildProblem(save, site, kind, player, now);
  if (problem !== null && !(free && (problem === 'notHere' || problem === 'cost'))) {
    throw new Error(`Cannot build a ${kind} on ${site.id}: ${problem}`);
  }
  const { cost } = supplyRules.buildings;
  // A free (debug) build skips the cost entirely, not just the check.
  const paid: SaveData = free
    ? save
    : {
        ...save,
        gold: save.gold - cost.gold,
        materials: removeMaterials(save.materials, cost.materials),
      };
  const building: Building = {
    id: `b${save.supply.nextId}`,
    kind,
    siteId: site.id,
    position: site.position,
    quality: siteQuality(site),
    builtAt: now,
    expiresAt: now + supplyRules.buildings.lifeDays * DAY,
    heroId: null,
    postedAt: null,
    stock: {},
    progress: 0,
    made: 0,
    settledAt: now,
    inspectedUntil: 0,
    closedUntil: 0,
  };
  return {
    ...paid,
    supply: { ...paid.supply, buildings: [...paid.supply.buildings, building], nextId: paid.supply.nextId + 1 },
  };
}

/** The cell a building stands on, for danger, ambushes and raids. */
export const buildingCell = (building: Building): string => cellAt(building.position);
