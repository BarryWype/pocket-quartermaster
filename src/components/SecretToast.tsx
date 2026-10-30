import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { placeInfo } from '@/content/places';
import { distanceMeters } from '@/game/generation/geo';
import { hasKey, keyDots, keysHeld } from '@/game/secrets/keys';
import { activeTip, tipPosition } from '@/game/secrets/tips';
import { formatDistance, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors } from '@/theme';

import { Text } from './Text';

/**
 * Over any screen: a new tip, with what it takes to get in, and a completed
 * key while a tipped place waits.
 */
export function SecretToast() {
  const insets = useSafeAreaInsets();
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        // Loading the save is not a find.
        if (!useGameStore.persist.hasHydrated()) return;
        const { save } = state;
        const known = new Set(previous.save.secretTips.map((tip) => tip.id));
        const fresh = save.secretTips.filter((tip) => !known.has(tip.id));
        if (fresh.length > 0) {
          const info = placeInfo[fresh[0].secret];
          setLines([
            t('secrets.found', { emoji: info.emoji, name: tr(info.name) }),
            hasKey(save) ? t('secrets.haveKey', { count: keysHeld(save) }) : t('secrets.needKey', { dots: keyDots(save) }),
          ]);
          return;
        }
        if (keysHeld(save) <= keysHeld(previous.save)) return;
        const now = Date.now();
        const waiting = (['hiddenDen', 'blackMarket', 'underwaterDungeon'] as const)
          .map((secret) => activeTip(save, secret, now))
          .find((tip) => tip !== undefined);
        if (!waiting) return;
        const player = useWorldStore.getState().player;
        const position = tipPosition(waiting, () => false);
        const distance = player && position ? formatDistance(distanceMeters(player, position)) : '?';
        setLines([t('secrets.keyReady', { name: tr(placeInfo[waiting.secret].name), distance })]);
      }),
    [],
  );

  useEffect(() => {
    if (!lines) return;
    const timer = setTimeout(() => setLines(null), 6000);
    return () => clearTimeout(timer);
  }, [lines]);

  if (!lines) return null;
  return (
    <View pointerEvents="none" style={[styles.wrapper, { top: insets.top + 8 }]}>
      <View style={styles.banner}>
        {lines.map((line) => (
          <Text key={line} style={styles.text}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  banner: { overflow: 'hidden', borderRadius: 12, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 6 },
  text: { color: colors.parchment, fontSize: 18 },
});
