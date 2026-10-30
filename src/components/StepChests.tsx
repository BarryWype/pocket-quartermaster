import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { chestState, dayKey, stepChests } from '@/game/rewards/chests';
import { lootText } from '@/hooks/usePatrols';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { Row, SectionTitle } from './Row';
import { Text } from './Text';

export function StepChests() {
  const steps = useTodaySteps();
  const save = useGameStore((state) => state.save);
  const openChest = useGameStore((state) => state.openChest);
  const [message, setMessage] = useState<string | null>(null);
  const day = dayKey(new Date());

  const open = (chestId: string) => {
    setMessage(lootText(openChest(chestId, steps)) || t('chests.nothing'));
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
      {message && <Text style={styles.reward}>{t('chests.reward', { reward: message })}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  reward: { paddingVertical: 8 },
});
