import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan, useNotifications } from '@/hooks/useNotifications';
import { useStepTracking } from '@/hooks/useTodaySteps';
import { t } from '@/i18n';
import { configureChannels, configureNotifications } from '@/services/notifications';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts } from '@/theme';

configureNotifications();

/**
 * Drops expired maps, lures and Sanctums and credits Guild Hall training on
 * launch and on return to the app. Finished expeditions wait for the player
 * to collect their loot on the Quests page.
 */
function useUpkeep() {
  useEffect(() => {
    const upkeep = () => {
      useGameStore.getState().prune();
      useGameStore.getState().train();
    };
    const unsubscribeHydration = useGameStore.persist.onFinishHydration(upkeep);
    if (useGameStore.persist.hasHydrated()) upkeep();
    const appState = AppState.addEventListener('change', (state) => state === 'active' && upkeep());
    return () => {
      unsubscribeHydration();
      appState.remove();
    };
  }, []);
}

export default function RootLayout() {
  const locale = useLanguage();
  useEffect(() => {
    configureChannels();
    syncPlan();
  }, [locale]);
  useUpkeep();
  useStepTracking();
  useNotifications();
  const [fontsLoaded, fontError] = useFonts({
    [fonts.body]: require('../../assets/fonts/FantaisieArtistique.ttf'),
  });

  // On a load error, fall back to the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.wood },
        headerTintColor: colors.parchment,
        headerTitleStyle: { fontFamily: fonts.body, fontSize: 26 },
        headerBackTitleStyle: { fontFamily: fonts.body },
        contentStyle: { backgroundColor: colors.parchment },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('screens.map'), headerShown: false }} />
      <Stack.Screen name="forge" options={{ title: t('screens.forge') }} />
      <Stack.Screen name="provisions" options={{ title: t('screens.provisions') }} />
      <Stack.Screen name="inventory" options={{ title: t('screens.inventory') }} />
      <Stack.Screen name="team/index" options={{ title: t('screens.team') }} />
      <Stack.Screen name="team/[heroId]" options={{ title: t('screens.hero') }} />
      <Stack.Screen name="quests" options={{ title: t('screens.quests') }} />
      <Stack.Screen name="guild" options={{ title: t('screens.guild') }} />
      <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
      <Stack.Screen name="debug" options={{ title: t('screens.debug') }} />
    </Stack>
  );
}
