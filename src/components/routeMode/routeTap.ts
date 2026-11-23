import type { PlaceKind } from '@/content/places';
import { buildingReach } from '@/game/supply/buildings';
import { whyNotStop } from '@/game/supply/planner';
import type { LatLng } from '@/game/generation/types';
import { formatDistance, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';

/**
 * What the route bar says when a dimmed marker is tapped in route mode: why
 * `name` can't be a stop, or null for the general rule. Reads the save at tap
 * time, so the markers needn't re-render for it.
 */
export function routeTapNote(target: { kind: 'building'; position: LatLng } | { kind: PlaceKind; id: string; position: LatLng }, name: string): string | null {
  const save = useGameStore.getState().save;
  const reason = whyNotStop(save, target, Date.now());
  switch (reason) {
    case 'site':
      return t('routeTap.site');
    case 'notNetwork':
      return t('routeTap.notNetwork', { name });
    case 'tooFar':
      return t('routeTap.tooFar', { name, distance: formatDistance(buildingReach(save).meters) });
    case 'undiscovered':
      return t('routeTap.undiscovered', { name });
    case 'noOrder':
      return t('routeTap.noOrder', { name });
    default:
      return null;
  }
}
