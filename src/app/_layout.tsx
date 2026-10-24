import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Text } from 'react-native';

import { useStepTracking } from '@/hooks/useTodaySteps';
import { configureNotifications } from '@/services/notifications';
import { useGameStore } from '@/store/gameStore';

configureNotifications();

function tabIcon(emoji: string) {
  return () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

/** Resolves finished expeditions on launch, on return to the app, and while it is open. */
function useExpeditionResolver() {
  useEffect(() => {
    const resolve = () => useGameStore.getState().resolveDue();
    const unsubscribeHydration = useGameStore.persist.onFinishHydration(resolve);
    if (useGameStore.persist.hasHydrated()) resolve();

    const timer = setInterval(resolve, 5000);
    const appState = AppState.addEventListener('change', (state) => state === 'active' && resolve());
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
  const unseenReports = useGameStore((state) => state.save.reports.filter((r) => !r.seen).length);

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: tabIcon('🗺️') }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: tabIcon('🎒') }} />
      <Tabs.Screen name="forge" options={{ title: 'Forge', tabBarIcon: tabIcon('⚒️') }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tabIcon('🛡️') }} />
      <Tabs.Screen
        name="expeditions"
        options={{
          title: 'Expeditions',
          tabBarIcon: tabIcon('🧭'),
          tabBarBadge: unseenReports > 0 ? unseenReports : undefined,
        }}
      />
      <Tabs.Screen
        name="debug"
        options={{ title: 'Debug', tabBarIcon: tabIcon('🐞'), href: __DEV__ ? undefined : null }}
      />
    </Tabs>
  );
}
