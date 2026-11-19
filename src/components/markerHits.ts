import type { MapRef } from '@maplibre/maplibre-react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { placeInfo } from '@/content/places';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { metersPerPoint, overlapping } from '@/game/map/overlap';
import { isPatrolKind, isTravellerKind, patrolPositionAt, type PatrolSpawn } from '@/game/patrols/generate';
import type { PlaceSpawn } from '@/game/places/generate';
import { sanctumById, type SanctumSpawn } from '@/game/sanctums/sanctums';
import type { TavernSpawn } from '@/game/taverns/taverns';
import { localized, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels, type ChooserEntry } from '@/store/mapPanelsStore';

import { mapSheetStatus } from './MapSheet';
import { patrolIcons } from './PatrolMarker';

/** A marker the chooser can list: where it is (patrols move), its icon and name, when it leaves, and its sheet. */
export type MarkerHit = { id: string; at: (time: number) => LatLng; emoji: string; name: string; expiresAt?: number; open: () => void };

type Lists = { sanctums: SanctumSpawn[]; taverns: TavernSpawn[]; places: PlaceSpawn[]; secrets: PlaceSpawn[]; patrols: PatrolSpawn[] };

/** Every marker a tap can open, with its own sheet's opener: what the chooser picks between. */
export function markerHits({ sanctums, taverns, places, secrets, patrols }: Lists, player: () => LatLng | null): MarkerHit[] {
  const panels = () => useMapPanels.getState();
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });
  const openPlace = (place: PlaceSpawn) => () => {
    panels().openPlace(place);
    const at = player();
    if (at) useGameStore.getState().visitPlace(place, at);
  };
  return [
    ...sanctums.map((spawn) => {
      const sanctum = sanctumById[spawn.sanctumId];
      return { id: spawn.id, at: () => spawn.position, emoji: sanctum.emoji, name: tr(sanctum.name), expiresAt: spawn.expiresAt, open: () => panels().openSanctum(spawn) };
    }),
    ...taverns.map((tavern) => ({ id: tavern.id, at: () => tavern.position, emoji: '🍺', name: tavern.name, expiresAt: tavern.expiresAt, open: () => panels().openTavern(tavern) })),
    ...[...places, ...secrets].map((place) => ({
      id: place.id,
      at: () => place.position,
      emoji: placeInfo[place.kind].emoji,
      name: tr(placeInfo[place.kind].name),
      expiresAt: place.expiresAt,
      open: openPlace(place),
    })),
    ...patrols.map((spawn) => ({
      id: spawn.id,
      at: (time: number) => patrolPositionAt(spawn, time),
      emoji: patrolIcons[spawn.kind],
      name: isPatrolKind(spawn.kind) ? texts.kinds[spawn.kind] : isTravellerKind(spawn.kind) ? texts.travellers[spawn.kind].name : '',
      expiresAt: spawn.endsAt,
      open: () => panels().openPatrol(spawn),
    })),
  ];
}

/**
 * A tap on marker `id`: when it lands on others too, opens the chooser listing
 * them (anchored at the tapped marker once the map says where that is on
 * screen) and returns true; a lone marker returns false and opens as before.
 */
export function offerChooser(id: string, hits: MarkerHit[], player: LatLng | null, zoom: number, map: MapRef | null): boolean {
  const now = Date.now();
  const tapped = hits.find((hit) => hit.id === id);
  if (!tapped || !player) return false;
  const where = tapped.at(now);
  const over = overlapping({ id, position: where }, hits.map((hit) => ({ id: hit.id, position: hit.at(now) })), metersPerPoint(where.latitude, zoom));
  if (over.length < 2) return false;
  const entries: ChooserEntry[] = over.map((marker) => {
    const hit = hits.find((entry) => entry.id === marker.id)!;
    return {
      id: hit.id,
      emoji: hit.emoji,
      name: hit.name,
      status: mapSheetStatus({ distance: distanceMeters(player, marker.position), range: 0, expiresAt: hit.expiresAt, now }),
      open: hit.open,
    };
  });
  const open = (anchor: { x: number; y: number } | null) => useMapPanels.getState().openChooser({ anchor, entries });
  if (!map) open(null);
  else map.project([where.longitude, where.latitude]).then(([x, y]) => open({ x, y }), () => open(null));
  return true;
}
