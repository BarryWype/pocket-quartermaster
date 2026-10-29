import { useEffect } from 'react';
import { AppState } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import { gearName, itemById, recipeById, recipeOutput } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { rewardMaterials } from '@/game/patrols/fight';
import type { PlaceReward } from '@/game/types';
import { localized, t, tr } from '@/i18n';
import { materialsText } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

/** What a place paid, in a short line: gold, materials, items, gear, a blueprint, key fragments. */
export function placeRewardText(reward: PlaceReward) {
  return [
    reward.gold > 0 ? t('patrols.goldGain', { gold: reward.gold }) : null,
    materialsText(reward.materials) || null,
    ...reward.consumables.map((c) => `${itemById[c.itemId].emoji} ×${c.amount}`),
    ...reward.gear.map((g) => `${itemById[g.itemId].emoji} ${gearName(g)}`),
    reward.recipeId ? t('places.recipe', { name: tr(recipeOutput(recipeById[reward.recipeId]).name) }) : null,
    reward.keyFragments > 0 ? t('places.keyFragments', { count: reward.keyFragments }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

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
        const materials = materialsText(rewardMaterials(fight.rewards));
        const gains = [fight.rewards.gold > 0 ? t('patrols.goldGain', { gold: fight.rewards.gold }) : null, materials || null]
          .filter(Boolean)
          .join(', ');
        const text = fight.won
          ? t('patrols.won', { patrol: kinds[fight.kind], gains })
          : t('patrols.lost', { patrol: kinds[fight.kind] });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
      const { fights, heists } = useGameStore.getState().resolvePlaces();
      for (const fight of fights) {
        const place = tr(placeInfo[fight.kind].name);
        const text = fight.won
          ? t('places.fightWon', { place, gains: placeRewardText(fight.reward) })
          : t('places.fightLost', { place });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
      for (const heist of heists) {
        const name = useGameStore.getState().save.heroes.find((h) => h.id === heist.heroId)?.name ?? '';
        const text = heist.success
          ? t('places.heistWon', { name, gains: placeRewardText(heist.reward) })
          : t('places.heistLost', { name });
        useWorldStore.getState().set({ patrolMessage: { text, at: Date.now() } });
      }
    }, RESOLVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
