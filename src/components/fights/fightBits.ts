import type { LatLng } from '@/game/generation/types';
import { timeLeftShare } from '@/game/supply/buildings';
import { t } from '@/i18n';
import { useWorldStore } from '@/store/worldStore';

const HOUR = 3_600_000;

/** A life's ring: the share left, urgent in its last fifth (at most its last hour). */
export function ringTime(startsAt: number, endsAt: number, now: number): { left: number; last: boolean } {
  return { left: timeLeftShare(startsAt, endsAt, now), last: endsAt - now <= Math.min(HOUR, (endsAt - startsAt) / 5) };
}

/** The walk: centres the map on where the fight is now. */
export const walkToward = (position: LatLng) => () =>
  useWorldStore.getState().set({ focusPlace: { latitude: position.latitude, longitude: position.longitude } });

/** A fight rule's problem before a party is picked, in the main button's own words. */
export function fightBlocked(problem: string): string {
  switch (problem) {
    case 'gone':
    case 'expired':
      return t('fightSheet.blocked.gone');
    case 'used':
      return t('fightSheet.blocked.used');
    case 'noSigil':
      return t('fightSheet.blocked.noSigil');
    default:
      return t('fightSheet.blocked.noHeroes');
  }
}
