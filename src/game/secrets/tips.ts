import { secretRules } from '@/content/secrets';
import type { PlaceTipSource } from '@/content/secrets';
import type { SecretKind } from '@/content/places';

import { highestUnlockedTier } from '../dungeons/unlock';
import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import type { SecretTip } from '../types';

const HOUR_MS = 3_600_000;

/** The place id a tip's secret place goes by. */
export function secretPlaceId(tip: SecretTip): string {
  return `secret:${tip.id}`;
}

/** Whether this source run tips the player off; deterministic per source and id. */
export function rollTip(source: PlaceTipSource, sourceId: string, chance = secretRules.tips[source].chance): boolean {
  return createRng(`tip|${source}|${sourceId}`).chance(chance);
}

/** Tips still live at `now`. */
export function pruneTips(tips: SecretTip[], now: number): SecretTip[] {
  return tips.filter((tip) => tip.expiresAt > now);
}

/** The tip the player can act on for this secret, or undefined. */
export function activeTip(save: SaveData, secret: SecretKind, now: number): SecretTip | undefined {
  return save.secretTips.find(
    (tip) =>
      tip.secret === secret &&
      tip.expiresAt > now &&
      tip.foundAt <= now &&
      !(secretPlaceId(tip) in save.usedPlaces),
  );
}

/** What a tip for an already-tipped place pays, by highest unlocked tier. */
export function duplicateTipGold(save: SaveData): number {
  const tier = highestUnlockedTier(save);
  const gold = secretRules.duplicateGold[Math.min(tier, secretRules.duplicateGold.length) - 1];
  return gold;
}

export type TipOutcome = { kind: 'tip'; tip: SecretTip } | { kind: 'gold'; gold: number };

/** What a tip came from: a place or run, always tipping the same secret place, or a secret quest naming its own. */
export type FoundTip =
  | { source: PlaceTipSource; sourceId: string; anchor: LatLng }
  | { source: 'quest'; sourceId: string; anchor: LatLng; secret: SecretKind };

/** Records a tip: a new marker, or duplicate gold when the same place is already tipped. */
export function grantTip(save: SaveData, found: FoundTip, now: number): { save: SaveData; outcome: TipOutcome } {
  const secret = found.source === 'quest' ? found.secret : secretRules.tips[found.source].secret;
  const existing = activeTip(save, secret, now);
  if (existing) {
    const gold = duplicateTipGold(save);
    return { save: { ...save, gold: save.gold + gold }, outcome: { kind: 'gold', gold } };
  }
  const tip: SecretTip = {
    id: `${secret}|${found.sourceId}`,
    secret,
    source: found.source,
    sourceId: found.sourceId,
    anchor: found.anchor,
    foundAt: now,
    expiresAt: now + secretRules.lifetimeHours * HOUR_MS,
  };
  return { save: { ...save, secretTips: [...pruneTips(save.secretTips, now), tip] }, outcome: { kind: 'tip', tip } };
}

/** The marker spots a tip may sit at, seeded by its id. */
export function tipSpots(tip: Pick<SecretTip, 'id' | 'secret' | 'source' | 'anchor'>): LatLng[] {
  const rng = createRng(`tip-spot|${tip.id}`);
  const count = tip.secret === 'underwaterDungeon' ? secretRules.waterSpots : 1;
  return Array.from({ length: count }, () => {
    const distance = rng.int(...(tip.source === 'quest' ? secretRules.questDistanceMeters : secretRules.distanceMeters));
    const bearing = rng.next() * 2 * Math.PI;
    return offsetPosition(tip.anchor, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
  });
}

/** Where the tip's marker sits: the first underwater spot near water, or the single spot otherwise. */
export function tipPosition(tip: SecretTip, isNearWater?: (point: LatLng) => boolean): LatLng | null {
  if (tip.position) return tip.position;
  const spots = tipSpots(tip);
  if (tip.secret !== 'underwaterDungeon') return spots[0];
  if (!isNearWater) return null;
  return spots.find(isNearWater) ?? spots[0];
}

/** The secret places this player's tips put on the map. */
export function secretPlaces(save: SaveData, now: number, isNearWater?: (point: LatLng) => boolean): PlaceSpawn[] {
  return pruneTips(save.secretTips, now)
    .filter((tip) => tip.foundAt <= now && !(secretPlaceId(tip) in save.usedPlaces))
    .flatMap((tip) => {
      const position = tipPosition(tip, isNearWater);
      if (!position) return [];
      return [
        {
          id: secretPlaceId(tip),
          kind: tip.secret,
          group: 'secret',
          tile: 'secret',
          position,
          startsAt: tip.foundAt,
          expiresAt: tip.expiresAt,
          roll: 0,
        },
      ];
    });
}

/** The tip a secret place came from, or undefined. */
export function tipForPlace(save: SaveData, placeId: string): SecretTip | undefined {
  return save.secretTips.find((tip) => secretPlaceId(tip) === placeId);
}

/**
 * The secret place a secret quest tips off from its mark: one with no active
 * tip, picked by the quest's seed; the underwater dungeon only when one of its
 * spots is near water (so never without the water check). Null when every
 * candidate is already tipped: the quest pays duplicate gold instead.
 */
export function questTipSecret(
  save: SaveData,
  sourceId: string,
  anchor: LatLng,
  now: number,
  isNearWater?: (point: LatLng) => boolean,
): SecretKind | null {
  const secrets: SecretKind[] = ['hiddenDen', 'blackMarket', 'underwaterDungeon'];
  const open = secrets.filter((secret) => {
    if (activeTip(save, secret, now)) return false;
    if (secret !== 'underwaterDungeon') return true;
    const spots = tipSpots({ id: `${secret}|${sourceId}`, secret, source: 'quest', anchor });
    return isNearWater !== undefined && spots.some(isNearWater);
  });
  if (open.length === 0) return null;
  return open[createRng(`quest-tip|${sourceId}`).int(0, open.length - 1)];
}
