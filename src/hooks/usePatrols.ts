import { useEffect } from 'react';
import { AppState } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { placeInfo } from '@/content/places';
import { lootLabels } from '@/components/lootText';
import type { Loot } from '@/game/loot/types';
import { localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

/** What a place, patrol or activity paid, in a short line. */
export const lootText = (loot: Loot) => lootLabels(loot).join(', ');

/** While the app is open, fights whose time is up are settled this often. */
const RESOLVE_INTERVAL_MS = 5000;

/**
 * Keeps patrol fights, place fights and heists settling while the app is
 * open, and tells the map what each one paid.
 */
export function usePatrols() {
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const { kinds } = localized({ en: patrolTexts, fr: frPatrolTexts });
      for (const fight of useGameStore.getState().resolvePatrolFights()) {
        const gains = lootText(fight.rewards);
        const text = fight.won
          ? t('patrols.won', { patrol: kinds[fight.kind], gains })
          : t('patrols.lost', { patrol: kinds[fight.kind] });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
      const { fights, heists } = useGameStore.getState().resolvePlaces();
      for (const fight of fights) {
        const place = tr(placeInfo[fight.kind].name);
        const text = fight.won
          ? t('places.fightWon', { place, gains: lootText(fight.reward) })
          : t('places.fightLost', { place });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
      for (const heist of heists) {
        const name = useGameStore.getState().save.heroes.find((h) => h.id === heist.heroId)?.name ?? '';
        const text = heist.success
          ? t('places.heistWon', { name, gains: lootText(heist.reward) })
          : t('places.heistLost', { name });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
    }, RESOLVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
