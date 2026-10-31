import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { gainsPrefix, lootLabels } from '@/components/lootText';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { GainsLine } from './IconLabel';
import { Row, SectionTitle } from './Row';
import { Text } from './Text';

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
      <SectionTitle>{t('chests.title', { steps: formatNumber(steps) })}</SectionTitle>
      {stepChests.map((chest, index) => {
        const state = chestState(save, chest, steps, day);
        return (
          <Row
            key={chest.id}
            emoji={index < 2 ? '📦' : '🧰'}
            title={t('chests.name', { steps: formatNumber(chest.steps) })}
            right={
              state === 'opened' ? (
                t('chests.opened')
              ) : (
                <Button title={t('chests.open')} disabled={state === 'locked'} onPress={() => open(chest.id)} />
              )
            }
          />
        );
      })}
      {message && (
        <View style={styles.rewardRow}>
          <Text style={styles.reward}>{message.text}</Text>
          {message.gains.length > 0 && <GainsLine gains={message.gains} labelStyle={styles.reward} />}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  reward: { paddingVertical: 8 },
});
