import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { items } from '@/content/items';
import { itemById } from '@/content/lookup';
import { activeWalkEffects, replacesActive } from '@/game/gathering/walkEffects';
import type { LatLng } from '@/game/generation/types';
import { useNow } from '@/hooks/useNow';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Row } from './Row';
import { Text } from './Text';
import { Tip } from './Tip';

const walkItems = items.filter((item) => item.slot === 'utility' && item.walk);

const timeLeft = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

/** The map's walking consumables: a round button opening the ones in stock, and a countdown chip per running effect. */
export function WalkEffects({ player, buttonStyle, chipsStyle }: {
  player: LatLng;
  buttonStyle: StyleProp<ViewStyle>;
  chipsStyle: StyleProp<ViewStyle>;
}) {
  // Its own clock, so the seconds tick without re-rendering the whole map.
  const now = useNow();
  const save = useGameStore((state) => state.save);
  const startWalkEffect = useGameStore((state) => state.startWalkEffect);
  const [open, setOpen] = useState(false);
  const held = walkItems.filter((item) => (save.consumables[item.id] ?? 0) > 0);
  const active = activeWalkEffects(save, now);

  const use = (itemId: string) => {
    const start = () => {
      startWalkEffect(itemId, player);
      setOpen(false);
    };
    if (!replacesActive(save, itemId, now)) return start();
    Alert.alert(t('walkEffects.replaceTitle'), t('walkEffects.replaceBody', { item: tr(itemById[itemId].name) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('walkEffects.replace'), onPress: start },
    ]);
  };

  return (
    <>
      {held.length > 0 && (
        <Pressable accessibilityLabel={t('walkEffects.title')} onPress={() => setOpen(true)} style={[styles.button, buttonStyle]}>
          <Text style={styles.buttonEmoji}>🧴</Text>
        </Pressable>
      )}
      {active.length > 0 && (
        <View style={[styles.chips, chipsStyle]}>
          {active.map((effect) => {
            const item = itemById[effect.itemId];
            return (
              <Tip key={effect.id} title={tr(item.name)} text={tr(item.description ?? '')}>
                <View style={styles.chip}>
                  <GameIcon emoji={item.emoji} size={18} />
                  <Text style={styles.chipText}>
                    {timeLeft(effect.endsAt - now)} ⓘ
                  </Text>
                </View>
              </Tip>
            );
          })}
        </View>
      )}
      {open && (
        <Overlay onClose={() => setOpen(false)} position="bottom">
          <Sheet title={t('walkEffects.title')} bodyStyle={styles.body}>
            {held.map((item) => (
              <Row
                key={item.id}
                emoji={item.emoji}
                title={`${tr(item.name)} ×${save.consumables[item.id]}`}
                subtitle={tr(item.description ?? '')}
                right={<Button title={t('walkEffects.use')} onPress={() => use(item.id)} />}
              />
            ))}
          </Sheet>
        </Overlay>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  buttonEmoji: { fontSize: 24 },
  chips: { position: 'absolute', right: 16, gap: 4, alignItems: 'flex-end' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: colors.parchment },
  body: { gap: 8 },
});
