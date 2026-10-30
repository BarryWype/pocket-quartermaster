import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recipeById, recipeOutput } from '@/content/lookup';
import { newPartRecipes } from '@/game/crafting/partRecipes';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Text } from './Text';

/** "New recipe: …" over any screen when a found part unlocks recipes. */
export function RecipeToast() {
  const insets = useSafeAreaInsets();
  const [names, setNames] = useState<string | null>(null);

  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        // Loading the save is not a find.
        if (!useGameStore.persist.hasHydrated()) return;
        const fresh = newPartRecipes(previous.save, state.save);
        if (fresh.length > 0) setNames(fresh.map((id) => tr(recipeOutput(recipeById[id]).name)).join(', '));
      }),
    [],
  );

  useEffect(() => {
    if (!names) return;
    const timer = setTimeout(() => setNames(null), 4000);
    return () => clearTimeout(timer);
  }, [names]);

  if (!names) return null;
  return (
    <View pointerEvents="none" style={[styles.wrapper, { top: insets.top + 8 }]}>
      <Text style={styles.banner}>{t('crafting.newRecipe', { names })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  banner: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.ink,
    color: colors.parchment,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 18,
  },
});
