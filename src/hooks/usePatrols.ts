import { useEffect } from 'react';
import { AppState } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { rewardMaterials } from '@/game/patrols/fight';
import { localized, t } from '@/i18n';
import { materialsText } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

/** While the app is open, fights whose time is up are settled this often. */
const RESOLVE_INTERVAL_MS = 5000;

/**
 * Keeps patrol fights settling while the app is open, and tells the map what
 * each one paid: gold and materials on a win, a few hurt heroes on a loss.
 */
export function usePatrols() {
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const { kinds } = localized({ en: patrolTexts, fr: frPatrolTexts });
      for (const fight of useGameStore.getState().resolvePatrolFights()) {
        const materials = materialsText(rewardMaterials(fight.rewards));
        const gains = [fight.rewards.gold > 0 ? t('patrols.goldGain', { gold: fight.rewards.gold }) : null, materials || null]
          .filter(Boolean)
          .join(', ');
        const text = fight.won
          ? t('patrols.won', { patrol: kinds[fight.kind], gains })
          : t('patrols.lost', { patrol: kinds[fight.kind] });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
    }, RESOLVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
