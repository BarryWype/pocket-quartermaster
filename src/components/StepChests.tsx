import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { gainsPrefix, lootLabels } from '@/components/lootText';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { GainsLine, RewardLabel } from './IconLabel';
import { GameIcon } from './GameIcon';
import { Text } from './Text';
import { EmberButton, ParchmentCard } from './ui';

export function StepChests() {
  const steps = useTodaySteps();
  const save = useGameStore((state) => state.save);
  const openChest = useGameStore((state) => state.openChest);
  const [message, setMessage] = useState<{ text: string; gains: string[] } | null>(null);
  const day = dayKey(new Date());

  const open = (chestId: string) => {
    const gains = lootLabels(openChest(chestId, steps));
    setMessage(gains.length > 0 ? { text: gainsPrefix(t('chests.reward', { reward: '' })), gains } : { text: t('chests.nothing'), gains: [] });
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
          {message.gains.length > 0 && <GainsLine gains={message.gains} labelStyle={styles.reward} />}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: ui.parchment,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  reward: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
});
