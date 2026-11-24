import type { PlaceKind } from '@/content/places';
import { buildingReach } from '@/game/supply/buildings';
import { plannerStops, whyNotStop } from '@/game/supply/planner';
import { toggleStop } from '@/game/supply/routeEdit';
import type { RoutePoint } from '@/game/supply/types';
import type { LatLng } from '@/game/generation/types';
import { formatDistance, t } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

/** A tapped stop goes on the draft as the next stop, or off it. */
export function toggleRouteStop(point: RoutePoint) {
  feel('press');
  const mode = useMapPanels.getState().routeMode;
  if (mode) useMapPanels.getState().setRouteDraft(toggleStop(mode.draft, point));
}

/** Why `name` can't be a stop, or null for the general rule. */
function notStopText(reason: ReturnType<typeof whyNotStop>, name: string): string | null {
  switch (reason) {
    case 'site':
      return t('routeTap.site');
    case 'notNetwork':
      return t('routeTap.notNetwork', { name });
    case 'tooFar':
      return t('routeTap.tooFar', { name, distance: formatDistance(buildingReach(useGameStore.getState().save).meters) });
    case 'undiscovered':
      return t('routeTap.undiscovered', { name });
    case 'noOrder':
      return t('routeTap.noOrder', { name });
    default:
      return null;
  }
}

/**
 * A tap on a marker route mode dimmed. A marker that is a stop (its pin sits on
 * the same spot and may lie under it) goes on or off the draft like its pin;
 * any other says on the route bar why it can't be a stop. Reads the save at tap
 * time, so the markers needn't re-render for it.
 */
export function routeTap(target: { kind: 'building' | PlaceKind; id: string; position: LatLng }, name: string) {
  const save = useGameStore.getState().save;
  const now = Date.now();
  const stop = plannerStops(save, now).find((s) => (s.kind === 'building' ? s.building.id : s.place.id) === target.id);
  if (stop) {
    toggleRouteStop(stop.point);
    return;
  }
  feel('press');
  useMapPanels.getState().setRouteTapNote(notStopText(whyNotStop(save, target, now), name) ?? t('routeTap.generic'));
}
