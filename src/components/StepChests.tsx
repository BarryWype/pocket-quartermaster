import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { gainsPrefix } from '@/components/lootText';
import { lootTiles, type RewardTile } from '@/game/loot/tiles';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { RewardLabel } from './IconLabel';
import { LootGrid } from './LootGrid';
import { GameIcon } from './GameIcon';
import { Text } from './Text';
import { EmberButton, ParchmentCard } from './ui';

export function StepChests() {
  const steps = useTodaySteps();
  const save = useGameStore((state) => state.save);
  const openChest = useGameStore((state) => state.openChest);
  const [message, setMessage] = useState<{ chestId: string; text: string; tiles: RewardTile[] } | null>(null);
  const day = dayKey(new Date());

  const open = (chestId: string) => {
    const before = useGameStore.getState().save;
    const tiles = lootTiles(openChest(chestId, steps), { before });
    setMessage({ chestId, text: tiles.length > 0 ? gainsPrefix(t('chests.reward', { reward: '' })) : t('chests.nothing'), tiles });
  };

  return (
    <>
      <Text style={styles.title}>{t('chests.title', { steps: formatNumber(steps) })}</Text>
      {stepChests.map((chest, index) => {
        const state = chestState(save, chest, steps, day);
        return (
          <ParchmentCard key={chest.id} contentStyle={styles.chest}>
            <View style={styles.chestIcon}>
              <GameIcon emoji={index < 2 ? '📦' : '🧰'} size={26} />
            </View>
            <View style={styles.chestBody}>
              <Text style={styles.chestName}>{t('chests.name', { steps: formatNumber(chest.steps) })}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(1, steps / chest.steps) * 100}%` }]} />
              </View>
            </View>
            {state === 'opened' ? (
              <Text style={styles.opened}>{t('chests.opened')}</Text>
            ) : (
              <EmberButton title={t('chests.open')} compact disabled={state === 'locked'} onPress={() => open(chest.id)} />
            )}
          </ParchmentCard>
        );
      })}
      {message && (
        <View style={styles.rewardRow}>
          <RewardLabel text={message.text} labelStyle={styles.reward} />
          {message.tiles.length > 0 && <LootGrid key={message.chestId} tiles={message.tiles} reveal />}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, color: ui.brassLight },
  chest: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chestIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.brass,
  },
  chestBody: { flex: 1, gap: 4 },
  chestName: { fontSize: 20, color: ui.ink },
  opened: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
  barTrack: { height: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  barFill: { height: '100%', backgroundColor: ui.hp },
  rewardRow: {
    gap: 8,
    padding: 8,
    backgroundColor: ui.parchment,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  reward: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
});
