// Defines the background location task; it must run when the bundle loads, also for a background launch.
import '@/services/walkTracking';

import { Alegreya_500Medium, Alegreya_700Bold } from '@expo-google-fonts/alegreya';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { RecipeToast } from '@/components/RecipeToast';
import { GameIcon } from '@/components/GameIcon';
import { ScreenHeader } from '@/components/ui';
import { SecretToast } from '@/components/SecretToast';
import { Text } from '@/components/Text';
import { TipBar } from '@/components/TipBar';
import { useAutoGather } from '@/hooks/useAutoGather';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan, useNotifications } from '@/hooks/useNotifications';
import { usePatrols } from '@/hooks/usePatrols';
import { useStepTracking } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { configureChannels, configureNotifications } from '@/services/notifications';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

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
    [fonts.serif]: Alegreya_500Medium,
    [fonts.serifBold]: Alegreya_700Bold,
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
        <Stack.Screen name="index" dangerouslySingular options={{ title: t('screens.map'), headerShown: false }} />
        <Stack.Screen name="forge" dangerouslySingular options={{ title: t('screens.forge'), header: () => <ScreenHeader title={t('screens.forge')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="infuse" dangerouslySingular options={{ title: t('screens.infuse'), header: () => <ScreenHeader title={t('screens.infuse')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="provisions" dangerouslySingular options={{ title: t('screens.provisions'), header: () => <ScreenHeader title={t('screens.provisions')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="inventory" dangerouslySingular options={{ title: t('screens.inventory'), header: () => <ScreenHeader title={t('screens.storeroom')} right={<HeaderGold />} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="team/index" dangerouslySingular options={{ title: t('screens.team'), header: () => <ScreenHeader title={t('screens.barracks')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="team/[heroId]" dangerouslySingular options={{ title: t('screens.hero') }} />
        <Stack.Screen name="team/classes" dangerouslySingular options={{ title: t('classes.title') }} />
        <Stack.Screen name="expeditions" dangerouslySingular options={{ title: t('screens.expeditions') }} />
        <Stack.Screen name="quests" dangerouslySingular options={{ title: t('screens.quests'), header: () => <ScreenHeader title={t('screens.quests')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="guild" dangerouslySingular options={{ title: t('screens.guild'), header: () => <ScreenHeader title={t('screens.guild')} right={<HeaderGold />} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="settings" dangerouslySingular options={{ title: t('screens.settings'), header: () => <ScreenHeader title={t('screens.settings')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="settings/credits" dangerouslySingular options={{ title: t('settings.credits'), header: () => <ScreenHeader title={t('settings.credits')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="tips" dangerouslySingular options={{ title: t('screens.tips'), header: () => <ScreenHeader title={t('settings.fieldNotes')} />, contentStyle: { backgroundColor: ui.woodDark } }} />
        <Stack.Screen name="debug" dangerouslySingular options={{ title: t('screens.debug') }} />
      </Stack>
      <RecipeToast />
      <SecretToast />
      <TipBar />
    </View>
  );
}

/** The gold count pinned to a screen header's right corner. */
function HeaderGold() {
  const gold = useGameStore((state) => state.save.gold);
  return (
    <View style={styles.gold} accessibilityLabel={t('common.gold')}>
      <GameIcon emoji="🪙" size={14} />
      <Text style={styles.goldAmount}>{formatNumber(gold)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gold: { minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  goldAmount: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.gold },
});
