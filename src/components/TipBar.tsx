import { Pressable, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextTip, tipText } from '@/game/reveal/reveal';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { ISLAND_HEIGHT } from './IslandMenu';
import { Text } from './Text';

/** Over the map only: the oldest tip waiting, one at a time; a tap closes it for good (Settings → Tips keeps it). */
export function TipBar() {
  const insets = useSafeAreaInsets();
  const onMap = usePathname() === '/';
  const tip = useGameStore((state) => nextTip(state.save, onMap));
  const closeTip = useGameStore((state) => state.closeTip);
  if (!tip) return null;

  return (
    <Pressable onPress={() => closeTip(tip)} style={[styles.bar, { bottom: insets.bottom + ISLAND_HEIGHT + 56 }]}>
      <Text style={styles.text}>💡 {tipText(tip)}</Text>
      <Text style={styles.close}>{t('tips.close')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.wood,
  },
  text: { color: colors.parchment, fontSize: 20 },
  close: { color: colors.parchment, fontSize: 16, opacity: 0.8, marginTop: 4 },
});
