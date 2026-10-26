import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useNotifications } from '@/hooks/useNotifications';
import { useStepTracking } from '@/hooks/useTodaySteps';
import { configureNotifications } from '@/services/notifications';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts } from '@/theme';

configureNotifications();

/** Resolves finished expeditions on launch, on return to the app, and while it is open; credits training too. */
function useExpeditionResolver() {
  useEffect(() => {
    const resolve = () => useGameStore.getState().resolveDue();
    // Guild Hall training is credited on launch and on return to the app.
    const resolveAndTrain = () => {
      resolve();
      useGameStore.getState().train();
    };
    const unsubscribeHydration = useGameStore.persist.onFinishHydration(resolveAndTrain);
    if (useGameStore.persist.hasHydrated()) resolveAndTrain();

    const timer = setInterval(resolve, 5000);
    const appState = AppState.addEventListener('change', (state) => state === 'active' && resolveAndTrain());
    return () => {
      unsubscribeHydration();
      clearInterval(timer);
      appState.remove();
    };
  }, []);
}

export default function RootLayout() {
  useExpeditionResolver();
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
        headerTitleStyle: { fontFamily: fonts.body, fontSize: 22 },
        headerBackTitleStyle: { fontFamily: fonts.body },
        contentStyle: { backgroundColor: colors.parchment },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Map', headerShown: false }} />
      <Stack.Screen name="forge" options={{ title: 'Forge' }} />
      <Stack.Screen name="alchemy" options={{ title: 'Alchemy' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="team/index" options={{ title: 'Team' }} />
      <Stack.Screen name="team/[heroId]" options={{ title: 'Character sheet' }} />
      <Stack.Screen name="expeditions" options={{ title: 'Expeditions' }} />
      <Stack.Screen name="guild" options={{ title: 'Guild Hall' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="debug" options={{ title: 'Debug' }} />
    </Stack>
  );
}
