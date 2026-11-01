import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameIcon } from '@/components/GameIcon';
import { Price } from '@/components/Price';
import { Text } from '@/components/Text';
import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { navigate } from '@/services/navigation';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

/** The bar's own height below the safe-area inset; overlays sit below this much again. */
export const TOP_BAR_HEIGHT = 58;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** The plank bar over the map: tier, gold, the next step chest, and settings. */
export function MapTopBar() {
  const insets = useSafeAreaInsets();
  const save = useGameStore((state) => state.save);
  const debugOn = useDebugStore(debugEnabled);
  const steps = useTodaySteps();
  const day = dayKey(new Date());
  const chest =
    stepChests.find((candidate) => chestState(save, candidate, steps, day) !== 'opened') ??
    stepChests[stepChests.length - 1];
  const tier = highestUnlockedTier(save);
  const progress = chest ? Math.min(1, steps / chest.steps) : 0;
  const total = insets.top + 6 + 52;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6, height: total }]}>
      <View style={styles.seams} pointerEvents="none">
        {Array.from({ length: Math.ceil(total / 16) }, (_, i) => (
          <View key={i} style={[styles.seam, { top: (i + 1) * 16 }]} />
        ))}
      </View>
      <View style={styles.brassLine} pointerEvents="none" />
      <View style={styles.row}>
        <Text style={styles.tier}>{t('map.tier', { tier: ROMAN[tier - 1] ?? tier })}</Text>
        <View style={styles.gold}>
          <Price amount={save.gold} size={16} textStyle={styles.goldAmount} />
        </View>
        <View style={styles.chest}>
          <Text style={styles.chestLabel}>{t('map.nextChest')}</Text>
          <View style={styles.chestTrack}>
            <View style={[styles.chestFill, { width: `${progress * 100}%` }]} />
          </View>
          {chest && (
            <Text style={styles.chestCount}>
              {formatNumber(steps)} / {formatNumber(chest.steps)}
            </Text>
          )}
        </View>
        {debugOn && (
          <Pressable accessibilityLabel={t('map.debug')} onPress={() => navigate('/debug')} style={styles.button}>
            <View style={styles.buttonRim} pointerEvents="none" />
            <GameIcon emoji="🐞" size={22} />
          </Pressable>
        )}
        <Pressable accessibilityLabel={t('screens.settings')} onPress={() => navigate('/settings')} style={styles.button}>
          <View style={styles.buttonRim} pointerEvents="none" />
          <GameIcon emoji="⚙️" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderColor: ui.outline,
  },
  seams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  seam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  brassLine: { position: 'absolute', left: 0, right: 0, bottom: 3, height: 3, backgroundColor: ui.brass },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  tier: { fontFamily: fonts.body, fontSize: 18, color: ui.brassLight },
  gold: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goldAmount: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.gold },
  chest: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chestLabel: { fontFamily: fonts.serif, fontSize: 12, color: ui.onWoodMuted },
  chestTrack: { flex: 1, height: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDeep },
  chestFill: { height: '100%', backgroundColor: ui.xp },
  chestCount: { fontFamily: fonts.serif, fontSize: 12, color: ui.onWood },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.woodDark,
  },
  buttonRim: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 2, borderColor: ui.brass },
});
