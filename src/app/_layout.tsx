// Defines the background location task; it must run when the bundle loads, also for a background launch.
import '@/services/walkTracking';

import { Alegreya_500Medium, Alegreya_700Bold } from '@expo-google-fonts/alegreya';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import { memo, useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IslandMenu, ISLAND_HEIGHT } from '@/components/IslandMenu';
import { RecipeToast } from '@/components/RecipeToast';
import { Price } from '@/components/Price';
import { ScreenHeader } from '@/components/ui';
import { SecretToast } from '@/components/SecretToast';
import { TipBar } from '@/components/TipBar';
import { useAutoGather } from '@/hooks/useAutoGather';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan, useNotifications } from '@/hooks/useNotifications';
import { usePatrols } from '@/hooks/usePatrols';
import { useStepTracking } from '@/hooks/useTodaySteps';
import { t } from '@/i18n';
import { configureChannels, configureNotifications } from '@/services/notifications';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

configureNotifications();

/**
 * The app's background services: upkeep, step tracking, notifications,
 * auto-gather and patrol alerts. They render nothing and mount once, so a
 * re-render of the layout (a language change, say) never restarts them.
 */
const BackgroundServices = memo(function BackgroundServices() {
  useUpkeep();
  useStepTracking();
  useNotifications();
  const pathname = usePathname();
  const paused = useDebugStore((s) => debugEnabled(s) && s.pauseBackgroundHooks) && pathname !== '/';
  useAutoGather(paused);
  usePatrols(paused);
  return null;
});

/** The screens' headers, module-level so the stack's options stay stable. */
const ForgeHeader = () => <ScreenHeader title={t('screens.forge')} />;
const InfuseHeader = () => <ScreenHeader title={t('screens.infuse')} />;
const ProvisionsHeader = () => <ScreenHeader title={t('screens.provisions')} />;
const InventoryHeader = () => <ScreenHeader title={t('screens.storeroom')} right={<HeaderGold />} />;
const TeamHeader = () => <ScreenHeader title={t('screens.barracks')} />;
const QuestsHeader = () => <ScreenHeader title={t('screens.quests')} />;
const GuildHeader = () => <ScreenHeader title={t('screens.guild')} right={<HeaderGold />} />;
const SettingsHeader = () => <ScreenHeader title={t('screens.settings')} />;
const CreditsHeader = () => <ScreenHeader title={t('settings.credits')} />;
const TipsHeader = () => <ScreenHeader title={t('settings.fieldNotes')} />;

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
  const [fontsLoaded, fontError] = useFonts({
    [fonts.body]: require('../../assets/fonts/FantaisieArtistique.ttf'),
    [fonts.serif]: Alegreya_500Medium,
    [fonts.serifBold]: Alegreya_700Bold,
  });

  const insets = useSafeAreaInsets();
  // Room for the plank bar on every screen; the map places its own controls and needs none.
  const below = useMemo(() => ({ paddingBottom: ISLAND_HEIGHT + insets.bottom }), [insets.bottom]);
  const wood = useMemo(() => [{ backgroundColor: ui.woodDark }, below], [below]);
  // Memoized so the stack never reconfigures a screen for an options object it
  // cannot tell apart from the last one; the headers are module-level for the
  // same reason. Rebuilt when the language or the safe area changes.
  const noAnimation = useDebugStore((s) => debugEnabled(s) && s.noScreenAnimation);
  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.wood },
      headerTintColor: colors.parchment,
      headerTitleStyle: { fontFamily: fonts.body, fontSize: 26 },
      headerBackTitleStyle: { fontFamily: fonts.body },
      contentStyle: [{ backgroundColor: colors.parchment }, below],
      ...(noAnimation ? { animation: 'none' as const } : {}),
    }),
    [below, noAnimation],
  );
  const options = useMemo(
    () => ({
      map: { title: t('screens.map'), headerShown: false, contentStyle: { paddingBottom: 0 } },
      forge: { title: t('screens.forge'), header: ForgeHeader, contentStyle: wood },
      infuse: { title: t('screens.infuse'), header: InfuseHeader, contentStyle: wood },
      provisions: { title: t('screens.provisions'), header: ProvisionsHeader, contentStyle: wood },
      inventory: { title: t('screens.inventory'), header: InventoryHeader, contentStyle: wood },
      team: { title: t('screens.team'), header: TeamHeader, contentStyle: wood },
      hero: { title: t('screens.hero') },
      classes: { title: t('classes.title') },
      expeditions: { title: t('screens.expeditions') },
      quests: { title: t('screens.quests'), header: QuestsHeader, contentStyle: wood },
      guild: { title: t('screens.guild'), header: GuildHeader, contentStyle: wood },
      settings: { title: t('screens.settings'), header: SettingsHeader, contentStyle: wood },
      credits: { title: t('settings.credits'), header: CreditsHeader, contentStyle: wood },
      tips: { title: t('screens.tips'), header: TipsHeader, contentStyle: wood },
      debug: { title: t('screens.debug') },
    }),
    // The titles are translated, so the language (already applied by useLanguage)
    // is a real dependency, even though only `t` reads it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wood, locale],
  );

  // On a load error, fall back to the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={styles.root}>
      <BackgroundServices />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" dangerouslySingular options={options.map} />
        <Stack.Screen name="forge" dangerouslySingular options={options.forge} />
        <Stack.Screen name="infuse" dangerouslySingular options={options.infuse} />
        <Stack.Screen name="provisions" dangerouslySingular options={options.provisions} />
        <Stack.Screen name="inventory" dangerouslySingular options={options.inventory} />
        <Stack.Screen name="team/index" dangerouslySingular options={options.team} />
        <Stack.Screen name="team/[heroId]" dangerouslySingular options={options.hero} />
        <Stack.Screen name="team/classes" dangerouslySingular options={options.classes} />
        <Stack.Screen name="expeditions" dangerouslySingular options={options.expeditions} />
        <Stack.Screen name="quests" dangerouslySingular options={options.quests} />
        <Stack.Screen name="guild" dangerouslySingular options={options.guild} />
        <Stack.Screen name="settings" dangerouslySingular options={options.settings} />
        <Stack.Screen name="settings/credits" dangerouslySingular options={options.credits} />
        <Stack.Screen name="tips" dangerouslySingular options={options.tips} />
        <Stack.Screen name="debug" dangerouslySingular options={options.debug} />
      </Stack>
      <IslandMenu />
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
      <Price amount={gold} size={14} textStyle={styles.goldAmount} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gold: { minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  goldAmount: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.gold },
});
