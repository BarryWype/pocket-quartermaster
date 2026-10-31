// Defines the background location task; it must run when the bundle loads, also for a background launch.
import '@/services/walkTracking';

import { useFonts } from 'expo-font';
import { Stack, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { RecipeToast } from '@/components/RecipeToast';
import { SecretToast } from '@/components/SecretToast';
import { TipBar } from '@/components/TipBar';
import { useAutoGather } from '@/hooks/useAutoGather';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan, useNotifications } from '@/hooks/useNotifications';
import { usePatrols } from '@/hooks/usePatrols';
import { useStepTracking } from '@/hooks/useTodaySteps';
import { t } from '@/i18n';
import { configureChannels, configureNotifications } from '@/services/notifications';
import { setNavigationStack } from '@/services/navigation';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts } from '@/theme';

configureNotifications();

/**
 * Drops expired maps, lures and Sanctums, settles due patrol and place fights and heists, and
 * credits Guild Hall training on launch and on return to the app. Finished
 * expeditions wait for the player to collect their loot on the Expeditions page.
 */
function useUpkeep() {
  useEffect(() => {
    const upkeep = () => {
      useGameStore.getState().prune();
      useGameStore.getState().resolvePatrolFights();
      useGameStore.getState().resolvePlaces();
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
  // The shared navigation helper reads the stack from here, so taps can't stack screens.
  // The names arrive as a new array on every render of the root layout: only a
  // real change is passed on, so a re-render (or a report from before a
  // navigation finished) never overwrites what the helper holds.
  const navigationState = useRootNavigationState();
  const lastRouteNames = useRef<string[] | null>(null);
  useEffect(() => {
    const routeNames = navigationState?.routes.map((route) => route.name) ?? [];
    const last = lastRouteNames.current;
    const unchanged = last !== null && last.length === routeNames.length && last.every((name, i) => name === routeNames[i]);
    if (unchanged) return;
    lastRouteNames.current = routeNames;
    setNavigationStack(routeNames);
  }, [navigationState]);
  useEffect(() => {
    configureChannels();
    syncPlan();
  }, [locale]);
  useUpkeep();
  useStepTracking();
  useNotifications();
  useAutoGather();
  usePatrols();
  const [fontsLoaded, fontError] = useFonts({
    [fonts.body]: require('../../assets/fonts/FantaisieArtistique.ttf'),
  });

  // On a load error, fall back to the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={styles.root}>
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
        <Stack.Screen name="infuse" options={{ title: t('screens.infuse') }} />
        <Stack.Screen name="provisions" options={{ title: t('screens.provisions') }} />
        <Stack.Screen name="inventory" options={{ title: t('screens.inventory') }} />
        <Stack.Screen name="team/index" options={{ title: t('screens.team') }} />
        <Stack.Screen name="team/[heroId]" options={{ title: t('screens.hero') }} />
        <Stack.Screen name="team/classes" options={{ title: t('classes.title') }} />
        <Stack.Screen name="expeditions" options={{ title: t('screens.expeditions') }} />
        <Stack.Screen name="quests" options={{ title: t('screens.quests') }} />
        <Stack.Screen name="guild" options={{ title: t('screens.guild') }} />
        <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
        <Stack.Screen name="tips" options={{ title: t('screens.tips') }} />
        <Stack.Screen name="debug" options={{ title: t('screens.debug') }} />
      </Stack>
      <RecipeToast />
      <SecretToast />
      <TipBar />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
